import { normaliseEmail } from "./email";

/** HY2: the search word of a staff list: trimmed, one to 100 characters, or null when there is none (an empty word narrows nothing). */
export function searchWord(q: string | undefined | null): string | null {
  const t = (q ?? "").trim().slice(0, 100);
  return t ? t : null;
}

/**
 * A staff search matches a contact address only when the whole address is typed (so the lists cannot be used to find out, piece by piece,
 * what a masked address says); names, subjects and numbers match by part.
 */
export function fullEmailOf(word: string): string | null {
  return normaliseEmail(word);
}

/** A wish number as typed: a leading "#" or "no." is not part of it. */
export function wishNumberOf(word: string): string {
  return word.replace(/^#|^no\.?\s*/i, "").trim();
}

/** The characters of a search word that a LIKE pattern reads as pattern (% _ and the escape \\) made ordinary letters. */
export function likeLiteral(word: string): string {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}
