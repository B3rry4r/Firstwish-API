import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_MEDIA_BYTES, MediaCleanInput, MediaCleanPort, MediaCleanResult, MediaToolUnavailable } from "../media-clean.port";
import { PING_OK, type PortPing, pingError } from "../ping";
import { StoragePort } from "../storage.port";

export type Run = (file: string, args: string[], timeoutMs: number) => Promise<string>;

const runFile: Run = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 256 * 1024 }, (err, stdout) =>
      err ? reject(Object.assign(new Error(err.message), { code: (err as NodeJS.ErrnoException).code, killed: err.killed })) : resolve(String(stdout)),
    );
  });

/** What each accepted audio and video type is read as and written as. The reader is named so a file can never be read as anything else (no playlist, no concat list: no file or address in it is followed). */
const FORMAT: Record<string, { read: string; write: string; video: boolean }> = {
  "audio/mp4": { read: "mov,mp4,m4a,3gp,3g2,mj2", write: "mp4", video: false },
  "audio/x-m4a": { read: "mov,mp4,m4a,3gp,3g2,mj2", write: "mp4", video: false },
  "audio/webm": { read: "matroska,webm", write: "webm", video: false },
  "audio/mpeg": { read: "mp3", write: "mp3", video: false },
  "audio/ogg": { read: "ogg", write: "ogg", video: false },
  "audio/wav": { read: "wav", write: "wav", video: false },
  "video/mp4": { read: "mov,mp4,m4a,3gp,3g2,mj2", write: "mp4", video: true },
  "video/quicktime": { read: "mov,mp4,m4a,3gp,3g2,mj2", write: "mov", video: true },
  "video/webm": { read: "matroska,webm", write: "webm", video: true },
};
export const isCleanableMedia = (contentType: string): boolean => contentType in FORMAT;

const REFUSED = "We could not rewrite this file to remove where and how it was recorded. Send a different recording (an MP3, M4A, MP4 or WebM that plays).";

/**
 * The real media cleaner (IM3): ffmpeg, `-map_metadata -1 -c copy`, and what that flag alone misses:
 *  - `-map 0:a` (a sound) or `-map 0:V -map 0:a?` (a video): a cover picture inside a sound, or a thumbnail inside a video, is a picture that can hold its own EXIF
 *    position; only the real audio and video streams are carried (`V` leaves out attached pictures);
 *  - `-map_chapters -1`, `-dn` (data tracks: a phone's timed location track), `-sn`;
 *  - `-movflags +faststart` for MP4 and MOV: the index stays at the front, as a browser plays it while it loads;
 *  - `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact`: the muxer writes no encoder name, version or tool tag of its own.
 * The input is read as the declared type only (`-f`) and `-protocol_whitelist file`, so nothing inside a file is followed. The file is written in a private
 * temporary folder that is always removed. A missing or timed-out tool throws MediaToolUnavailable (503, nothing kept); a file ffmpeg cannot read or rewrite
 * rejects with plain words. The words never carry ffmpeg's own text.
 */
export class FfmpegMediaClean extends MediaCleanPort {
  constructor(
    private readonly storage: StoragePort,
    private readonly run: Run = runFile,
    private readonly tool = "ffmpeg",
    private readonly probe = "ffprobe",
    private readonly timeoutMs = 120_000,
  ) {
    super();
  }

  /** FB4: both tools answer their version, no network. The error names the one that is missing. */
  async ping(): Promise<PortPing> {
    for (const t of [this.tool, this.probe]) {
      try {
        await this.run(t, ["-version"], 10_000);
      } catch (e) {
        const x = e as { code?: unknown };
        return pingError(x.code === "ENOENT" || x.code === "EACCES" ? `${t} is not installed on the server, so voices, clips and videos are refused until it is.` : `${t} did not run.`);
      }
    }
    return PING_OK;
  }

  async clean(input: MediaCleanInput): Promise<MediaCleanResult> {
    const type = input.contentType.toLowerCase().split(";")[0].trim();
    const f = FORMAT[type];
    if (!f) throw new Error(REFUSED);
    const source = await this.storage.readObject(input.key, MAX_MEDIA_BYTES);
    if (!source) throw new Error("The file is not in storage.");
    const dir = await mkdtemp(join(tmpdir(), "fw-media-"));
    try {
      const from = join(dir, "in.bin");
      const to = join(dir, "out.bin");
      await writeFile(from, source);
      const maps = f.video ? ["-map", "0:V", "-map", "0:a?"] : ["-map", "0:a"];
      const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-protocol_whitelist", "file", "-f", f.read, "-i", from, ...maps, "-map_metadata", "-1", "-map_chapters", "-1", "-dn", "-sn", "-c", "copy", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", ...(f.write === "mp4" || f.write === "mov" ? ["-movflags", "+faststart"] : []), "-f", f.write, to];
      try {
        await this.run(this.tool, args, this.timeoutMs);
      } catch (e) {
        const x = e as { code?: unknown; killed?: unknown };
        // the tool missing, not allowed, or killed by the time limit is the SERVER's fault; any other failure is the file's
        if (x.code === "ENOENT" || x.code === "EACCES" || x.killed === true) throw new MediaToolUnavailable("ffmpeg did not run");
        throw new Error(REFUSED, { cause: e });
      }
      const bytes = await readFile(to).catch(() => null);
      if (!bytes || bytes.length === 0) throw new Error(REFUSED);
      await this.storage.putObject(input.key, bytes, type);
      return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
