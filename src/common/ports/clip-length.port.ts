export interface ClipLengthInput {
  /** The stored file's own key (the copy no signed upload points at). */
  key: string;
  contentType: string;
}

/**
 * Clip length (IL1a): reads a video clip's length, in milliseconds, from the stored FILE. The browser's word is never taken. Answers null when the length
 * cannot be read (a file with no length in it, or no tool to read it); the caller then refuses the clip, in words.
 * The real adapter runs ffprobe, a tool the real server must have (a deploy item); the stand-in reads the length from the container's own header.
 */
export abstract class ClipLengthPort {
  abstract lengthMs(input: ClipLengthInput): Promise<number | null>;
}

/** What a server with no length reader answers: every clip is refused, so nothing unchecked is ever kept. */
export class MissingClipLength extends ClipLengthPort {
  lengthMs(): Promise<number | null> {
    return Promise.resolve(null);
  }
}
