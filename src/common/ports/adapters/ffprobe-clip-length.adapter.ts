import { execFile } from "node:child_process";
import { ClipLengthInput, ClipLengthPort, ClipToolUnavailable } from "../clip-length.port";

export type SignGet = (key: string) => Promise<string>;
export type Run = (file: string, args: string[], timeoutMs: number) => Promise<string>;

const runFile: Run = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => (err ? reject(Object.assign(new Error(err.message), { code: (err as NodeJS.ErrnoException).code, killed: err.killed })) : resolve(String(stdout))));
  });

/**
 * The real clip length (IL1a): ffprobe reads the stored file through a short-lived signed address and prints its length and its stream kinds (a clip must hold a
 * video stream). The tool is a deploy item: a server with no ffprobe on its path, or one that times out, throws ClipToolUnavailable (503, nothing is kept). No shell is used; the address is one argument.
 */
export class FfprobeClipLength extends ClipLengthPort {
  constructor(
    private readonly sign: SignGet,
    private readonly run: Run = runFile,
    private readonly tool = "ffprobe",
    private readonly timeoutMs = 25_000,
  ) {
    super();
  }

  async lengthMs(input: ClipLengthInput): Promise<number | null> {
    let url: string;
    try {
      url = await this.sign(input.key);
    } catch {
      throw new ClipToolUnavailable("the stored file could not be addressed");
    }
    let out: string;
    try {
      out = await this.run(this.tool, ["-v", "error", "-show_entries", "format=duration:stream=codec_type:stream_disposition=attached_pic", "-of", "json", url], this.timeoutMs);
    } catch (e) {
      const x = e as { code?: unknown; killed?: unknown };
      // the tool missing (ENOENT, EACCES) or killed by the time limit is the SERVER's fault (503); any other failure is the file's (a file ffprobe cannot read)
      if (x.code === "ENOENT" || x.code === "EACCES" || x.killed === true) throw new ClipToolUnavailable("ffprobe did not run");
      return null;
    }
    try {
      const j = JSON.parse(out) as { format?: { duration?: unknown }; streams?: { codec_type?: string; disposition?: { attached_pic?: number } }[] };
      // M3: a clip holds a VIDEO stream (a cover picture inside an audio file is not one)
      if (!(j.streams ?? []).some((s) => s.codec_type === "video" && !s.disposition?.attached_pic)) return null;
      const seconds = Number(j.format?.duration);
      return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
    } catch {
      return null;
    }
  }
}
