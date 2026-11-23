import { Prisma, type StudioStyle as StudioStyleRow } from "@prisma/client";
import { AppError, type ErrorFields } from "../../common/errors/app-error";
import { toWireInstant } from "../../common/time/time";
import type { StudioStyle } from "../../contracts";

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const obj = (v: unknown): Obj => (isObj(v) ? v : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The statuses of a Studio style as the app shows them (T-59). */
export type StudioStatus = "draft" | "review" | "returned" | "live";
export const STATUSES: readonly StudioStatus[] = ["draft", "review", "returned", "live"];
/** A creator may change, delete or submit a style only in these. */
export const EDITABLE: readonly string[] = ["draft", "returned"];

/** The most a stored document may weigh, as JSON. The kernel's body limit is larger; this keeps one row sane. */
export const MAX_DOC_BYTES = 400_000;
const MAX_ART = 200;
/** IK5: the lists the web's editor draws from (lib/studio-layout.ts SceneLayout, lib/studio.ts AddedKind); a document names nothing outside them. */
export const LAYOUT_MODES: readonly string[] = ["auto", "free"];
export const LAYOUT_BOARDS: readonly string[] = ["portrait", "landscape"];
export const LAYOUT_FITS: readonly string[] = ["contain", "cover"];
export const ADDED_KINDS: readonly string[] = ["shape", "artwork", "effect", "text", "model", "photo", "element", "three"];
const MAX_SCENES = 60;

export const text = (v: unknown, max: number): string | null => (typeof v === "string" ? v.trim().slice(0, max) : null);

/** IK5: each scene's layout (an object whose mode, board and fit are in the lists) and each added thing's kind. Answers the fields that fail, in words. */
export function sceneListProblems(scenes: Obj, field: string): ErrorFields {
  const fields: ErrorFields = {};
  const one = (v: unknown, list: readonly string[]) => typeof v === "string" && list.includes(v);
  for (const [name, scene] of Object.entries(scenes)) {
    const s = obj(scene);
    const at = `${field}.scenes.${name}`;
    if (s.layout !== undefined && s.layout !== null) {
      const l = s.layout;
      if (!isObj(l) || !one(l.mode, LAYOUT_MODES)) fields[`${at}.layout`] = `The layout must be an object whose mode is ${LAYOUT_MODES.join(" or ")}.`;
      else if (l.board !== undefined && !one(l.board, LAYOUT_BOARDS)) fields[`${at}.layout.board`] = `The board must be ${LAYOUT_BOARDS.join(" or ")}.`;
      else if (l.fit !== undefined && !one(l.fit, LAYOUT_FITS)) fields[`${at}.layout.fit`] = `The fit must be ${LAYOUT_FITS.join(" or ")}.`;
    }
    if (s.added !== undefined && s.added !== null) {
      if (!Array.isArray(s.added)) fields[`${at}.added`] = "What is added must be a list.";
      else {
        const i = s.added.findIndex((a) => !isObj(a) || !one(a.kind, ADDED_KINDS));
        if (i >= 0) fields[`${at}.added[${i}].kind`] = `Must be one of ${ADDED_KINDS.join(", ")}.`;
      }
    }
  }
  return fields;
}

/**
 * The shape rules for the parts of a document that are objects: shared by a save (cleanDoc) and by what the AI answers (SA3), so
 * the two can never disagree. Fills `out` with the parts that pass and answers the fields that do not.
 */
export function shapeParts(input: Obj, field: string, out: Obj): ErrorFields {
  const fields: ErrorFields = {};
  for (const k of ["scenes", "poster", "made", "tags", "holds", "soundSet", "moments", "rights"] as const) {
    if (input[k] === undefined || input[k] === null) continue;
    if (!isObj(input[k])) fields[`${field}.${k}`] = "Must be an object.";
    else out[k] = input[k];
  }
  const scenes = obj(out.scenes);
  if (Object.keys(scenes).length > MAX_SCENES) fields[`${field}.scenes`] = `At most ${MAX_SCENES} scenes.`;
  else if (Object.values(scenes).some((v) => !isObj(v))) fields[`${field}.scenes`] = "Each scene must be an object.";
  else Object.assign(fields, sceneListProblems(scenes, field));
  if (input.theme !== undefined && input.theme !== null) {
    if (typeof input.theme === "string" || isObj(input.theme)) out.theme = input.theme;
    else fields[`${field}.theme`] = "Must be a theme object or the name of one.";
  }
  if (input.art !== undefined && input.art !== null) {
    if (!Array.isArray(input.art) || input.art.length > MAX_ART) fields[`${field}.art`] = `Must be a list of at most ${MAX_ART} things.`;
    else out.art = input.art;
  }
  return fields;
}

/**
 * The client's part of a style document, checked and trimmed. A bad part is 422 with the field named. `partial` is for a patch
 * that changes the document: still the whole document (E-191), so the same rules.
 */
export function cleanDoc(input: unknown, field = "style"): Obj {
  if (!isObj(input)) throw AppError.validation({ [field]: "Send the style as an object." });
  const fields: ErrorFields = {};
  const out: Obj = {};
  const name = text(input.name, 80);
  if (!name) fields[`${field}.name`] = "Give the style a name of 1 to 80 characters.";
  else out.name = name;
  const base = text(input.base, 80);
  if (!base) fields[`${field}.base`] = "Say which template the style starts from.";
  else out.base = base;
  for (const k of ["brief", "fallback", "ending", "opening", "piece", "sound", "still"] as const) {
    if (input[k] === undefined || input[k] === null) continue;
    const t = text(input[k], 2000);
    if (t === null) fields[`${field}.${k}`] = "Must be text.";
    else out[k] = t;
  }
  Object.assign(fields, shapeParts(input, field, out));
  for (const k of ["style", "seen"] as const) if (input[k] !== undefined && input[k] !== null) out[k] = input[k];
  if (Object.keys(fields).length) throw AppError.validation(fields);
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_DOC_BYTES) throw AppError.validation({ [field]: "This style is too big to save." });
  return out;
}

