import type { Entitlements as EntitlementsRow } from "@prisma/client";
import { grantOf } from "../price-book/entitlements.service";
import { stateOf, type WishState } from "../wishes/wish-state";
import type { Tx } from "./grants";

export const TICKET_ORDER = ["moment", "keepsake", "signature", "premiere"] as const;
const rank = (t: string | null): number => (t ? TICKET_ORDER.indexOf(t as (typeof TICKET_ORDER)[number]) : -1);
/** An extra that may be bought again for the same wish: each one adds photos to the count (wishes.service limitsOf). */
export const REPEATABLE_EXTRAS = new Set(["extra.five-photos"]);

export interface WishFacts {
  id: string;
  accountId: string;
  state: WishState;
  ticket: string | null;
  endsAt: Date | null;
  adds: string[];
}

/** The wish as the rules read it. Inside the payment's transaction the caller has locked the row first. */
export async function readWish(db: Pick<Tx, "wish">, wishId: unknown): Promise<WishFacts | null> {
  if (typeof wishId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wishId)) return null;
  const w = await db.wish.findUnique({ where: { id: wishId }, select: { id: true, accountId: true, status: true, erasedAt: true, ticket: true, endsAt: true, adds: true } });
  if (!w) return null;
  return {
    id: w.id,
    accountId: w.accountId,
    state: stateOf(w),
    ticket: w.ticket,
    endsAt: w.endsAt,
    adds: (Array.isArray(w.adds) ? w.adds : []).filter((a): a is string => typeof a === "string"),
  };
}

/** Why a wish cannot be paid for by this payer, or null. Not the payer's, missing and erased all read the same to the payer. */
function reach(w: WishFacts | null, payerId: string | null): string | null {
  if (!w || !payerId || w.accountId !== payerId) return "wish_not_payers";
  if (w.state === "erased") return "wish_erased";
  if (w.state === "taken_down") return "wish_removed";
  return null;
}

/** A ticket: a wish with none takes it; one that has a ticket takes only a higher one, and only before it is sealed. */
export function assessTicket(w: WishFacts | null, payerId: string | null, ticket: string): string | null {
  const r = reach(w, payerId);
  if (r || !w) return r;
  if (w.state !== "draft") return "wish_sealed";
  if (w.ticket === ticket) return "ticket_already_held";
  if (w.ticket && rank(ticket) <= rank(w.ticket)) return "ticket_not_an_upgrade";
  return null;
}

/** An extra: the ticket must take it, it is not held twice, and a Keepsake stays under its extras ceiling (list prices, in kobo). */
export function assessExtra(w: WishFacts | null, payerId: string | null, sku: string, book: EntitlementsRow, listKobo: (sku: string) => bigint): string | null {
  const r = reach(w, payerId);
  if (r || !w) return r;
  if (w.state !== "draft" && w.state !== "sealed") return "wish_not_open_to_extras";
  if (!w.ticket) return "extra_needs_a_ticket";
  const takes = grantOf(book, `ticket.${w.ticket}`)?.takes;
  if (!Array.isArray(takes) || !takes.includes(sku)) return "extra_not_taken_by_ticket";
  if (w.adds.includes(sku) && !REPEATABLE_EXTRAS.has(sku)) return "extra_already_held";
  if (w.ticket === "keepsake") {
    const held = w.adds.filter((a) => a.startsWith("extra.")).reduce((s, a) => s + listKobo(a), 0n);
    if (held + listKobo(sku) > book.keepsakeExtrasCeilingKobo) return "keepsake_extras_ceiling";
  }
  return null;
}

/** A keep: a wish that is live or resting, on a ticket the book says may be kept (a wish with no ticket is on the moment line). */
export function assessKeep(w: WishFacts | null, payerId: string | null, book: EntitlementsRow): string | null {
  const r = reach(w, payerId);
  if (r || !w) return r;
  if (w.state !== "live" && w.state !== "resting") return "wish_not_live";
  if (grantOf(book, `ticket.${w.ticket ?? "moment"}`)?.keepable !== true) return "ticket_not_keepable";
  return null;
}

export const REASON_TEXT: Record<string, string> = {
  wish_not_payers: "Name one of your own wishes.",
  wish_erased: "This wish was erased.",
  wish_removed: "This wish was taken down.",
  wish_sealed: "This wish is already sealed.",
  ticket_already_held: "This wish already has this ticket.",
  wish_has_ticket: "This wish already has a ticket. A ticket cannot be bought on top of it.",
  ticket_not_an_upgrade: "This wish already has a ticket as good as this one.",
  wish_not_open_to_extras: "Extras can be added until the wish opens.",
  extra_needs_a_ticket: "Pick a ticket for this wish first.",
  extra_not_taken_by_ticket: "This ticket does not take that extra.",
  extra_already_held: "This wish already has that extra.",
  keepsake_extras_ceiling: "Too many extras for a Keepsake.",
  wish_not_live: "Only a wish that is showing or resting can be kept.",
  ticket_not_keepable: "This ticket cannot be kept longer.",
};
