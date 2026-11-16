import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { addDays, GrantStore, num, type GrantRow, type Tx } from "./grants";
import { PassCover } from "./pass-cover";
import { PassDrawService, type PassCounter } from "./pass-draws";

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
    private readonly draws: PassDrawService,
    private readonly cover: PassCover,
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
    // HB1: a Pass bought moves the end of each live wish of the holder
    await this.cover.recompute(tx, payment.accountId);
  }

  /**
   * Draws one wish or one upgrade down from the Pass the account has now (PassDrawService.counter): ONE conditional UPDATE, so 20 at
   * once with 1 left give exactly one yes. False when no live Pass has one left. Run it in the transaction of the wish being made.
   */
  async draw(tx: Tx, accountId: string, counter: PassCounter): Promise<boolean> {
    return (await this.draws.counter(tx, accountId, counter)) !== null;
  }

  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    await tx.passMembership.updateMany({ where: { paymentId: g.paymentId, state: "active" }, data: { state: "refunded", version: { increment: 1 } } });
    // HA2, HB1: each wish's end is worked out again; the rest job rests the ones nothing covers
    if (g.accountId) await this.cover.recompute(tx, g.accountId);
    return "revoked";
  }
}
