/** The server's own tool could not run (missing, or timed out): not the file's fault. */
export class ClipToolUnavailable extends Error {}

export interface ClipLengthInput {
  /** The stored file's own key (the copy no signed upload points at). */
  key: string;
  contentType: string;
}

/**
 * Clip length (IL1a): reads a video clip's length, in milliseconds, from the stored FILE. The browser's word is never taken. Answers null when the FILE is bad
 * (no length in it, or no video stream: an audio-only file is not a clip); the caller then refuses the clip, in words. When the SERVER's tool is missing or timed
 * out it throws ClipToolUnavailable (a server fault, not a bad file: the caller answers 503 and keeps nothing).
 * The real adapter runs ffprobe, a tool the real server must have (a deploy item); the stand-in reads the length from the container's own header.
 */
export abstract class ClipLengthPort {
  abstract lengthMs(input: ClipLengthInput): Promise<number | null>;
}

/** What a server with no length reader answers: every clip is refused (503), so nothing unchecked is ever kept. */
export class MissingClipLength extends ClipLengthPort {
  lengthMs(): Promise<number | null> {
    return Promise.reject(new ClipToolUnavailable("no clip length reader"));
  }
}
