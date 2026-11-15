import { ScreenInput, ScreenResult, UploadScreeningPort } from "../screening.port";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

type Sniffer = (b: Buffer) => boolean;
const at = (b: Buffer, offset: number, ascii: string) => b.length >= offset + ascii.length && b.toString("latin1", offset, offset + ascii.length) === ascii;
const bytes = (b: Buffer, sig: number[]) => b.length >= sig.length && sig.every((v, i) => b[i] === v);

/** The file signatures each allowed type must start with. */
export const SIGNATURES: Record<string, Sniffer> = {
  "image/jpeg": (b) => bytes(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) => bytes(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (b) => at(b, 0, "GIF87a") || at(b, 0, "GIF89a"),
  "image/webp": (b) => at(b, 0, "RIFF") && at(b, 8, "WEBP"),
  "image/heic": (b) => at(b, 4, "ftyp"),
  "audio/mpeg": (b) => at(b, 0, "ID3") || bytes(b, [0xff, 0xfb]) || bytes(b, [0xff, 0xf3]) || bytes(b, [0xff, 0xf2]),
  "audio/mp4": (b) => at(b, 4, "ftyp"),
  "audio/x-m4a": (b) => at(b, 4, "ftyp"),
  "audio/ogg": (b) => at(b, 0, "OggS"),
  "audio/webm": (b) => bytes(b, [0x1a, 0x45, 0xdf, 0xa3]),
  "audio/wav": (b) => at(b, 0, "RIFF") && at(b, 8, "WAVE"),
  "video/mp4": (b) => at(b, 4, "ftyp"),
  "video/quicktime": (b) => at(b, 4, "ftyp") || at(b, 4, "moov") || at(b, 4, "wide"),
  "video/webm": (b) => bytes(b, [0x1a, 0x45, 0xdf, 0xa3]),
};

/**
 * Screening by file signature and size: the bytes must match the declared type, the type must be one the app takes,
 * and the file must be within the size limit.
 */
export class BasicScreening extends UploadScreeningPort {
  screen(input: ScreenInput): Promise<ScreenResult> {
    const type = input.contentType.toLowerCase().split(";")[0].trim();
    const sniff = SIGNATURES[type];
    const no = (label: string, reason: string): Promise<ScreenResult> => Promise.resolve({ verdict: "rejected", score: 1, labels: [label], reason });
    if (!sniff) return no("type not taken", `Files of type ${type} are not taken.`);
    if (input.size <= 0) return no("empty", "The file is empty.");
    if (input.size > MAX_UPLOAD_BYTES) return no("too large", "The file is too large.");
    if (!sniff(input.head)) return no("type mismatch", "The file is not what its type says.");
    return Promise.resolve({ verdict: "clean", score: 0, labels: [] });
  }
}
