import { PING_STAND_IN, type PortPing, pingError } from "../../common/ports/ping";

export type RenderKind = "status-video" | "keepsake-export";

export interface RenderRequest {
  wishId: string;
  kind: RenderKind;
  width: number;
  height: number;
  seconds: number;
}

export interface RenderedFile {
  bytes: Buffer;
  contentType: string;
}

/**
 * The video renderer is a port. The real renderer is not built in this bundle: with none configured, `configured()` is false and
 * the ask answers 503 video_unavailable; a made-up file is never returned. Tests use StandinVideoRenderer.
 */
export abstract class VideoRenderer {
  abstract configured(): boolean;
  /** FB4: a real renderer makes one cheap read of its service and answers ok or its error; a stand-in answers "stand-in". */
  abstract ping(): Promise<PortPing>;
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

/** The test stand-in: a small marked file, or a failure on demand. */
export class StandinVideoRenderer extends VideoRenderer {
  readonly rendered: RenderRequest[] = [];
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }
  failWith: string | null = null;
  /** A test turns the renderer off to see the 503. */
  on = true;
  configured(): boolean {
    return this.on;
  }
  render(input: RenderRequest): Promise<RenderedFile> {
    this.rendered.push(input);
    if (this.failWith) return Promise.reject(new Error(this.failWith));
    return Promise.resolve({ bytes: Buffer.from(`standin-video:${input.wishId}:${input.kind}`), contentType: "video/mp4" });
  }
}
