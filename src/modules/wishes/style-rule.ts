import type { Entitlements as EntitlementsRow, Prisma } from "@prisma/client";
import { grantOf } from "../price-book/entitlements.service";
import { isLevel, LEVEL_NAME, LEVELS, type Level } from "../styles/style-view";

/** HQ5: the extra a Keepsake can add to take a premium style (the seed's ticket table: extras "premium-style"). */
const PREMIUM_EXTRA = "extra.premium-style";

const TICKET_NAME: Record<string, string> = { moment: "Moment", keepsake: "Keepsake", signature: "Signature", premiere: "Premiere" };
export const levelRank = (l: Level): number => LEVELS.indexOf(l);

/**
 * HQ5: the highest style level a wish's ticket allows, from the price book's ticket entry (`styleLevel`: Moment starter, Keepsake
 * standard, Signature and Premiere premium), lifted to premium by a bought premium-style extra. null when no ticket is chosen yet
 * (nothing is refused before then) or the price book names no level for the ticket.
 */
export function allowedLevel(book: EntitlementsRow, ticket: string | null, adds: unknown): Level | null {
  if (!ticket) return null;
  const level = grantOf(book, `ticket.${ticket}`)?.styleLevel;
  if (!isLevel(level)) return null;
  const extra = (Array.isArray(adds) ? adds : []).includes(PREMIUM_EXTRA);
  return extra ? "premium" : level;
}

/** The words for a refused style, or null when the ticket allows it. */
export function styleRefusal(allowed: Level | null, ticket: string | null, style: { name: string | null; level: string | null }): string | null {
  const level: Level = isLevel(style.level) ? style.level : "starter";
  if (allowed === null || levelRank(level) <= levelRank(allowed)) return null;
  const ticketName = TICKET_NAME[ticket ?? ""] ?? "This";
  const way = allowed === "starter" ? "Choose a Starter style, or a ticket that takes more." : `Choose a style up to ${LEVEL_NAME[allowed]}, or a ticket that takes more.`;
  return `${style.name || "This style"} is a ${LEVEL_NAME[level]} style. A ${ticketName} ticket takes ${LEVEL_NAME[allowed]} styles and below. ${way}`;
}

/** Kinds that borrow another kind's styles, as they borrow its occasions (kind-occasions.ts). */
const BORROWS: Record<string, string[]> = { planners: ["wedding"], vendors: ["love", "celebration"] };
const KNOWN_KINDS = new Set(["love", "celebration", "group", "wedding", "teams", "photographers", ...Object.keys(BORROWS)]);

/** True when a style is made for the kind: it names the kind (or one the kind borrows from), or it names none. A kind the product does not know is not judged. */
export function offeredForKind(styleKinds: unknown, kind: string): boolean {
  const list = (Array.isArray(styleKinds) ? styleKinds : []).filter((k): k is string => typeof k === "string");
  if (list.length === 0 || !KNOWN_KINDS.has(kind)) return true;
  return [kind, ...(BORROWS[kind] ?? [])].some((k) => list.includes(k));
}

/**
 * IJ4a: true when a style is offered for a wish: made for the wish's kind (offeredForKind) AND, where the style names occasions for that kind (or a kind it
 * borrows), made for the wish's occasion. A style that names no occasion for the kind is made for every occasion of it; a wish with no occasion yet is
 * offered only those. The one rule behind the server's pick, the save, the ticket and `allowedStyles`, and the one the public styles list answers by.
 */
export function offeredForWish(styleKinds: unknown, styleOccasions: unknown, kind: string, occasion: string | null | undefined): boolean {
  if (!offeredForKind(styleKinds, kind)) return false;
  const list = (Array.isArray(styleKinds) ? styleKinds : []).filter((k): k is string => typeof k === "string");
  const named = occasionLimits(styleOccasions);
  const mine = [kind, ...(BORROWS[kind] ?? [])].filter((k) => list.includes(k));
  if (list.length === 0 || mine.length === 0) return true;
  return mine.some((k) => { const only = named[k]; return !only || only.length === 0 || (!!occasion && only.includes(occasion)); });
}

