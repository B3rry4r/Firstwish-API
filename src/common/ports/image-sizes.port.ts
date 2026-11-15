export interface ResizeInput {
  sourceKey: string;
  targetKey: string;
  width: number;
  contentType: string;
}

/**
 * Image sizes (X22): makes one width of a stored image under its own key, inside storage; the bytes never pass through the API.
 * The real adapter (resize with sharp, read and write through the storage port) is built in the wave that merges the jobs
 * frame (B06), where the job that calls it runs. Until then PROVIDERS=live answers with MissingImageSizes.
 */
export abstract class ImageSizesPort {
  abstract resize(input: ResizeInput): Promise<void>;
}

/** No real image-sizing adapter exists yet: with real providers every request fails, so the job records a failed run. */
export class MissingImageSizes extends ImageSizesPort {
  resize(): Promise<void> {
    return Promise.reject(new Error("No image-sizing adapter is set up for PROVIDERS=live."));
  }
}
