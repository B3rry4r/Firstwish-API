import type { StoredFile as FileRow, StoredFilePurpose } from "@prisma/client";
import { SIGNATURES } from "../../common/ports/adapters/basic-screening.adapter";
import { toWireInstant } from "../../common/time/time";
import type { StoredFile } from "../../contracts";

export const MB = 1024 * 1024;
/** Default (lead), owner may override: a Vault GB is 1024^3 bytes. */
export const GB = 1024 * MB;

/** DEC-35: a signed upload is good for 15 minutes (PROVISIONAL). */
export const UPLOAD_TTL_SECONDS = 15 * 60;
/** Case 4: a signed read is good for 10 minutes. */
export const READ_TTL_SECONDS = 10 * 60;
/** DEC-42: unconfirmed uploads are removed after 24 hours (PROVISIONAL). */
export const UNCONFIRMED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** DEC-43, DEC-44: reject at or above 0.9, staff review from 0.5 (PROVISIONAL). */
export const REJECT_SCORE = 0.9;
export const REVIEW_SCORE = 0.5;
/** Case 8: image widths made after confirm. */
export const IMAGE_WIDTHS = [320, 768, 1600] as const;
/** The contract's longest voice note (E-182: up to 180 s). */
export const MAX_VOICE_SECONDS = 180;

export type UploadPurpose = "wish-photo" | "voice-note" | "order-photo" | "order-voice" | "video-clip" | "vault-file" | "studio-asset" | "studio-sound" | "studio-model" | "brand-logo" | "profile-picture";

