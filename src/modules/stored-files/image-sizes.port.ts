import { Provider } from "@nestjs/common";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";

export interface ResizeInput {
  sourceKey: string;
  targetKey: string;
  width: number;
  contentType: string;
}

/**
 * Image sizes (case 8): makes one width of a stored image under its own key, inside storage. The bytes never pass through the API.
 * Kept in this module until the kernel's ports take it (asked for in the B09 hand-back).
 */
export abstract class ImageSizesPort {
  abstract resize(input: ResizeInput): Promise<void>;
}

/** The stand-in: records each request and makes nothing. */
export class StandinImageSizes extends ImageSizesPort {
  readonly made: ResizeInput[] = [];
  resize(input: ResizeInput): Promise<void> {
    this.made.push(input);
    return Promise.resolve();
  }
}

/** No real image-sizing adapter exists yet: with real providers every request fails, so the job records a failed run. */
export class MissingImageSizes extends ImageSizesPort {
  resize(): Promise<void> {
    return Promise.reject(new Error("No image-sizing adapter is set up for PROVIDERS=live."));
  }
}

export const imageSizesProvider: Provider = {
  provide: ImageSizesPort,
  inject: [ENV],
  useFactory: (env: Env) => (env.PROVIDERS === "standin" ? new StandinImageSizes() : new MissingImageSizes()),
};
