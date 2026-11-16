import { RECIPES } from "../studio/studio-recipes";

/** The highest step the maker's screens use (lib/maker.ts: steps 0 to 5). A save with a step outside 0..LAST_STEP is refused (HP2). */
export const LAST_STEP = 5;

/** Kinds that borrow another kind's occasions (the web's SHARES), and the one name an alias stands for. */
const SHARES: Record<string, string[]> = { planners: ["wedding"], vendors: ["love", "celebration"] };
const ALIAS: Record<string, string> = { "table-cards": "our-story" };

/** The occasion slugs a kind has: its own, or those it shares; a kind the table does not know reads as "love" (as the web does). */
export function occasionsOfKind(kind: string): string[] {
  const bases = RECIPES[kind] ? [kind] : (SHARES[kind] ?? ["love"]);
  return bases.flatMap((b) => (RECIPES[b] ?? []).map((o) => o[0]));
}

/** True when the kind has the occasion (an alias counts as the occasion it names). */
export function kindHasOccasion(kind: string, occasion: string): boolean {
  return occasionsOfKind(kind).includes(ALIAS[occasion] ?? occasion);
}
