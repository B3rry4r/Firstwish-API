import { monthKey, type Tx } from "./grants";

/**
 * INT-7 (the open line of the sweep, P-B17b): a draft client wish a business drew a wish for, removed for good (its restore window ended,
 * or it was erased), gives that wish back. The source of the draw is on the client-wish record (HD2: drawFrom, set at the draw):
 *  - month: the business's `used` goes down by one only when the draw was made in the month still running (a month that has turned
 *    already counted it; the carry-over is worked out from what was used), and never below zero;
 *  - pack: the pack goes up by one.
 * Once per wish: ONE statement claims each record (drawnBackAt is null -> now), so twenty callers at once give back once; the
 * business row is touched after the claim, wish rows first and business row second, the order every seal takes. A wish that was
 * sealed (a sealedAt, or a move to sealed on record) gives nothing back: its draw was spent on a wish that was sent.
 * Answers how many records were claimed.
 */
export async function giveBackDraws(tx: Tx, wishIds: string[], now: Date): Promise<number> {
  if (!wishIds.length) return 0;
  const claimed = await tx.$queryRaw<{ id: string; businessId: string; drawFrom: string; createdAt: Date }[]>`
    UPDATE client_wish cw SET "drawnBackAt" = ${now}::timestamptz
      FROM wish w
     WHERE w.id = cw."wishId" AND cw."wishId" = ANY(${wishIds}::uuid[])
       AND cw."drawFrom" IS NOT NULL AND cw."businessId" IS NOT NULL AND cw."drawnBackAt" IS NULL
       AND w."sealedAt" IS NULL
       AND NOT EXISTS (SELECT 1 FROM wish_transition t WHERE t."wishId" = w.id AND t."to"::text = 'sealed')
    RETURNING cw.id::text AS id, cw."businessId"::text AS "businessId", cw."drawFrom"::text AS "drawFrom", cw."createdAt" AS "createdAt"`;
  const running = monthKey(now);
  for (const c of claimed) {
    if (c.drawFrom === "pack") {
      await tx.$executeRaw`UPDATE business SET pack = COALESCE(pack, 0) + 1, version = version + 1 WHERE id = ${c.businessId}::uuid`;
    } else if (c.drawFrom === "month" && monthKey(c.createdAt) === running) {
      await tx.$executeRaw`
        UPDATE business SET used = GREATEST(COALESCE(used, 0) - 1, 0), version = version + 1
         WHERE id = ${c.businessId}::uuid AND month = ${running}`;
    }
  }
  return claimed.length;
}
