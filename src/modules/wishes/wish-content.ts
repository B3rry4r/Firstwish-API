import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";

/** The top-level keys of a wish's content document (the registry's Wish.content). Anything else is refused. */
export const CONTENT_KEYS = [
  "blessing", "cover", "credits", "details", "ending", "finale", "gift", "letter", "links", "memory", "note", "off", "on",
  "opening", "partner", "reasons", "story", "studio", "timeline", "voices",
] as const;

/** The keys that are chapters (a body of the wish the receiver reads); a kind's rules say which it needs. */
export const CHAPTER_KEYS = ["blessing", "finale", "gift", "letter", "memory", "note", "reasons", "story", "timeline", "voices"] as const;

/** The size limit when the lifecycle config has no row (CC3: the config's wishContentMaxBytes is what applies). */
export const DEFAULT_CONTENT_MAX_BYTES = 262144;

export type FileRole = "photo" | "voice" | "clip" | "cover" | "sound" | "model";
export interface FileRef {
  fileId: string;
  role: FileRole;
}

/** The closed shape of the content document (EE3): every level lists the keys it may hold; anything else is 422. */
type Shape =
  | { t: "str"; max?: number }
  | { t: "num"; max: number }
  | { t: "bool" }
  | { t: "file"; role: FileRole }
  | { t: "list"; of: Shape; max: number }
  | { t: "obj"; keys: Record<string, Shape> }
  | { t: "map" }
  | { t: "either"; of: Shape[] };

const str: Shape = { t: "str" };
/** HQ1: the maker's own words are bounded: a text of at most `max` characters, a whole number from 0 to `max`. */
const text = (max: number): Shape => ({ t: "str", max });
const count = (max: number): Shape => ({ t: "num", max });
const list = (of: Shape, max = 200): Shape => ({ t: "list", of, max });
const obj = (keys: Record<string, Shape>): Shape => ({ t: "obj", keys });
const file = (role: FileRole): Shape => ({ t: "file", role });
const titleText = obj({ title: str, text: str });

/**
 * Where a file may be named, and nowhere else: cover.photoId and cover.coverId, story.photos[].photoId, story.clips[].clipId,
 * story.modelId, voices.items[].voiceId, opening.soundId and ending.soundId. A file id under any other key is refused, so the
 * receiver's links can come from the wish_file rows alone (the rows are written from exactly these places).
 */
const SHAPE: Record<(typeof CONTENT_KEYS)[number], Shape> = {
  blessing: obj({ verse: str, cite: str, note: text(500) }),
  cover: obj({ from: str, title: str, more: list(str, 20), photoId: file("photo"), coverId: file("cover"), school: text(120), years: text(60), born: text(60) }),
  credits: list(obj({ role: str, name: str, handle: str }), 50),
  details: { t: "either", of: [list(obj({ label: str, value: str }), 50), { t: "map" }] },
  ending: obj({ id: str, scene: str, values: { t: "map" }, soundId: file("sound") }),
  finale: obj({ title: str, text: str, sign: str }),
  gift: titleText,
  letter: obj({ paras: list(str, 200), line: text(300) }),
  links: obj({ files: str, book: str, download: obj({ count: count(10000), size: text(40), files: list(text(200), 100) }) }),
  memory: obj({ title: str, text: str, quote: text(500) }),
  note: obj({ from: str, text: str }),
  off: list(str, 30),
  on: list(str, 30),
  opening: obj({ id: str, scene: str, values: { t: "map" }, soundId: file("sound") }),
  partner: str,
  reasons: list(obj({ title: str, note: text(500) }), 50),
  story: obj({
    title: str, text: str, captions: list(str, 60), modelId: file("model"),
    photos: list(obj({ photoId: file("photo"), caption: str }), 200),
    clips: list(obj({ clipId: file("clip"), caption: str }), 50),
  }),
  studio: str,
  timeline: list(obj({ when: str, what: str }), 100),
  voices: obj({ ask: str, items: list(obj({ name: str, text: str, role: str, voiceId: file("voice") }), 100) }),
};

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Walks `v` against `shape`; adds a message per fault (at most 3 are kept) and the files it finds. */
function walk(v: unknown, shape: Shape, path: string, bad: string[], refs: Map<string, FileRef>): boolean {
  switch (shape.t) {
    case "str":
      if (typeof v !== "string") return bad.push(`${path} must be text`), false;
      if (shape.max !== undefined && [...v].length > shape.max) return bad.push(`${path} is too long (at most ${shape.max} characters)`), false;
      return true;
    case "num":
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > shape.max) return bad.push(`${path} must be a whole number from 0 to ${shape.max}`), false;
      return true;
    case "bool":
      if (typeof v !== "boolean") return bad.push(`${path} must be true or false`), false;
      return true;
    case "file":
      if (!isUuidV7(v)) return bad.push(`${path} is not a file id`), false;
      refs.set(`${v}:${shape.role}`, { fileId: v, role: shape.role });
      return true;
    case "map":
      if (!isPlain(v) || !Object.values(v).every((x) => typeof x === "string")) return bad.push(`${path} must be names with text values`), false;
      return true;
    case "list":
      if (!Array.isArray(v) || v.length > shape.max) return bad.push(`${path} must be a list of at most ${shape.max}`), false;
      return v.map((x, i) => walk(x, shape.of, `${path}[${i}]`, bad, refs)).every(Boolean);
    case "obj": {
      if (!isPlain(v)) return bad.push(`${path} must be an object`), false;
      let ok = true;
      for (const [k, val] of Object.entries(v)) {
        const sub = Object.prototype.hasOwnProperty.call(shape.keys, k) ? shape.keys[k] : undefined;
        if (!sub) {
          bad.push(`${path}.${k} is not allowed`);
          ok = false;
        } else if (!walk(val, sub, `${path}.${k}`, bad, refs)) ok = false;
      }
      return ok;
    }
    case "either": {
      for (const option of shape.of) {
        const tryBad: string[] = [];
        const tryRefs = new Map<string, FileRef>();
        if (walk(v, option, path, tryBad, tryRefs)) {
          tryRefs.forEach((r, k) => refs.set(k, r));
          return true;
        }
      }
      return bad.push(`${path} has the wrong shape`), false;
    }
  }
}

/**
 * Checks a whole content document (EE3): an object, only the known keys, the closed shape under each key at every level, and the
 * size against `maxBytes` (the lifecycle config's wishContentMaxBytes, CC3). Answers the document and the files it names.
 */
export function readContent(content: unknown, maxBytes: number): { content: Record<string, unknown>; refs: FileRef[] } {
  if (!isPlain(content)) throw AppError.validation({ content: "Must be an object." });
  const bad: string[] = [];
  const refs = new Map<string, FileRef>();
  for (const [k, v] of Object.entries(content)) {
    const shape = (CONTENT_KEYS as readonly string[]).includes(k) ? SHAPE[k as keyof typeof SHAPE] : undefined;
    if (!shape) bad.push(`${k} is not a part of a wish`);
    else walk(v, shape, k, bad, refs);
  }
  if (bad.length) throw AppError.validation({ content: `Not allowed: ${bad.slice(0, 3).join("; ")}.` });
  if (Buffer.byteLength(JSON.stringify(content), "utf8") > maxBytes) {
    throw new AppError(422, "validation_failed", "Some fields need fixing.", { content: `Too large: most ${maxBytes} bytes.` });
  }
  return { content, refs: [...refs.values()] };
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
