/** The royalty maths, in integer kobo and BigInt only. Every share rounds DOWN to the kobo; what is left stays with Firstwish. */

/** `percent` of `kobo`, rounded down. */
export function percentOf(kobo: bigint, percent: number): bigint {
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) throw new Error(`royalty: ${percent} is not a whole percent`);
  if (kobo < 0n) throw new Error("royalty: a price is never negative");
  return (kobo * BigInt(percent)) / 100n;
}

export interface Split {
  /** What the style's creator gets. */
  creator: bigint;
  /** What the template's creator gets, out of the royalty (0 when the style has no other creator's template under it). */
  template: bigint;
}

/** T-67: a quarter of the royalty (templatePercent) goes to the template's creator, out of it, not on top. */
export function splitRoyalty(royalty: bigint, templatePercent: number, hasTemplateCreator: boolean): Split {
  const template = hasTemplateCreator ? percentOf(royalty, templatePercent) : 0n;
  return { creator: royalty - template, template };
}

/** "2026-11" of a moment, in UTC. */
export function monthOf(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The month before `month`. */
export function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
