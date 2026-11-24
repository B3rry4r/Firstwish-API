import sharp from "sharp";
import { ImageSizesPort, ResizeInput } from "../image-sizes.port";
import { PING_OK, type PortPing, pingError } from "../ping";
import { StoragePort } from "../storage.port";

const MB = 1024 * 1024;
/** The largest source this adapter holds in memory: the largest image an upload rule takes (a Vault file, 100 MB). A photo is 15 MB. */
export const MAX_SOURCE_BYTES = 100 * MB;
/** Decompression-bomb limit: a picture of more pixels than this is refused from its header, before any pixel is decoded (a 108 MP phone photo is under it). */
export const MAX_SOURCE_PIXELS = 128_000_000;

/** What each accepted picture type becomes. HEIC is listed so it fails with words when the build here cannot decode it. A GIF's sized copy is its first frame, as a PNG. */
const OUT: Record<string, { format: "jpeg" | "png" | "webp"; type: string }> = {
  "image/jpeg": { format: "jpeg", type: "image/jpeg" },
  "image/png": { format: "png", type: "image/png" },
  "image/webp": { format: "webp", type: "image/webp" },
  "image/gif": { format: "png", type: "image/png" },
  "image/heic": { format: "jpeg", type: "image/jpeg" },
};

/**
 * The real image-sizing adapter (X22): sharp (libvips). It reads the source through the storage port (bounded by MAX_SOURCE_BYTES), makes the
 * asked width, and writes the sized copy through the storage port. It turns the picture by its EXIF orientation, never enlarges (a picture
 * narrower than the width is copied at its own width), keeps the aspect, and writes NO metadata (no GPS, no camera serial, no profile).
 * A picture it cannot decode, or one over the pixel limit, rejects with plain words; it never throws past the promise.
 */
export class SharpImageSizes extends ImageSizesPort {
  constructor(private readonly storage: StoragePort) {
    super();
    // libvips keeps a cache of recent operations and files: a server sizing people's photos must not grow with it
    sharp.cache(false);
  }

  /** FB4: one tiny real encode and decode with the decoders the app uses, no network. */
  async ping(): Promise<PortPing> {
    try {
      const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#c8693a" } }).png().toBuffer();
      await sharp(png).resize({ width: 1 }).jpeg().toBuffer();
      return PING_OK;
    } catch (e) {
      return pingError(e);
    }
  }

  async resize(input: ResizeInput): Promise<void> {
    const type = input.contentType.toLowerCase().split(";")[0].trim();
    const out = OUT[type];
    if (!out) throw new Error(`Pictures of type ${type} cannot be sized.`);
    if (!Number.isInteger(input.width) || input.width < 1 || input.width > 16_000) throw new Error("The width asked for is not a size this server makes.");
    const source = await this.storage.readObject(input.sourceKey, MAX_SOURCE_BYTES);
    if (!source) throw new Error("The picture to size is not in storage.");
    let bytes: Buffer;
    try {
      // animated: false reads the first frame only; limitInputPixels refuses a bomb from its header; failOn "error" refuses a damaged file
      let img = sharp(source, { animated: false, limitInputPixels: MAX_SOURCE_PIXELS, failOn: "error", sequentialRead: true })
        .rotate() // by the EXIF orientation, and the orientation tag is dropped with the rest of the metadata
        .resize({ width: input.width, fit: "inside", withoutEnlargement: true });
      img = out.format === "jpeg" ? img.jpeg({ quality: 82, mozjpeg: true }) : out.format === "webp" ? img.webp({ quality: 82 }) : img.png({ compressionLevel: 9 });
      bytes = await img.toBuffer(); // no withMetadata / keepMetadata: nothing of the original's EXIF, XMP, IPTC or profile is carried
    } catch (e) {
      throw new Error(wordsFor(type, e), { cause: e });
    }
    await this.storage.putObject(input.targetKey, bytes, out.type);
  }
}

/** Plain words for a picture that could not be sized; the library's own message is dropped (it can name a path or an internal). */
function wordsFor(type: string, e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (/pixel limit|exceeds/i.test(raw)) return "This picture has too many pixels to size here, so it was not sized.";
  if (type === "image/heic") return "This server cannot read HEIC pictures, so no smaller sizes were made. The original is kept.";
  return "This picture could not be read, so no smaller sizes were made. The original is kept.";
}
