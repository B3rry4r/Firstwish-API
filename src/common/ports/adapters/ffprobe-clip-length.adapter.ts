import { execFile } from "node:child_process";
import { ClipLengthInput, ClipLengthPort } from "../clip-length.port";

export type SignGet = (key: string) => Promise<string>;
export type Run = (file: string, args: string[], timeoutMs: number) => Promise<string>;

const runFile: Run = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (err, stdout) => (err ? reject(new Error(err.message)) : resolve(String(stdout))));
  });

/**
 * The real clip length (IL1a): ffprobe reads the stored file through a short-lived signed address and prints its length. The tool is a deploy item: a server
 * with no ffprobe on its path answers null for every clip, so every clip is refused (nothing unchecked is kept). No shell is used; the address is one argument.
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
    try {
      const url = await this.sign(input.key);
      const out = await this.run(this.tool, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", url], this.timeoutMs);
      const seconds = Number(out.trim().split(/\s+/)[0]);
      return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
    } catch {
      return null;
    }
  }
}
