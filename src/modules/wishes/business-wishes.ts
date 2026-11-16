import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * ZB4, ZB5: a wish that carries a business belongs to the business, not to the login who made it. Every wish of the business
 * made from one of `fromAccountIds` (drafts, sealed, live, resting) passes to the business owner's account. One statement, in
 * the caller's transaction. A business whose owner is erased is left alone (its erase handles its wishes). Answers how many moved.
 */
export async function passBusinessWishesToOwner(tx: Tx, a: { fromAccountIds: string[]; businessId?: string }): Promise<number> {
  if (!a.fromAccountIds.length) return 0;
  const only = a.businessId ?? null;
  return tx.$executeRaw`
    UPDATE wish w SET "accountId" = b."accountId", "updatedAt" = now(), version = w.version + 1
      FROM business b JOIN account o ON o.id = b."accountId"
     WHERE b.id = w."businessId" AND o."erasedAt" IS NULL AND w."accountId" = ANY(${a.fromAccountIds}::uuid[])
       AND w."accountId" <> b."accountId" AND (${only}::uuid IS NULL OR w."businessId" = ${only}::uuid)`;
}
