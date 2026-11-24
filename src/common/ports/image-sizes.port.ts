import type { PortPing } from "./ping";

export interface ResizeInput {
  sourceKey: string;
  targetKey: string;
  width: number;
  contentType: string;
  /** The source bytes, when the caller already holds them (one read for all the widths of a photo); else the adapter reads sourceKey. */
  source?: Buffer;
}

export interface CleanInput {
  sourceKey: string;
  /** Where the clean copy is written; the same key as the source replaces it. */
  targetKey: string;
  contentType: string;
  source?: Buffer;
}

export interface CleanResult {
  bytes: number;
  sha256: string | null;
  /** true only for a stand-in, which decodes nothing and so leaves the picture as it is (its bytes and hash then stay the file's own). */
  unchanged?: boolean;
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
  /**
   * IM1: re-makes a picture at its own size and its own type with NO metadata (no EXIF, GPS, camera serial, XMP, IPTC, embedded thumbnail or profile),
   * turned upright by its orientation. Writes it at targetKey (the source's own key replaces the original) and answers its size and sha-256.
   * A picture it cannot open rejects with plain words.
   */
  abstract clean(input: CleanInput): Promise<CleanResult>;
  /** FB4: the real adapter proves its decoder loads and works (no network); a stand-in answers "stand-in". */
  abstract ping(): Promise<PortPing>;
}