function occasionLimits(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, list] of Object.entries(v)) out[k] = (Array.isArray(list) ? list : []).filter((o): o is string => typeof o === "string");
  return out;
}

export interface StyleFacts { name: string | null; level: string | null; kinds: unknown; on: boolean | null; occasions?: unknown }

/**
 * IJ2: why a wish may not take this style, in words, or null. The style must be on (unless `keepsOff`: a draft saved again with the style it already has),
 * made for the wish's kind, and at a level the ticket allows (T-02 to T-06). `level` is the style's level as the wish took it (a later raise by staff does not
 * count against a wish that already holds the style). Used by every route that gives a wish a style: its save, the ticket's purchase and the seal.
 */
export function styleTakingRefusal(
  allowed: Level | null,
  ticket: string | null,
  kind: string,
  style: StyleFacts,
  o: { level?: string | null; checkOn?: boolean; checkKind?: boolean; occasion?: string | null } = {},
): string | null {
  const name = style.name || "This style";
  if (o.checkOn !== false && style.on !== true) return `${name} is switched off. Choose another style.`;
  if (o.checkKind !== false && !offeredForKind(style.kinds, kind)) return `${name} is not made for the ${kind} kind. Choose a style made for it.`;
  if (o.checkKind !== false && !offeredForWish(style.kinds, style.occasions, kind, o.occasion)) {
    return o.occasion
      ? `${name} is not made for the ${o.occasion} occasion of the ${kind} kind. Choose a style made for it.`
      : `${name} is made for chosen occasions only, and this wish has no occasion yet. Choose an occasion first, or another style.`;
  }
  return styleRefusal(allowed, ticket, { name: style.name, level: o.level ?? style.level });
}

/**
 * IJ4: the style the server picks for a wish it starts: the first of `rows` (already in the house-first order) that is on, offered for the kind and at a
 * level `allowed` takes (null: any level). undefined when no style fits: the wish then starts with no style and sealing it is refused until one is chosen.
 */
export function firstStyleFor<T extends { slug: string | null; level: string | null; kinds: unknown; on?: boolean | null; occasions?: unknown }>(rows: readonly T[], kind: string, allowed: Level | null, occasion?: string | null): T | undefined {
  return rows.find((r) => !!r.slug && r.on !== false && offeredForWish(r.kinds, r.occasions, kind, occasion) && (allowed === null || levelRank(isLevel(r.level) ? r.level : "starter") <= levelRank(allowed)));
}

export const REFUND_WORDS = "A refund for the premium-style extra is on its way, so the extra no longer counts.";

/**
 * IJ3a: the extras a wish holds for its style rule. An extra whose refund has been SENT (an open refund of its payment, status sent) no longer counts as held:
 * the wish's style rule treats it as gone. A refund that failed or was cancelled is no longer sent, so the extra counts again. `refunding` says one was dropped.
 */
export async function heldAdds(db: Pick<Prisma.TransactionClient, "purchaseGrant">, wishId: string | null | undefined, adds: unknown): Promise<{ adds: unknown; refunding: boolean }> {
  const list = Array.isArray(adds) ? adds : [];
  if (!wishId || !list.includes(PREMIUM_EXTRA)) return { adds, refunding: false };
  const sent = await db.purchaseGrant.findFirst({ where: { wishId, kind: "extra", sku: PREMIUM_EXTRA, revokedAt: null, refusedReason: null, payment: { refundByPayment: { some: { status: "sent" } } } }, select: { id: true } });
  if (!sent) return { adds, refunding: false };
  const i = list.lastIndexOf(PREMIUM_EXTRA);
  return { adds: list.filter((_, k) => k !== i), refunding: true };
}
