import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { addMonths, GrantStore, num, type GrantRow, type Tx } from "./grants";

interface State {
  id: string;
  credits: number | null;
  extraReviews: number | null;
  packs: number | null;
  plan: string | null;
  signed: boolean | null;
  reviewsLeft: number | null;
  renews: Date | null;
  periodEndsAt: Date | null;
}

/** The creator plan, Signed, credit packs and extra reviews: counters on the account's CreatorState, from the entitlements row. */
@Injectable()
export class CreatorHandlers {
  constructor(
    private readonly store: GrantStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** The account's CreatorState, made if it has none, and locked. */
  private async lockState(tx: Tx, accountId: string | null): Promise<State | null> {
    if (!accountId) return null;
    await tx.$executeRaw`
      INSERT INTO creator_state (id, "accountId", credits, "extraReviews", packs, plan, "reviewsLeft", version)
      VALUES (${this.ids.id()}::uuid, ${accountId}::uuid, 0, 0, 0, 'open', 0, 0) ON CONFLICT ("accountId") DO NOTHING`;
    const rows = await tx.$queryRaw<State[]>`
      SELECT id::text AS id, credits, "extraReviews", packs, plan, signed, "reviewsLeft", renews, "periodEndsAt" FROM creator_state WHERE "accountId" = ${accountId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async fulfil(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "creator");
    if (!grantId) return;
    const s = await this.lockState(tx, ctx.payment.accountId);
    if (!s) return this.store.refuse(tx, ctx, grantId, "no_account");
    const g = await ctx.grant();
    const now = this.clock.now();
    const what = line.sku.slice("creator.".length);
    const bump = { version: { increment: 1 } };
    switch (what) {
      case "plan": {
        const renews = addMonths(s.renews && s.renews.getTime() > now.getTime() && s.plan === "creator" ? s.renews : now, 1);
        const credits = num(g.credits);
        await tx.creatorState.update({
          where: { id: s.id },
          data: { plan: "creator", credits: num(s.credits) + credits, reviewsLeft: num(g.reviewsPerMonth), renews, periodEndsAt: renews, ...bump },
        });
        await this.store.record(tx, grantId, { credits, reviewsPerMonth: num(g.reviewsPerMonth), before: { plan: s.plan, reviewsLeft: s.reviewsLeft, renews: s.renews?.toISOString() ?? null, periodEndsAt: s.periodEndsAt?.toISOString() ?? null } }, renews);
        return;
      }
      case "signed": {
        await tx.creatorState.update({ where: { id: s.id }, data: { signed: true, ...bump } });
        await this.store.record(tx, grantId, { signed: true, days: num(g.days), before: { signed: s.signed } });
        return;
      }
      case "credit-pack": {
        const credits = num(g.credits) * line.qty;
        await tx.creatorState.update({ where: { id: s.id }, data: { credits: num(s.credits) + credits, packs: num(s.packs) + line.qty, ...bump } });
        await this.store.record(tx, grantId, { credits, packs: line.qty });
        return;
      }
      default: {
        const reviews = num(g.reviews, 1) * line.qty;
        await tx.creatorState.update({ where: { id: s.id }, data: { extraReviews: num(s.extraReviews) + reviews, ...bump } });
        await this.store.record(tx, grantId, { reviews });
      }
    }
  }

  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    const s = await this.lockState(tx, g.accountId);
    if (!s) return "account_gone";
    const d = g.detail;
    const was = (d.before ?? {}) as Record<string, unknown>;
    const iso = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
    const take = (n: number | null, by: unknown) => Math.max(num(n) - num(by), 0);
    const bump = { version: { increment: 1 } };
    if (g.sku === "creator.plan") {
      await tx.creatorState.update({
        where: { id: s.id },
        data: { plan: typeof was.plan === "string" ? was.plan : "open", credits: take(s.credits, d.credits), reviewsLeft: typeof was.reviewsLeft === "number" ? was.reviewsLeft : 0, renews: iso(was.renews), periodEndsAt: iso(was.periodEndsAt), ...bump },
      });
    } else if (g.sku === "creator.signed") {
      await tx.creatorState.update({ where: { id: s.id }, data: { signed: was.signed === true, ...bump } });
    } else if (g.sku === "creator.credit-pack") {
      await tx.creatorState.update({ where: { id: s.id }, data: { credits: take(s.credits, d.credits), packs: take(s.packs, d.packs), ...bump } });
    } else {
      await tx.creatorState.update({ where: { id: s.id }, data: { extraReviews: take(s.extraReviews, d.reviews), ...bump } });
    }
    return "revoked";
  }
}
