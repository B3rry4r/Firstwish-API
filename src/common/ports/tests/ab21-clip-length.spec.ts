import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containerLengthMs } from "../adapters/clip-container";
import { FfprobeClipLength } from "../adapters/ffprobe-clip-length.adapter";
import { MissingClipLength } from "../clip-length.port";
import { MP4 } from "../../../modules/stored-files/tests/files-kit";

/** API-BASE-21 (IL1a): the clip length is read from the file: the header reader the stand-in uses, and the real ffprobe adapter behind its port. */
describe("clip length", () => {
  it("reads an MP4's own header, and answers null for a file with no length in it", () => {
    expect(containerLengthMs(MP4(15))).toBe(15000);
    expect(containerLengthMs(MP4(0.04))).toBe(40);
    expect(containerLengthMs(Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypisom"), Buffer.alloc(40, 1)]))).toBeNull();
    expect(containerLengthMs(MP4(15).subarray(0, 30))).toBeNull(); // the header is cut short: no guess
    expect(containerLengthMs(Buffer.alloc(0))).toBeNull();
    expect(containerLengthMs(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]))).toBeNull(); // a WebM with no Segment
  });

  it("the adapter takes the length from the tool's answer, never throws, and answers null when the tool is missing, fails or says nothing", async () => {
    const seen: string[][] = [];
    const ok = new FfprobeClipLength((k) => Promise.resolve(`https://signed.invalid/${k}`), (_f, args) => (seen.push(args), Promise.resolve("14.987000\n")));
    expect(await ok.lengthMs({ key: "video-clip/a/b", contentType: "video/mp4" })).toBe(14987);
    expect(seen[0].at(-1)).toBe("https://signed.invalid/video-clip/a/b"); // the address is one argument, no shell
    const gone = new FfprobeClipLength((k) => Promise.resolve(k), () => Promise.reject(new Error("spawn ffprobe ENOENT")));
    expect(await gone.lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    const nothing = new FfprobeClipLength((k) => Promise.resolve(k), () => Promise.resolve("N/A\n"));
    expect(await nothing.lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    const noSign = new FfprobeClipLength(() => Promise.reject(new Error("no storage")), () => Promise.resolve("3"));
    expect(await noSign.lengthMs({ key: "k", contentType: "video/mp4" })).toBeNull();
    expect(await new MissingClipLength().lengthMs()).toBeNull();
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
