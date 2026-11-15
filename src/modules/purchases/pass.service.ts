import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { addDays, GrantStore, num, type GrantRow, type Tx } from "./grants";

export type PassCounter = "wishes" | "upgrades";

/**
 * The Pass: a year from the payment, its wishes and upgrades counters from the entitlements row of the price book (snapshotted on the
 * grant, so a later price-book change does not move what a buyer already has). A second Pass bought while one is live starts at the end
 * of the live one: its own row, its own counters, drawn from once its time comes.
 */
@Injectable()
export class PassService {
  constructor(
    private readonly store: GrantStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async fulfil(ctx: FulfilmentContext): Promise<void> {
    const { tx, payment } = ctx;
    const grantId = await this.store.claim(tx, ctx, "pass");
    if (!grantId) return;
    if (!payment.accountId) return this.store.refuse(tx, ctx, grantId, "no_account");
    const now = this.clock.now();
    const g = await ctx.grant();
    const days = num(g.termDays, 365);
    const live = await tx.$queryRaw<{ ends: Date | null }[]>`
      SELECT max((("validUntil" #>> '{}'))::timestamptz) AS ends FROM pass_membership
       WHERE "accountId" = ${payment.accountId}::uuid AND state = 'active' AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz`;
    const since = live[0]?.ends && live[0].ends.getTime() > now.getTime() ? live[0].ends : now;
    const validUntil = addDays(since, days);
    const way = typeof ctx.request.way === "string" ? ctx.request.way : (payment.channel ?? "card");
    await tx.passMembership.create({
      data: { id: this.ids.id(), accountId: payment.accountId, paymentId: payment.id, amount: payment.amountKobo, since, validUntil: validUntil.toISOString(), way, wishesUsed: 0, upgradesUsed: 0, state: "active" },
    });
    await this.store.record(
      tx,
      grantId,
      { wishes: num(g.wishes), upgrades: num(g.upgrades), conciergeDiscountPercent: num(g.conciergeDiscountPercent), termDays: days, since: since.toISOString(), validUntil: validUntil.toISOString(), extended: since !== now },
      validUntil,
    );
  }

  /**
   * Draws one wish or one upgrade down from the Pass the account has now: ONE conditional UPDATE (used < the granted count), so 20 at
   * once with 1 left give exactly one yes. False when no live Pass has one left. Run it in the transaction of the wish being made.
   */
  async draw(tx: Tx, accountId: string, counter: PassCounter): Promise<boolean> {
    const now = this.clock.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows =
        counter === "wishes"
          ? await tx.$queryRaw<{ id: string }[]>`
              UPDATE pass_membership pm SET "wishesUsed" = COALESCE(pm."wishesUsed", 0) + 1, version = pm.version + 1
                FROM purchase_grant g
               WHERE g."paymentId" = pm."paymentId" AND g.sku = 'pass.year' AND g."revokedAt" IS NULL
                 AND COALESCE(pm."wishesUsed", 0) < (g.detail->>'wishes')::int
                 AND pm.id = (SELECT p2.id FROM pass_membership p2 JOIN purchase_grant g2 ON g2."paymentId" = p2."paymentId" AND g2.sku = 'pass.year' AND g2."revokedAt" IS NULL
                               WHERE p2."accountId" = ${accountId}::uuid AND p2.state = 'active' AND p2.since <= ${now}::timestamptz
                                 AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz
                                 AND COALESCE(p2."wishesUsed", 0) < (g2.detail->>'wishes')::int
                               ORDER BY p2.since, p2.id LIMIT 1)
              RETURNING pm.id::text AS id`
          : await tx.$queryRaw<{ id: string }[]>`
              UPDATE pass_membership pm SET "upgradesUsed" = COALESCE(pm."upgradesUsed", 0) + 1, version = pm.version + 1
                FROM purchase_grant g
               WHERE g."paymentId" = pm."paymentId" AND g.sku = 'pass.year' AND g."revokedAt" IS NULL
                 AND COALESCE(pm."upgradesUsed", 0) < (g.detail->>'upgrades')::int
                 AND pm.id = (SELECT p2.id FROM pass_membership p2 JOIN purchase_grant g2 ON g2."paymentId" = p2."paymentId" AND g2.sku = 'pass.year' AND g2."revokedAt" IS NULL
                               WHERE p2."accountId" = ${accountId}::uuid AND p2.state = 'active' AND p2.since <= ${now}::timestamptz
                                 AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz
                                 AND COALESCE(p2."upgradesUsed", 0) < (g2.detail->>'upgrades')::int
                               ORDER BY p2.since, p2.id LIMIT 1)
              RETURNING pm.id::text AS id`;
      if (rows.length) return true;
      // The row picked was drawn empty by a rival between the pick and the update: look once more for another with a place left.
      const left = await this.hasPlace(tx, accountId, counter, now);
      if (!left) return false;
    }
    return false;
  }

  private async hasPlace(tx: Tx, accountId: string, counter: PassCounter, now: Date): Promise<boolean> {
    const col = counter === "wishes" ? "wishes" : "upgrades";
    const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pass_membership p JOIN purchase_grant g ON g."paymentId" = p."paymentId" AND g.sku = 'pass.year' AND g."revokedAt" IS NULL
        WHERE p."accountId" = $1::uuid AND p.state = 'active' AND p.since <= $2::timestamptz AND (("validUntil" #>> '{}'))::timestamptz > $2::timestamptz
          AND COALESCE(p."${col}Used", 0) < (g.detail->>'${col}')::int`,
      accountId,
      now,
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    await tx.passMembership.updateMany({ where: { paymentId: g.paymentId, state: "active" }, data: { state: "refunded", version: { increment: 1 } } });
    return "revoked";
  }
}
