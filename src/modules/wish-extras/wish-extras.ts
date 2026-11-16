import type { Entitlements as EntitlementsRow } from "@prisma/client";
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
