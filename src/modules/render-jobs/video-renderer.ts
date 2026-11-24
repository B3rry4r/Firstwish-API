import { createWriteStream, existsSync } from "node:fs";
import { appendFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { PrismaService } from "../../common/db/prisma.service";
import { PING_STAND_IN, type PortPing, pingError } from "../../common/ports/ping";

export type RenderKind = "status-video" | "keepsake-export";

export interface RenderRequest {
  wishId: string;
  /** N3: the render job's id; the file the renderer writes is named fw-render-<jobId>-..., and the job takes back only a file with its own id in the name. */
  jobId?: string;
  kind: RenderKind;
  width: number;
  height: number;
  seconds: number;
  /** R3: the one-use token the render page reads the wish with (GET /v1/render/:token/wish). Held in memory by the renderer; never logged, stored or queued in the clear. */
  token?: string;
}

/** R1: the renderer's result is a FILE on disk (a minute of 1080 x 1920 video is tens of MB; it is never held whole in memory). The job streams it to the file store and removes it. */
export interface RenderedFile {
  /** Where the finished file is. The caller (the job) owns it from here and removes it after a success and after a failure. */
  path: string;
  contentType: string;
  /** The size of the file in bytes. */
  bytes: number;
}

/** The name every temp file of a render starts with, so a test (and an operator) can see what a render left behind. */
export const RENDER_TEMP_PREFIX = "fw-render-";

/**
 * The video renderer is a port. The real renderer is not built in this bundle: with none configured, `configured()` is false and
 * the ask answers 503 video_unavailable; a made-up file is never returned. Tests use StandinVideoRenderer.
 */
export abstract class VideoRenderer {
  abstract configured(): boolean;
  /** FB4: a real renderer makes one cheap read of its service and answers ok or its error; a stand-in answers "stand-in". */
  abstract ping(): Promise<PortPing>;
  /**
   * `signal` is aborted when the job's time limit ends or the wish is erased (R1): a real renderer stops its children, removes what it wrote
   * and rejects. A renderer that rejects leaves no file behind; one that resolves hands the file to the job.
   */
  abstract render(input: RenderRequest, signal?: AbortSignal): Promise<RenderedFile>;
}

/** What production binds until a renderer exists. */
export class NoVideoRenderer extends VideoRenderer {
  configured(): boolean {
    return false;
  }
  ping(): Promise<PortPing> {
    return Promise.resolve(pingError("No video renderer is configured."));
  }
  render(): Promise<RenderedFile> {
    return Promise.reject(new Error("no video renderer is configured"));
  }
}

/**
 * The test stand-in: a small marked file on disk, or a failure on demand. A test may ask for a big file (`fileBytes`, written in
 * pieces), make a render wait (`hold`, which a first call may take alone with `holdFirstOnly`) and read what overlapped (`maxActive`).
 * It watches the abort like a real renderer: on abort it removes its file and rejects.
 */
export class StandinVideoRenderer extends VideoRenderer {
  readonly rendered: RenderRequest[] = [];
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }
  failWith: string | null = null;
  /** A test turns the renderer off to see the 503. */
  on = true;
  /** When set, the file is this many bytes (written in 1 MB pieces, never whole in memory); else a small marked file. */
  fileBytes: number | null = null;
  /** When set, a render waits for it (or for the abort) after it has written its file. */
  hold: Promise<void> | null = null;
  /** true: only the first render waits for `hold`. */
  holdFirstOnly = false;
  /** How many renders ran at once now, the most at once, and how many saw an abort. */
  active = 0;
  maxActive = 0;
  aborted = 0;
  /** Milliseconds each render takes (real time), so two asked videos can be seen to overlap or not. */
  takes = 0;
  /** IK7 (test stacks only): when set, each render appends one JSON line with its token to this file (mode 0600) before anything else; never to a log. */
  tokenFile: string | null = null;
  /** IK7: when set, a render waits after its line until this answers true (the job's token is spent), the abort, or `holdSeconds`, then writes its file. */
  holdUntilSpent: ((input: RenderRequest) => Promise<boolean>) | null = null;
  holdSeconds = 120;
  /** IK7a: when set (with the hold on), a render holds only if this file exists at the moment it starts; removing it later does not end a running hold. */
  holdFile: string | null = null;
  configured(): boolean {
    return this.on;
  }
  async render(input: RenderRequest, signal?: AbortSignal): Promise<RenderedFile> {
    this.rendered.push(input);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    let path: string | null = null;
    try {
      if (this.tokenFile && input.token) {
        const { jobId, wishId, kind, width, height, seconds, token } = input;
        await appendFile(this.tokenFile, `${JSON.stringify({ jobId, wishId, kind, width, height, seconds, token })}\n`, { mode: 0o600 });
      }
      if (this.failWith) throw new Error(this.failWith);
      if (this.holdUntilSpent && (!this.holdFile || existsSync(this.holdFile))) await this.holdTillSpent(input, signal);
      path = join(tmpdir(), `${RENDER_TEMP_PREFIX}${input.jobId ?? "direct"}-${randomUUID()}.mp4`);
      const size = await this.write(path, input);
      const wait = this.hold && !(this.holdFirstOnly && this.rendered.length > 1) ? this.hold : null;
      if (wait || this.takes > 0) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = (): void => {
            this.aborted++;
            reject(new Error("render aborted"));
          };
          const done = (): void => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          };
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort, { once: true });
          if (this.takes > 0) setTimeout(done, this.takes);
          if (wait) void wait.then(done);
        });
      }
      return { path, contentType: "video/mp4", bytes: size };
    } catch (e) {
      if (path) await rm(path, { force: true });
      throw e;
    } finally {
      this.active--;
    }
  }
  /** IK7: polls until the job's token is spent; an abort rejects at once (so no file is written); the cap ends the wait quietly. */
  private async holdTillSpent(input: RenderRequest, signal?: AbortSignal): Promise<void> {
    const until = performance.now() + this.holdSeconds * 1000;
    for (;;) {
      if (signal?.aborted) {
        this.aborted++;
        throw new Error("render aborted");
      }
      if (performance.now() >= until || (await this.holdUntilSpent?.(input))) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, 100);
        function done(): void {
          clearTimeout(timer);
          signal?.removeEventListener("abort", done);
          resolve();
        }
        signal?.addEventListener("abort", done, { once: true });
      });
    }
  }
  private async write(path: string, input: RenderRequest): Promise<number> {
    const out = createWriteStream(path);
    let size = 0;
    if (this.fileBytes === null) {
      const marked = Buffer.from(`standin-video:${input.wishId}:${input.kind}`);
      size = marked.length;
      out.write(marked);
    } else {
      const piece = Buffer.alloc(1024 * 1024, 7);
      while (size < this.fileBytes) {
        const n = Math.min(piece.length, this.fileBytes - size);
        if (!out.write(n === piece.length ? piece : piece.subarray(0, n))) await once(out, "drain");
        size += n;
      }
    }
    out.end();
    await once(out, "finish");
    return size;
  }
}

