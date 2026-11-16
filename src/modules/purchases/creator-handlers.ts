import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { EntitlementsService } from "../price-book/entitlements.service";
import { nextMonthStart, rulesFrom } from "../studio/creator-state.service";
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
    private readonly ent: EntitlementsService,
  ) {}

  /** The account's CreatorState, made if it has none, and locked. */
  private async lockState(tx: Tx, accountId: string | null): Promise<State | null> {
    if (!accountId) return null;
    // XX3: the row is made with the Open plan's start whichever code makes it first (the Studio's own read makes the same row):
    // its 3 credits once, this month's review, the Studio on.
    const rules = await rulesFrom(this.ent, tx);
    await tx.$executeRaw`
      INSERT INTO creator_state (id, "accountId", credits, "extraReviews", packs, plan, "reviewsLeft", "on", signed, "periodEndsAt", version)
      VALUES (${this.ids.id()}::uuid, ${accountId}::uuid, ${rules.creditsOnce}, 0, 0, 'open', ${rules.reviewsPerMonth("open")}, true, false, ${nextMonthStart(this.clock.now())}, 0)
      ON CONFLICT ("accountId") DO NOTHING`;
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
        await this.store.record(tx, grantId, { credits, reviewsPerMonth: num(g.reviewsPerMonth) }, renews);
        return;
      }
      case "signed": {
        await tx.creatorState.update({ where: { id: s.id }, data: { signed: true, ...bump } });
        await this.store.record(tx, grantId, { signed: true, days: num(g.days) });
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

  /** The grants of one line for an account that still stand (not revoked, not refused), newest first, leaving out `except` (HH3). */
  private async standing(tx: Tx, accountId: string, sku: string, except: string): Promise<{ detail: Record<string, unknown>; endsAt: Date | null }[]> {
    const rows = await tx.purchaseGrant.findMany({
      where: { accountId, sku, revokedAt: null, refusedReason: null, id: { not: except } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { detail: true, endsAt: true },
    });
    return rows.map((r) => ({ detail: (r.detail ?? {}) as Record<string, unknown>, endsAt: r.endsAt }));
  }

  /**
   * HH3: no snapshot is restored. The grant is taken out and the plan and Signed are worked out again from the grants that remain:
   * the plan stands while the latest end among the remaining plan grants is in the future; counters come off by what the grant gave.
   */
  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    const s = await this.lockState(tx, g.accountId);
    if (!s || !g.accountId) return "account_gone";
    const d = g.detail;
    const take = (n: number | null, by: unknown) => Math.max(num(n) - num(by), 0);
    const bump = { version: { increment: 1 } };
    if (g.sku === "creator.plan") {
      const rest = await this.standing(tx, g.accountId, "creator.plan", g.id);
      const ends = rest.reduce<Date | null>((m, r) => (r.endsAt && (!m || r.endsAt.getTime() > m.getTime()) ? r.endsAt : m), null);
      const stands = !!rest[0] && !!ends && ends.getTime() > this.clock.now().getTime();
      await tx.creatorState.update({
        where: { id: s.id },
        data: {
          plan: stands ? "creator" : "open",
          credits: take(s.credits, d.credits),
          reviewsLeft: stands ? Math.min(num(s.reviewsLeft), num(rest[0].detail.reviewsPerMonth)) : 0,
          renews: stands ? ends : null,
          periodEndsAt: stands ? ends : null,
          ...bump,
        },
      });
    } else if (g.sku === "creator.signed") {
      const rest = await this.standing(tx, g.accountId, "creator.signed", g.id);
      await tx.creatorState.update({ where: { id: s.id }, data: { signed: rest.length > 0, ...bump } });
    } else if (g.sku === "creator.credit-pack") {
      await tx.creatorState.update({ where: { id: s.id }, data: { credits: take(s.credits, d.credits), packs: take(s.packs, d.packs), ...bump } });
    } else {
      await tx.creatorState.update({ where: { id: s.id }, data: { extraReviews: take(s.extraReviews, d.reviews), ...bump } });
    }
    return "revoked";
  }
}
