import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";

/** The top-level keys of a wish's content document (the registry's Wish.content). Anything else is refused. */
export const CONTENT_KEYS = [
  "blessing", "cover", "credits", "details", "ending", "finale", "gift", "letter", "links", "memory", "note", "off", "on",
  "opening", "partner", "reasons", "story", "studio", "timeline", "voices",
] as const;

/** The keys that are chapters (a body of the wish the receiver reads); a kind's rules say which it needs. */
export const CHAPTER_KEYS = ["blessing", "finale", "gift", "letter", "memory", "note", "reasons", "story", "timeline", "voices"] as const;

/** Default: 256 KB of JSON; WISH_CONTENT_MAX_BYTES changes it. */
export function contentMaxBytes(): number {
  const n = Number(process.env.WISH_CONTENT_MAX_BYTES);
  return Number.isInteger(n) && n >= 1024 ? n : 256 * 1024;
}

export type FileRole = "photo" | "voice" | "clip" | "cover" | "sound" | "model";
export interface FileRef {
  fileId: string;
  role: FileRole;
}

const ROLE_KEYS: Record<string, FileRole> = {
  photoId: "photo", voiceId: "voice", clipId: "clip", coverId: "cover", soundId: "sound", modelId: "model",
};
const ROLES = new Set<string>(Object.values(ROLE_KEYS));
const PASSCODE = /^(pass[\s_-]?(code|word)|pin)$/i;

/**
 * The files a content document names: a property photoId, voiceId, clipId, coverId, soundId or modelId holding a file id, or a
 * property fileId beside a `role`. Also refuses (422) a passcode held in content: the passcode is Wish.passcodeHash (Q8).
 */
export function fileRefsOf(content: unknown): FileRef[] {
  const out = new Map<string, FileRef>();
  const bad: string[] = [];
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 12) throw AppError.validation({ content: "Nested too deep." });
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(o)) {
      if (PASSCODE.test(k)) bad.push(`${path}.${k}`);
      const role = ROLE_KEYS[k] ?? (k === "fileId" && typeof o.role === "string" && ROLES.has(o.role) ? (o.role as FileRole) : undefined);
      if (role) {
        if (!isUuidV7(val)) bad.push(`${path}.${k}`);
        else out.set(`${val}:${role}`, { fileId: val, role });
      }
      walk(val, `${path}.${k}`, depth + 1);
    }
  };
  walk(content, "content", 0);
  if (bad.length) throw AppError.validation({ content: `Not allowed or not a file id: ${bad.slice(0, 3).join(", ")}.` });
  return [...out.values()];
}

/** Checks a whole content document: an object, known keys, size. Answers it unchanged. */
export function checkContent(content: unknown): Record<string, unknown> {
  if (!content || typeof content !== "object" || Array.isArray(content)) throw AppError.validation({ content: "Must be an object." });
  const unknown = Object.keys(content).filter((k) => !(CONTENT_KEYS as readonly string[]).includes(k));
  if (unknown.length) throw AppError.validation({ content: `Unknown parts: ${unknown.slice(0, 5).join(", ")}.` });
  if (Buffer.byteLength(JSON.stringify(content), "utf8") > contentMaxBytes()) {
    throw new AppError(422, "validation_failed", "Some fields need fixing.", { content: `Too large: most ${contentMaxBytes()} bytes.` });
  }
  return content as Record<string, unknown>;
}

/** What a kind needs before it can be sealed: at least one of these chapters has something in it. Default for every kind. */
export function hasBody(content: Record<string, unknown> | null): boolean {
  if (!content) return false;
  return CHAPTER_KEYS.some((k) => {
    const v = content[k];
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "object" && Object.keys(v).length > 0;
  });
}
