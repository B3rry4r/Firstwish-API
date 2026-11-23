import type { Entitlements as EntitlementsRow, Prisma } from "@prisma/client";
import { grantOf } from "../price-book/entitlements.service";

/** What a wish can have beyond its words: the card and the portrait video come from its ticket or from an extra that was bought. */
export type WishExtra = "qrCard" | "portraitVideo";

const EXTRA_SKU: Record<WishExtra, string> = { qrCard: "extra.qr-card", portraitVideo: "extra.portrait-video" };

/**
 * Whether a wish has the extra: its ticket's entitlement in the price book says so (Signature and up), or the extra was bought
 * for it (the purchase grants add the extra's sku to the wish's `adds`). Nothing is retyped here: the book is the truth.
 */
export function wishHas(book: EntitlementsRow, wish: { ticket: string | null; adds: unknown }, extra: WishExtra): boolean {
  const sku = EXTRA_SKU[extra];
  const adds = Array.isArray(wish.adds) ? wish.adds : [];
  if (adds.includes(sku)) return true;
  if (!wish.ticket) return false;
  return grantOf(book, `ticket.${wish.ticket}`)?.[extra] === true;
}

/**
 * IK4a, N1: the video is the extra's (not its ticket's) and its money went back: a refund of the extra's payment was SENT, or was PROCESSED (the grant is
 * then revoked and the extra is gone from the wish). A refund that failed or was cancelled left the money, so the video is the person's. A ticket that
 * includes the video is never touched here: a ticket refund follows the wish's own rules (the ticket goes, the wish no longer holds the video).
 */
export async function videoRefunded(db: Pick<Prisma.TransactionClient, "purchaseGrant">, book: EntitlementsRow, w: { id: string; ticket: string | null; adds: unknown }): Promise<boolean> {
  if (wishHas(book, { ticket: w.ticket, adds: [] }, "portraitVideo")) return false;
  const held = wishHas(book, w, "portraitVideo");
  const live = held ? { revokedAt: null, refusedReason: null } : {};
  const status = held ? ["sent"] : ["sent", "succeeded"];
  return !!(await db.purchaseGrant.findFirst({ where: { wishId: w.id, kind: "extra", sku: EXTRA_SKU.portraitVideo, ...live, payment: { refundByPayment: { some: { status: { in: status as never } } } } }, select: { id: true } }));
}