/**
 * IK3: PROVIDERS=standin binds the stand-in renderer (STANDIN_VIDEO=fail makes every job fail); live providers bind the renderer that
 * says it is not configured, until a real one is built (OWED: its own task). The env check refuses the switch with live providers.
 * IK7: STANDIN_RENDER_TOKENS names the file the stand-in writes each render's token to, and STANDIN_VIDEO=hold makes it wait (after
 * that line) until the job's token is spent, the abort, or RENDER_STANDIN_HOLD_SECONDS. IK7a: with STANDIN_RENDER_HOLD_FILE also set, a render holds
 * only if that file exists when it starts. Both are refused at boot unless PROVIDERS=standin
 * and NODE_ENV is not production, and here nothing is read from them with live providers.
 */
export function videoRendererFor(
  env: { PROVIDERS: string; STANDIN_VIDEO?: string; STANDIN_RENDER_TOKENS?: string; STANDIN_RENDER_HOLD_FILE?: string; RENDER_STANDIN_HOLD_SECONDS?: number },
  db?: Pick<PrismaService, "renderJob">,
): VideoRenderer {
  if (env.PROVIDERS !== "standin") return new NoVideoRenderer();
  const r = new StandinVideoRenderer();
  if (env.STANDIN_VIDEO === "fail") r.failWith = "stand-in video renderer: STANDIN_VIDEO=fail";
  if (env.STANDIN_RENDER_TOKENS) r.tokenFile = env.STANDIN_RENDER_TOKENS;
  if (env.STANDIN_VIDEO === "hold") {
    if (env.STANDIN_RENDER_HOLD_FILE) r.holdFile = env.STANDIN_RENDER_HOLD_FILE;
    if (env.RENDER_STANDIN_HOLD_SECONDS !== undefined) r.holdSeconds = env.RENDER_STANDIN_HOLD_SECONDS;
    r.holdUntilSpent = async (input) => {
      if (!db || !input.jobId) return false;
      const row = await db.renderJob.findUnique({ where: { id: input.jobId }, select: { tokenUsedAt: true } });
      return !!row?.tokenUsedAt;
    };
  }
  return r;
}
