import type { Wish } from "@prisma/client";

/** The kind and occasion a start with none of its own begins on (the maker's own first pick). */
export const DEFAULT_KIND = "love";
export const DEFAULT_OCCASION = "birthday";
/** HM3: an Idempotency-Key on a start: 8 to 100 letters, digits or . _ : - (as the payments' key). */
export const START_KEY = /^[A-Za-z0-9._:-]{8,100}$/;

/**
 * HO1: a draft a bare start may hand back. How it is known: it was made by a bare start and never written since. Its version is
 * 0 (every save, upload, ticket or add bumps it) and its maker's note is empty (a start that carries a kind, occasion or style
 * records `makerNote.chosen`, so that draft never matches). No content test: nothing is derived from what the draft holds.
 */
export function isBareStart(w: Wish): boolean {
  return w.status === "draft" && w.version === 0 && w.makerNote === null && !w.erasedAt && !w.removedAt && !w.businessId && !w.ticket;
}
