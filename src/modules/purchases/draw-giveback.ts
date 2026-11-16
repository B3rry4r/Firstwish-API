import { monthKey, type Tx } from "./grants";

/**
 * INT-7 (the open line of the sweep, P-B17b): a draft client wish a business drew a wish for, removed for good (its restore window ended,
 * or it was erased), gives that wish back. The source of the draw is on the client-wish record (HD2: drawFrom, set at the draw):
 *  - month: the business's `used` goes down by one only when the draw was made in the month still running (a month that has turned
 *    already counted it; the carry-over is worked out from what was used), and never below zero;
 *  - pack: the pack goes up by one.
 * HF1: only a source that still stands takes the wish back (the grant of drawPaymentId is not revoked, not refused; a pack has not ended;
 * a month's plan payment stands and the draw is of the month still running). Otherwise the record is marked given back and nothing returns.
 * Once per wish: ONE statement claims each record (drawnBackAt is null -> now), so twenty callers at once give back once; the
 * business row is touched after the claim, wish rows first and business row second, the order every seal takes. A wish that was
 * sealed (a sealedAt, or a move to sealed on record) gives nothing back: its draw was spent on a wish that was sent.
 * Answers how many records were claimed.
 */
/** HF1: the grant of the payment a draw was counted against still stands: not revoked, not refused, and (a pack) not ended. */
async function sourceStands(tx: Tx, businessId: string, paymentId: string, from: string, now: Date): Promise<boolean> {
  const kind = from === "pack" ? "wish-pack" : "pro-plan";
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM purchase_grant
     WHERE "paymentId" = ${paymentId}::uuid AND "businessId" = ${businessId}::uuid AND kind = ${kind}
       AND "revokedAt" IS NULL AND "refusedReason" IS NULL
       AND (${from} <> 'pack' OR "endsAt" IS NULL OR "endsAt" > ${now}::timestamptz)`;
  return (rows[0]?.n ?? 0) > 0;
}

export async function giveBackDraws(tx: Tx, wishIds: string[], now: Date): Promise<number> {
  if (!wishIds.length) return 0;
  const claimed = await tx.$queryRaw<{ id: string; businessId: string; drawFrom: string; createdAt: Date; drawPaymentId: string | null }[]>`
    UPDATE client_wish cw SET "drawnBackAt" = ${now}::timestamptz
      FROM wish w
     WHERE w.id = cw."wishId" AND cw."wishId" = ANY(${wishIds}::uuid[])
       AND cw."drawFrom" IS NOT NULL AND cw."businessId" IS NOT NULL AND cw."drawnBackAt" IS NULL
       AND w."sealedAt" IS NULL
       AND NOT EXISTS (SELECT 1 FROM wish_transition t WHERE t."wishId" = w.id AND t."to"::text = 'sealed')
    RETURNING cw.id::text AS id, cw."businessId"::text AS "businessId", cw."drawFrom"::text AS "drawFrom", cw."createdAt" AS "createdAt",
              cw."drawPaymentId"::text AS "drawPaymentId"`;
  const running = monthKey(now);
  for (const c of claimed) {
    // HF1: the business row is locked first (a refund's revoke holds the same lock while it takes the grant out), then the source is
    // looked at in a statement of its own, so what it sees is what the refund committed. A source that no longer stands (its grant
    // revoked or refused, a pack that has ended) takes nothing back: the record stays marked given back, the counter does not move.
    await tx.$queryRaw`SELECT id FROM business WHERE id = ${c.businessId}::uuid FOR UPDATE`;
    // API-BASE-2: a pack wish goes back to a pack only when it can be traced to a pack grant that still stands; a record that names no
    // payment returns nothing. (A month wish naming no payment still only lowers the month's count, as before.)
    if (c.drawFrom === "pack" && !c.drawPaymentId) continue;
    if (c.drawPaymentId && !(await sourceStands(tx, c.businessId, c.drawPaymentId, c.drawFrom, now))) continue;
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
