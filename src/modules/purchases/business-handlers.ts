import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { InvoicesService } from "../pro-business/invoices.service";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { addDays, addMonths, GrantStore, monthKey, num, type GrantRow, type Tx } from "./grants";

interface Biz {
  id: string;
  plan: string | null;
  allowance: number | null;
  used: number | null;
  rolled: number | null;
  month: string | null;
  renews: Date | null;
  since: Date | null;
  pack: number | null;
  packEnds: Date | null;
  accountId: string | null;
}

const MONTHLY = new Set(["starter", "studio"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a business may make now (the Pro page's usage, lib/pro-data.ts usage()): the month's pool while the plan is live, then packs. */
export interface PlanUsage {
  plan: string | null;
  month: string | null;
  renews: Date | null;
  live: boolean;
  allowance: number;
  rolled: number;
  used: number;
  total: number;
  left: number;
  pack: number;
  canMake: boolean;
}

/**
 * What the business lines buy: a Pro plan (the month's wishes, logins and Vault GB), a wish pack (5 wishes and 20 GB for 90 days)
 * and Vault space (blocks of GB for a period). The numbers are the entitlements row's; nothing here is typed in.
 *
 * The month (HH1): the server rolls a plan's month whenever the business is read or drawn from, in the same locked transaction, by
 * the rule of lib/pro-data.ts roll(): going from last month to this one, what was not used of last month's OWN allowance carries
 * forward once (allowance - max(used - rolled, 0)); a gap of two months or more carries nothing; used starts again at 0. A plan
 * payment never resets the running month: made while the plan is live it pushes `renews` one month on from its current end.
 */
@Injectable()
export class BusinessHandlers {
  constructor(
    private readonly store: GrantStore,
    private readonly clock: Clock,
    private readonly invoices: InvoicesService,
  ) {}

  /** Locks the business and rolls its month to the clock's month (a no-op inside the month). Answers the row as it now stands. */
  private async lockBusiness(tx: Tx, id: string | null): Promise<Biz | null> {
    if (!id || !UUID.test(id)) return null;
    const rows = await tx.$queryRaw<Biz[]>`
      SELECT id::text AS id, plan, allowance, used, rolled, month, renews, since, pack, "packEnds", "accountId"::text AS "accountId"
        FROM business WHERE id = ${id}::uuid FOR UPDATE`;
    const b = rows[0];
    if (!b) return null;
    const now = this.clock.now();
    const key = monthKey(now);
    if (!b.month || b.month >= key) return b;
    const last = monthKey(addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -1));
    const monthly = b.plan !== null && MONTHLY.has(b.plan);
    const rolled = b.month === last && monthly ? Math.max(num(b.allowance) - Math.max(num(b.used) - num(b.rolled), 0), 0) : 0;
    await tx.business.update({ where: { id: b.id }, data: { month: key, used: 0, rolled, version: { increment: 1 } } });
    return { ...b, month: key, used: 0, rolled };
  }

  /** The business named on a payment is the payer's own: its owner, or someone with an active login on it (HH6; invited and removed logins do not count). */
  private async isPayers(tx: Tx, b: Biz, accountId: string | null): Promise<boolean> {
    if (!accountId || !UUID.test(accountId)) return false;
    if (b.accountId === accountId) return true;
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE l."businessId" = ${b.id}::uuid AND a.contact IS NOT NULL AND lower(trim(l.contact)) = lower(a.contact) AND l.status = 'active'`;
    return (rows[0]?.n ?? 0) > 0;
  }

  /** Locks, rolls and checks the payer's right to the business, or refuses the line. Answers null when it refused. */
  private async own(ctx: FulfilmentContext, grantId: string): Promise<Biz | null> {
    const b = await this.lockBusiness(ctx.tx, ctx.payment.businessId);
    if (!b) {
      await this.store.refuse(ctx.tx, ctx, grantId, "no_business");
      return null;
    }
    if (!(await this.isPayers(ctx.tx, b, ctx.payment.accountId))) {
      await this.store.refuse(ctx.tx, ctx, grantId, "business_not_payers");
      return null;
    }
    return b;
  }

  /** The business's usage now, its month rolled first (HH1). Run it in a transaction: the roll is written under the row lock. */
  async read(tx: Tx, businessId: string): Promise<PlanUsage | null> {
    const b = await this.lockBusiness(tx, businessId);
    if (!b) return null;
    const live = b.renews !== null && b.renews.getTime() > this.clock.now().getTime() && b.plan !== null && MONTHLY.has(b.plan);
    const allowance = num(b.allowance);
    const total = allowance + num(b.rolled);
    const left = live ? Math.max(total - num(b.used), 0) : 0;
    return { plan: b.plan, month: b.month, renews: b.renews, live, allowance, rolled: num(b.rolled), used: num(b.used), total, left, pack: num(b.pack), canMake: left + num(b.pack) > 0 };
  }

  async plan(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "pro-plan");
    if (!grantId) return;
    const b = await this.own(ctx, grantId);
    if (!b) return;
    const plan = line.sku.slice("pro.".length);
    const g = await ctx.grant();
    const now = this.clock.now();
    const live = b.renews !== null && b.renews.getTime() > now.getTime() && b.plan !== null && MONTHLY.has(b.plan);
    let data: Record<string, unknown>;
    if (live && b.renews) {
      // Paid again inside a period already paid for: the plan may change now and the period is pushed one month on from its end.
      // The running month is left as it is; the server rolls it when the month turns.
      data = { plan, allowance: num(g.wishes), renews: addMonths(b.renews, 1) };
    } else {
      // No live plan: a new period from now. A business with no month yet starts this one clean.
      data = { plan, allowance: num(g.wishes), renews: addMonths(now, 1), ...(b.month ? {} : { month: monthKey(now), used: 0, rolled: 0 }) };
    }
    await tx.business.update({ where: { id: b.id }, data: { ...data, since: b.since ?? now, version: { increment: 1 } } });
    await this.store.record(
      tx,
      grantId,
      { plan, wishes: num(g.wishes), logins: num(g.logins), vaultGb: num(g.vaultGb), pushed: live, month: b.month ?? monthKey(now) },
      data.renews as Date,
    );
    await this.invoices.issue(tx, ctx.payment);
  }

  async pack(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "wish-pack");
    if (!grantId) return;
    const b = await this.own(ctx, grantId);
    if (!b) return;
    const g = await ctx.grant();
    const now = this.clock.now();
    const wishes = num(g.wishes) * line.qty;
    const ends = addDays(now, num(g.days));
    const packEnds = b.packEnds && b.packEnds.getTime() > ends.getTime() ? b.packEnds : ends;
    const setPlan = b.plan === null;
    await tx.business.update({
      where: { id: b.id },
      data: { pack: num(b.pack) + wishes, packEnds, ...(setPlan ? { plan: "pack" } : {}), since: b.since ?? now, version: { increment: 1 } },
    });
    await this.store.record(tx, grantId, { wishes, packs: line.qty, vaultGb: num(g.vaultGb) * line.qty, days: num(g.days), setPlan }, ends);
    await this.invoices.issue(tx, ctx.payment);
  }

  async vault(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "vault-space");
    if (!grantId) return;
    const b = await this.own(ctx, grantId);
    if (!b) return;
    const g = await ctx.grant();
    const ends = addDays(this.clock.now(), num(g.days));
    await tx.business.update({ where: { id: b.id }, data: { version: { increment: 1 } } });
    await this.store.record(tx, grantId, { gb: num(g.vaultGb) * line.qty, blocks: line.qty, days: num(g.days) }, ends);
    await this.invoices.issue(tx, ctx.payment);
  }

  /**
   * Extra Vault GB the business holds now from Vault space it bought (live, not refunded). The business columns hold no such number,
   * so the Vault's limit adds this to the plan's and the packs' GB.
   */
  async extraGb(tx: Tx, businessId: string): Promise<number> {
    const now = this.clock.now();
    const rows = await tx.purchaseGrant.findMany({
      where: { businessId, kind: "vault-space", revokedAt: null, refusedReason: null, endsAt: { gt: now } },
      select: { detail: true },
    });
    return rows.reduce((sum, r) => sum + num((r.detail as Record<string, unknown> | null)?.gb), 0);
  }

  /**
   * A client wish counted against the business: the month's pool (allowance and what rolled in) first, a wish pack after, each by ONE
   * conditional UPDATE under the row lock. The month's pool is open only while the plan is live (HH7); pack wishes do not expire.
   * The month is rolled first (HH1). Answers where it was counted from, or null when nothing is left.
   */
  async draw(tx: Tx, businessId: string): Promise<"month" | "pack" | null> {
    const b = await this.lockBusiness(tx, businessId);
    if (!b) return null;
    const now = this.clock.now();
    const month = await tx.$queryRaw<{ id: string }[]>`
      UPDATE business SET used = COALESCE(used, 0) + 1, version = version + 1
       WHERE id = ${businessId}::uuid AND renews > ${now}::timestamptz AND COALESCE(used, 0) < COALESCE(allowance, 0) + COALESCE(rolled, 0)
       RETURNING id::text AS id`;
    if (month.length) return "month";
    const pack = await tx.$queryRaw<{ id: string }[]>`
      UPDATE business SET pack = pack - 1, version = version + 1
       WHERE id = ${businessId}::uuid AND COALESCE(pack, 0) > 0 RETURNING id::text AS id`;
    return pack.length ? "pack" : null;
  }

  /** The grants of a kind for a business that still stand (not revoked, not refused), newest first, leaving out `except` (HH3). */
  private async standing(tx: Tx, businessId: string, kind: string, except: string): Promise<{ detail: Record<string, unknown>; endsAt: Date | null }[]> {
    const rows = await tx.purchaseGrant.findMany({
      where: { businessId, kind, revokedAt: null, refusedReason: null, id: { not: except } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { detail: true, endsAt: true },
    });
    return rows.map((r) => ({ detail: (r.detail ?? {}) as Record<string, unknown>, endsAt: r.endsAt }));
  }

  /**
   * HH3: a refund never restores a snapshot. The grant is taken out and the state is worked out again from the grants that remain.
   * The plan is the newest remaining plan grant, and it stands while its period (the latest end of the remaining ones) is in the
   * future; the pack's wishes come off what is left (less what was used, never below 0).
   */
  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    const b = await this.lockBusiness(tx, g.businessId);
    if (!b) return "business_gone";
    const now = this.clock.now();
    const d = g.detail;
    let result = "revoked";
    if (g.kind === "wish-pack") {
      // TT5: this pack's size comes off what is left, never below 0; what was already used is not taken back and is written on the refund.
      const size = num(d.wishes);
      const pack = Math.max(num(b.pack) - size, 0);
      const used = size - (num(b.pack) - pack);
      if (used > 0) {
        // ZZ5: how many wishes were drawn from this pack stays on the grant, so the later packs still line up with the wishes drawn from them.
        await this.store.record(tx, g.id, { ...d, drawn: used }, g.endsAt);
        await this.store.markRevoked(tx, g.id);
        result = `revoked_${used}_of_${size}_wishes_already_used`;
      }
      const rest = await this.standing(tx, b.id, "wish-pack", g.id);
      const ends = rest.reduce<Date | null>((m, r) => (r.endsAt && (!m || r.endsAt.getTime() > m.getTime()) ? r.endsAt : m), null);
      await tx.business.update({
        where: { id: b.id },
        data: { pack, packEnds: ends, ...(pack === 0 && b.plan === "pack" ? { plan: null } : {}), version: { increment: 1 } },
      });
    } else if (g.kind === "pro-plan") {
      const rest = await this.standing(tx, b.id, "pro-plan", g.id);
      const ends = rest.reduce<Date | null>((m, r) => (r.endsAt && (!m || r.endsAt.getTime() > m.getTime()) ? r.endsAt : m), null);
      const newest = rest[0];
      const stands = !!newest && !!ends && ends.getTime() > now.getTime() && typeof newest.detail.plan === "string";
      await tx.business.update({
        where: { id: b.id },
        data: stands
          ? { plan: String(newest.detail.plan), allowance: num(newest.detail.wishes), renews: ends, version: { increment: 1 } }
          : { plan: num(b.pack) > 0 ? "pack" : null, allowance: null, renews: null, version: { increment: 1 } },
      });
    }
    return result;
  }
}
