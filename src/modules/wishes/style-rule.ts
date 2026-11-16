import type { Entitlements as EntitlementsRow } from "@prisma/client";
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