/** The server's part of the stored document: set by the service, never by a body. */
export interface Meta {
  version: number;
  /** ISO time of the last save (S-22: updatedAt). */
  at: string;
  byline: string;
  on: boolean;
  template: boolean;
  useExtra: boolean;
  from: Obj | null;
}

export const metaOf = (doc: Obj): Meta => ({
  version: typeof doc.version === "number" ? doc.version : 0,
  at: typeof doc.at === "string" ? doc.at : "",
  byline: typeof doc.byline === "string" ? doc.byline : "",
  on: doc.on === true,
  template: doc.template === true,
  useExtra: doc.useExtra === true,
  from: isObj(doc.from) ? doc.from : null,
});

/** The most recent review of a style, for the creator's own read. */
export interface ReviewView {
  id: string;
  status: string;
  version: number;
  at: string;
  note: string | null;
  checks: unknown[];
}

/** A stored row as the StudioStyle on the wire (the registry's shape, with `version` so the next save can carry it). */
export function toWire(row: StudioStyleRow, level: string | null, review: ReviewView | null): StudioStyle & { version: number } {
  const doc = obj(row.document);
  const m = metaOf(doc);
  const wire: Obj = {
    art: arr(doc.art),
    at: m.at,
    base: typeof doc.base === "string" ? doc.base : "",
    brief: doc.brief ?? null,
    byline: m.byline,
    ending: doc.ending ?? null,
    fallback: doc.fallback ?? null,
    from: m.from,
    holds: isObj(doc.holds) ? doc.holds : null,
    id: row.id,
    level,
    liveAt: row.liveAt ? toWireInstant(row.liveAt) : null,
    made: obj(doc.made),
    moments: isObj(doc.moments) ? doc.moments : null,
    name: typeof doc.name === "string" ? doc.name : "",
    on: m.on,
    opening: doc.opening ?? null,
    piece: doc.piece ?? null,
    poster: obj(doc.poster),
    review,
    scenes: obj(doc.scenes),
    seen: doc.seen ?? null,
    sound: doc.sound ?? null,
    soundSet: isObj(doc.soundSet) ? doc.soundSet : null,
    status: row.status ?? "draft",
    still: typeof doc.still === "string" && doc.still ? doc.still : "fade",
    style: doc.style ?? null,
    submittedAt: row.submittedAt ? toWireInstant(row.submittedAt) : null,
    tags: obj(doc.tags),
    template: m.template,
    theme: doc.theme ?? null,
    useExtra: m.useExtra,
    version: m.version,
  };
  return wire as unknown as StudioStyle & { version: number };
}

export const json = (v: Obj): Prisma.InputJsonObject => v as Prisma.InputJsonObject;
