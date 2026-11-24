import type { PortPing } from "./ping";

export interface ResizeInput {
  sourceKey: string;
  targetKey: string;
  width: number;
  contentType: string;
}

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
