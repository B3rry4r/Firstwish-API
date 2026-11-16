import type { Wish } from "@prisma/client";

type Obj = Record<string, unknown>;

/** The kind and occasion a start with none of its own begins on (the maker's own first pick). */
export const DEFAULT_KIND = "love";
export const DEFAULT_OCCASION = "birthday";
/** HM3: an Idempotency-Key on a start: 8 to 100 letters, digits or . _ : - (as the payments' key). */
export const START_KEY = /^[A-Za-z0-9._:-]{8,100}$/;

const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** True when a value holds something a person wrote or chose: text, a number other than 0, true, or a list or object holding such a value. */
export function holdsAnswer(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(holdsAnswer);
  if (typeof v === "object") return Object.values(v as Obj).some(holdsAnswer);
  return true;
}

/**
 * HM3: "untouched" is DERIVED from the row, never stored, so a draft that was touched and then cleared is untouched again. A draft
 * is untouched when it holds no answer: no chapter, photo or voice in its content (only the sender's name on the cover, the
 * studio's name and the chapters switched off are not answers), nothing in the maker's note but what the opening link gave
 * (`given`) and the wish's own id, no open time, wedding day, keep or passcode, and no kind, occasion or style recorded as
 * chosen (`makerNote.chosen`, set when a start carries one). Its name and the step it reached are not answers.
 */
export function isUntouched(w: Wish): boolean {
  if (w.status !== "draft" || w.erasedAt || w.removedAt || w.businessId || w.ticket) return false;
  if (w.opensAt || w.weddingDate || w.keep || w.passcodeHash) return false;
  const note = obj(w.makerNote);
  for (const [k, v] of Object.entries(note)) if (k !== "given" && k !== "wishId" && holdsAnswer(v)) return false;
  const content = obj(w.content);
  for (const [k, v] of Object.entries(content)) {
    if (k === "studio" || k === "off") continue;
    if (k === "cover") {
      for (const [ck, cv] of Object.entries(obj(v))) if (ck !== "from" && holdsAnswer(cv)) return false;
      continue;
    }
    if (holdsAnswer(v)) return false;
  }
  return true;
}
