import type { Prisma } from "@prisma/client";

/**
 * HZ2, IC4: a wish being made for a Concierge order (tied to it, not yet delivered) does not exist for the buyer: not in any count, list or feed,
 * 404 by its id on every route of theirs, and its public link opens for nobody. Delivering the order (a concierge_order_wish row) shows it.
 * Staff routes of the order's maker read it through the order, never through this condition.
 */
export const SHOWN_TO_BUYER: Prisma.WishWhereInput = { OR: [{ conciergeOrderId: null }, { conciergeOrderWishByWish: { isNot: null } }] };

/** True when the wish is tied to an order that has not delivered it. A wish that is not there is not hidden (the caller's own 404 follows). */
export async function hiddenFromBuyer(db: { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> }, wishId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM wish w WHERE w.id = ${wishId}::uuid AND w."conciergeOrderId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM concierge_order_wish d WHERE d."wishId" = w.id)`;
  return rows.length > 0;
}
