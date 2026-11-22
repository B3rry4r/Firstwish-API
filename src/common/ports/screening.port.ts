import type { PortPing } from "./ping";

export interface ScreenInput {
  key: string;
  contentType: string;
  size: number;
  /** The first bytes of the file. */
  head: Buffer;
}

/**
 * II2: the kinds of refusal a screening names in its labels (the first label of a rejected result), as the basic screening writes them. The words a
 * refused file carries are a fixed list by these kinds (modules/stored-files/refusal-words.ts); no other kind is invented.
 */
export const REFUSAL_LABELS = ["type not taken", "empty", "too large", "type mismatch"] as const;
export type RefusalLabel = (typeof REFUSAL_LABELS)[number];

/**
 * What screening found (X21). score is from 0 (nothing found) to 1 (certainly not allowed); labels name what was found, in a few
 * plain words each. A rejected file also says why, for the person who sent it.
 */
export type ScreenResult =
  | { verdict: "clean"; score: number; labels: string[] }
  | { verdict: "rejected"; score: number; labels: string[]; reason: string };

/** Upload screening: runs on every confirmed upload before the file is used. */
export abstract class UploadScreeningPort {
  abstract screen(input: ScreenInput): Promise<ScreenResult>;
  /** FB4: one cheap authenticated read. Answers ok, or the provider's error; a stand-in answers "stand-in". Never carries a secret. */
  abstract ping(): Promise<PortPing>;
}
