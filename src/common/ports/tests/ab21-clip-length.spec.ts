import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containerLengthMs } from "../adapters/clip-container";
import { FfprobeClipLength } from "../adapters/ffprobe-clip-length.adapter";
import { ClipToolUnavailable, MissingClipLength } from "../clip-length.port";
import { MP4 } from "../../../modules/stored-files/tests/files-kit";

/** API-BASE-21 (IL1a): the clip length is read from the file: the header reader the stand-in uses, and the real ffprobe adapter behind its port. */
describe("clip length", () => {
  it("reads an MP4's own header, and answers null for a file with no length in it", () => {
    expect(containerLengthMs(MP4(15))).toBe(15000);
    expect(containerLengthMs(MP4(0.04))).toBe(40);
    expect(containerLengthMs(Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypisom"), Buffer.alloc(40, 1)]))).toBeNull();
    expect(containerLengthMs(MP4(15).subarray(0, 30))).toBeNull(); // the header is cut short: no guess
    expect(containerLengthMs(Buffer.alloc(0))).toBeNull();
    expect(containerLengthMs(MP4(10, 64, "soun"))).toBeNull(); // M3: no video track in the header is not a clip
    expect(containerLengthMs(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]))).toBeNull(); // a WebM with no Segment
  });

  const json = (seconds: string, ...kinds: string[]) => JSON.stringify({ format: { duration: seconds }, streams: kinds.map((k) => ({ codec_type: k, disposition: { attached_pic: 0 } })) });
  it("the adapter takes the length from the tool's answer; a bad file is null; a missing or timed-out tool is not the file's fault (throws)", async () => {
    const seen: string[][] = [];
    const ok = new FfprobeClipLength((k) => Promise.resolve(`https://signed.invalid/${k}`), (_f, args) => (seen.push(args), Promise.resolve(json("14.987000", "video", "audio"))));
    expect(await ok.lengthMs({ key: "video-clip/a/b", contentType: "video/mp4" })).toBe(14987);
    expect(seen[0].at(-1)).toBe("https://signed.invalid/video-clip/a/b"); // the address is one argument, no shell
    const probe = (run: () => Promise<string>) => new FfprobeClipLength((k) => Promise.resolve(k), run);
    // M3: no video stream (audio only, or a cover picture inside it) is a bad file
    expect(await probe(() => Promise.resolve(json("10", "audio"))).lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    const cover = JSON.stringify({ format: { duration: "10" }, streams: [{ codec_type: "audio" }, { codec_type: "video", disposition: { attached_pic: 1 } }] });
    expect(await probe(() => Promise.resolve(cover)).lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    expect(await probe(() => Promise.resolve("N/A\n")).lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    expect(await probe(() => Promise.resolve(json("N/A", "video"))).lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    // a failed read of the file (ffprobe exits with an error) is the file's
    expect(await probe(() => Promise.reject(new Error("Invalid data found"))).lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    // L6: the tool missing, not allowed, or killed by the time limit, or no address for the file: the server's
    for (const why of [{ code: "ENOENT" }, { code: "EACCES" }, { killed: true }]) {
      await expect(probe(() => Promise.reject(Object.assign(new Error("x"), why))).lengthMs({ key: "k", contentType: "video/mp4" })).rejects.toBeInstanceOf(ClipToolUnavailable);
    }
    const noSign = new FfprobeClipLength(() => Promise.reject(new Error("no storage")), () => Promise.resolve(json("3", "video")));
    await expect(noSign.lengthMs({ key: "k", contentType: "video/mp4" })).rejects.toBeInstanceOf(ClipToolUnavailable);
    await expect(new MissingClipLength().lengthMs()).rejects.toBeInstanceOf(ClipToolUnavailable);
  });

  const has = (tool: string): boolean => spawnSync(tool, ["-version"]).status === 0;
  (has("ffmpeg") && has("ffprobe") ? it : it.skip)("real files: the header reader and ffprobe agree on an MP4 and a WebM of 2.5 seconds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ab21-clip-"));
    try {
      const mp4 = join(dir, "a.mp4");
      const webm = join(dir, "a.webm");
      const src = ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=2.5"];
      expect(spawnSync("ffmpeg", [...src, "-c:v", "libx264", "-movflags", "+faststart", mp4]).status).toBe(0);
      expect(spawnSync("ffmpeg", [...src, "-c:v", "libvpx", webm]).status).toBe(0);
      const probe = new FfprobeClipLength((k) => Promise.resolve(k));
      for (const f of [mp4, webm]) {
        const viaTool = await probe.lengthMs({ key: f, contentType: "video/mp4" });
        const viaHeader = containerLengthMs(readFileSync(f));
        expect(viaTool).toBeGreaterThan(2400);
        expect(viaTool).toBeLessThan(2700);
        expect(Math.abs((viaHeader ?? 0) - (viaTool ?? 0))).toBeLessThan(150);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
