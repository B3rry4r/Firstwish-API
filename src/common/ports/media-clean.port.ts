import type { PortPing } from "./ping";

/** The server's own tool (ffmpeg) could not run: missing, not allowed, or out of time. Not the file's fault: the caller answers 503 and keeps nothing. */
export class MediaToolUnavailable extends Error {}

export interface MediaCleanInput {
  /** The stored file's own key: the clean file REPLACES it. */
  key: string;
  contentType: string;
}

export interface MediaCleanResult {
  bytes: number;
  sha256: string | null;
  /** true only for a stand-in, which rewrites nothing (its bytes and hash stay the file's own). */
  unchanged?: boolean;
}

/** The largest file the cleaner holds: a clip is at most 200 MB and a Vault video 100 MB; a little room for the container. */
export const MAX_MEDIA_BYTES = 210 * 1024 * 1024;

/**
 * Media clean (IM3): a voice, a clip or a Studio sound loses the location and device tags it was recorded with, without being re-encoded: the container is
 * written again with the same audio and video streams copied as they are and nothing else (no tags, no chapters, no cover picture, no data tracks, no
 * encoder name). The clean file replaces the upload at its own key, so it is the one hashed, counted and kept. A file that cannot be rewritten rejects with
 * plain words (the file is refused); when the server's tool is missing or out of time it throws MediaToolUnavailable.
 * The real adapter runs ffmpeg, a tool the real server must have (a deploy item, as ffprobe is for clip lengths); the stand-in rewrites nothing.
 */
export abstract class MediaCleanPort {
  abstract clean(input: MediaCleanInput): Promise<MediaCleanResult>;
  /** FB4: the real adapter proves ffmpeg and ffprobe run (no network); a stand-in answers "stand-in". */
  abstract ping(): Promise<PortPing>;
}
