import type { Entitlements as EntitlementsRow, Prisma } from "@prisma/client";
import { grantOf } from "../price-book/entitlements.service";
import { includedInTicket } from "../purchases/wish-rules";

/**
 * IL2: one extra a wish holds, as the owner's read says it (so no screen reads /payments to know). `from` is where it came from: "ticket" (the ticket's own
 * price includes it) or "purchase" (bought as an extra). `refund` is the state of the refund of that purchase: "sent" (on its way: the wish no longer counts
 * it), "done" (the money is back), or null. `held` says the wish still holds it for its own rules (not refunded away). `reference` is the payment's.
 */
export interface WishAdd {
  sku: string;
  from: "ticket" | "purchase";
  held: boolean;
  refund: "sent" | "done" | null;
  reference: string | null;
}

type Db = Pick<Prisma.TransactionClient, "purchaseGrant">;

/**
 * The extras each wish holds: those its ticket includes (read from the price book, never a list of names) and each extra bought for it (its purchase rows,
 * with the state of a refund of the payment). ONE query for the whole page of wishes, never one a wish. A purchase that was refunded and taken back stays in
 * the list with refund "done" and held false, so a screen can say so.
 */
export async function addsFor(db: Db, book: EntitlementsRow, wishes: readonly { id: string; ticket: string | null; adds: unknown }[]): Promise<Map<string, WishAdd[]>> {
  const out = new Map<string, WishAdd[]>();
  if (wishes.length === 0) return out;
  const tickets = (book.tickets && typeof book.tickets === "object" && !Array.isArray(book.tickets) ? book.tickets : {}) as Record<string, unknown>;
  const extraNames = tickets.extras && typeof tickets.extras === "object" && !Array.isArray(tickets.extras) ? Object.keys(tickets.extras) : [];
  const rows = await db.purchaseGrant.findMany({
    where: { wishId: { in: wishes.map((w) => w.id) }, kind: "extra", refusedReason: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { wishId: true, sku: true, revokedAt: true, payment: { select: { providerReference: true, refundByPayment: { select: { status: true } } } } },
  });
  for (const w of wishes) {
    const list: WishAdd[] = [];
    if (w.ticket && grantOf(book, `ticket.${w.ticket}`)) {
      for (const name of [...extraNames].sort()) if (includedInTicket(book, w.ticket, `extra.${name}`)) list.push({ sku: `extra.${name}`, from: "ticket", held: true, refund: null, reference: null });
    }
    const mine = rows.filter((r) => r.wishId === w.id);
    const live = new Map<string, number>();
    for (const r of mine) {
      const states = r.payment.refundByPayment.map((x) => x.status);
      const refund = states.includes("sent") ? "sent" : states.includes("succeeded") ? "done" : null;
      // a purchase taken back with no refund behind it (nothing to say) is left out
      if (r.revokedAt && refund === null) continue;
      const held = r.revokedAt === null && refund !== "sent";
      if (r.revokedAt === null) live.set(r.sku, (live.get(r.sku) ?? 0) + 1);
      list.push({ sku: r.sku, from: "purchase", held, refund, reference: r.payment.providerReference });
    }
    // an extra on the wish with no purchase row behind it (older rows): still held, from a purchase
    const counted = new Map(live);
    for (const a of Array.isArray(w.adds) ? w.adds : []) {
      if (typeof a !== "string") continue;
      const left = counted.get(a) ?? 0;
      if (left > 0) counted.set(a, left - 1);
      else if (!list.some((x) => x.sku === a && x.from === "ticket")) list.push({ sku: a, from: "purchase", held: true, refund: null, reference: null }); // an extra the ticket includes shows once, from the ticket
    }
    out.set(w.id, list);
  }
  return out;
}
