import type { PortPing } from "./ping";

export interface ResizeInput {
  sourceKey: string;
  targetKey: string;
  width: number;
  contentType: string;
  /** The source bytes, when the caller already holds them (one read for all the widths of a photo); else the adapter reads sourceKey. */
  source?: Buffer;
}

/** The largest source a sizing job holds in memory: the largest image an upload rule takes (a Vault file, 100 MB). A photo is 15 MB. */
export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

/**
 * Image sizes (X22): makes one width of a stored image under its own key, inside storage. The real adapter is SharpImageSizes
 * (adapters/sharp-image-sizes.adapter.ts): it reads the source and writes the sized copy through the storage port. A picture that cannot
 * be sized rejects with plain words; the job that calls it keeps the file usable at its original and tries again, then parks (jobs frame).
 */
export abstract class ImageSizesPort {
  abstract resize(input: ResizeInput): Promise<void>;
  /** FB4: the real adapter proves its decoder loads and works (no network); a stand-in answers "stand-in". */
  abstract ping(): Promise<PortPing>;
}