/** Y1: a signed PUT points at this staging key only; the file's own key (objectKey) is never signed for a PUT. */
export const STAGING_PREFIX = "incoming/";
export const stagingKeyOf = (objectKey: string) => `${STAGING_PREFIX}${objectKey}`;
/** The sweep of a staging key runs once every signed PUT for it has expired (the ticket's 15 minutes, plus a minute). */
export const STAGING_SWEEP_AFTER_SECONDS = UPLOAD_TTL_SECONDS + 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"];
const AUDIO_TYPES = ["audio/webm", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/wav"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MODEL_TYPES = ["model/gltf-binary"];

export interface PurposeRule {
  purpose: UploadPurpose;
  db: StoredFilePurpose;
  /** DEC-38..41 (PROVISIONAL): 15 MB photo, 10 MB voice, 200 MB clip, 100 MB Vault file. */
  maxBytes: number;
  types: string[];
}

export const RULES: Record<UploadPurpose, PurposeRule> = {
  "wish-photo": { purpose: "wish-photo", db: "wish_photo", maxBytes: 15 * MB, types: IMAGE_TYPES },
  "voice-note": { purpose: "voice-note", db: "voice_note", maxBytes: 10 * MB, types: AUDIO_TYPES },
  "video-clip": { purpose: "video-clip", db: "video_clip", maxBytes: 200 * MB, types: VIDEO_TYPES },
  /** IC7: the buyer's files for a Concierge order take the wish photo and voice rules (types, sizes, screening); they are kept as a photo and a voice note and tied to the order. */
  "order-photo": { purpose: "order-photo", db: "wish_photo", maxBytes: 15 * MB, types: IMAGE_TYPES },
  "order-voice": { purpose: "order-voice", db: "voice_note", maxBytes: 10 * MB, types: AUDIO_TYPES },
  "vault-file": { purpose: "vault-file", db: "vault_file", maxBytes: 100 * MB, types: [...IMAGE_TYPES, ...VIDEO_TYPES] },
  /** Studio assets and (AA5) a brand logo take the photo rules: the same image types, no SVG, the same size. */
  "studio-asset": { purpose: "studio-asset", db: "studio_asset", maxBytes: 15 * MB, types: IMAGE_TYPES },
  "brand-logo": { purpose: "brand-logo", db: "brand_logo", maxBytes: 15 * MB, types: IMAGE_TYPES },
  /** HW2: a style's sound and 3D model are Studio files too (kind sound, kind model); the size limits come from the price book (readLimits). */
  "studio-sound": { purpose: "studio-sound", db: "studio_asset", maxBytes: 10 * MB, types: AUDIO_TYPES },
  "studio-model": { purpose: "studio-model", db: "studio_asset", maxBytes: 15 * MB, types: MODEL_TYPES },
  /** HW2: a creator's profile picture takes the photo rules. */
  "profile-picture": { purpose: "profile-picture", db: "profile_picture", maxBytes: 15 * MB, types: IMAGE_TYPES },
};

/** HW2/HW6: the most a purpose's file may weigh, from the price book's limits (a purpose with no book limit keeps its own). */
export function maxBytesFor(rule: PurposeRule, limits: { photoMaxBytes: number; soundMaxBytes: number; modelMaxBytes: number }): number {
  switch (rule.purpose) {
    case "wish-photo":
    case "order-photo":
    case "studio-asset":
    case "brand-logo":
    case "profile-picture":
      return limits.photoMaxBytes;
    case "studio-sound":
      return limits.soundMaxBytes;
    case "studio-model":
      return limits.modelMaxBytes;
    default:
      return rule.maxBytes;
  }
}

const PURPOSE_ALIASES: Record<string, UploadPurpose> = {
  photo: "wish-photo",
  "wish-photo": "wish-photo",
  voice: "voice-note",
  "voice-note": "voice-note",
  clip: "video-clip",
  "video-clip": "video-clip",
  "order-photo": "order-photo",
  "order-voice": "order-voice",
  vault: "vault-file",
  "vault-file": "vault-file",
  studio: "studio-asset",
  "studio-asset": "studio-asset",
  picture: "studio-asset",
  "style-picture": "studio-asset",
  poster: "studio-asset",
  "style-poster": "studio-asset",
  sound: "studio-sound",
  "style-sound": "studio-sound",
  model: "studio-model",
  "style-model": "studio-model",
  profile: "profile-picture",
  "profile-picture": "profile-picture",
  brand: "brand-logo",
  "brand-logo": "brand-logo",
};

/** The purpose (photo, voice, clip, vault, studio or brand: X25), normalised: trimmed, lowercased, "_" or " " read as "-". */
export function purposeOf(input: unknown): PurposeRule | null {
  if (typeof input !== "string") return null;
  const p = PURPOSE_ALIASES[input.trim().toLowerCase().replace(/[_\s]+/g, "-")];
  return p ? RULES[p] : null;
}

const TYPE_ALIASES: Record<string, string> = { "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/m4a": "audio/x-m4a" };

/** A content type normalised: lowercased, parameters dropped, common aliases mapped ("image/JPG; q=1" is "image/jpeg"). */
export function normaliseType(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.split(";")[0].trim().toLowerCase();
  if (!t) return null;
  return TYPE_ALIASES[t] ?? t;
}

export const isImage = (contentType: string) => IMAGE_TYPES.includes(contentType);

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

/** True when the first bytes are an SVG (or XML that can carry one): never a photo, whatever the type said (Y3, AA5). */
export function looksLikeSvg(head: Buffer): boolean {
  const text = head.toString("utf8", 0, 256).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  return text.startsWith("<svg") || text.startsWith("<?xml") || text.startsWith("<!doctype svg") || text.startsWith("<!--");
}

/**
 * Y3: the type the file's own first bytes say. Some signatures are shared (a webm is audio or video; an mp4 family brand covers
 * video, audio and heic), so the declared type is kept when the bytes allow it and refused (null) when they do not.
 */
export function typeFromBytes(head: Buffer, declared: string): string | null {
  if (looksLikeSvg(head)) return null;
  const sniff = SIGNATURES[declared];
  if (!sniff || !sniff(head)) return null;
  if (declared === "image/heic" && !HEIC_BRANDS.includes(head.toString("latin1", 8, 12))) return null;
  return declared;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Purpose names on the wire, from the database enum. */
/** X25: the media kind of a stored file, from its content type, for a row that has none recorded. */
export function mediaKindOf(contentType: string): StoredFile["kind"] {
  if (contentType.startsWith("audio/")) return "sound";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("model/")) return "model";
  return "image";
}

export function purposeOnWire(p: StoredFilePurpose): StoredFile["purpose"] {
  return p.replace(/_/g, "-") as StoredFile["purpose"];
}

export interface Variant {
  width: number;
  key: string;
}

export function variantsOf(row: Pick<FileRow, "variants">): Variant[] {
  const v = row.variants as unknown;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Variant => !!x && typeof x === "object" && typeof (x as Variant).width === "number" && typeof (x as Variant).key === "string");
}

/** The wire shape of a stored file. objectKey is the server's own key (never built from user text). */
export function fileView(row: FileRow): StoredFile {
  return {
    id: row.id,
    fileId: row.id,
    ownerAccountId: row.ownerAccountId,
    businessId: row.businessId,
    purpose: purposeOnWire(row.purpose),
    kind: row.kind ?? mediaKindOf(row.contentType),
    objectKey: row.objectKey,
    contentType: row.contentType,
    bytes: Number(row.bytes),
    sha256: row.sha256,
    status: row.status,
    variants: variantsOf(row).map((v) => ({ width: v.width, variant: `w${v.width}` })),
    driver: row.driver,
    styleId: row.styleId as string,
    createdAt: toWireInstant(row.createdAt),
    updatedAt: toWireInstant(row.updatedAt),
  };
}
