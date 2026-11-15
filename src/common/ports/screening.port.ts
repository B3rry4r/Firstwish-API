export interface ScreenInput {
  key: string;
  contentType: string;
  size: number;
  /** The first bytes of the file. */
  head: Buffer;
}
export type ScreenResult = { verdict: "clean" } | { verdict: "rejected"; reason: string };

/** Upload screening: runs on every confirmed upload before the file is used. */
export abstract class UploadScreeningPort {
  abstract screen(input: ScreenInput): Promise<ScreenResult>;
}
