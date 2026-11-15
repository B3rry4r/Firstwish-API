import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
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
}

const MONTHLY = new Set(["starter", "studio"]);

/**
 * What the business lines buy: a Pro plan (the month's wishes, logins and Vault GB), a wish pack (5 wishes and 20 GB for 90 days)
 * and Vault space (blocks of GB for a period). The numbers are the entitlements row's; nothing here is typed in.
 */
@Injectable()
export class BusinessHandlers {
  constructor(
    private readonly store: GrantStore,
    private readonly clock: Clock,
  ) {}

  private async lockBusiness(tx: Tx, id: string | null): Promise<Biz | null> {
    if (!id) return null;
    const rows = await tx.$queryRaw<Biz[]>`
      SELECT id::text AS id, plan, allowance, used, rolled, month, renews, since, pack, "packEnds" FROM business WHERE id = ${id}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async plan(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "pro-plan");
    if (!grantId) return;
    const b = await this.lockBusiness(tx, ctx.payment.businessId);
    if (!b) return this.store.refuse(tx, ctx, grantId, "no_business");
    const plan = line.sku.slice("pro.".length);
    const g = await ctx.grant();
    const now = this.clock.now();
    const key = monthKey(now);
    const before = { plan: b.plan, allowance: b.allowance, used: b.used, rolled: b.rolled, month: b.month, renews: b.renews?.toISOString() ?? null, since: b.since?.toISOString() ?? null };
    let data: Record<string, unknown>;
    if (b.month === key && b.renews && b.renews.getTime() > now.getTime()) {
      // Paid again inside a month already paid for: the plan may change now, the month is added to the end, and nothing is lost.
      data = { plan, allowance: num(g.wishes), renews: addMonths(b.renews, 1) };
    } else {
      // A new month: what was not used of last month's own allowance rolls over once (lib/pro-data.ts roll()); older than that, nothing.
      const last = monthKey(addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -1));
      const wasLast = b.month === last && b.plan !== null && MONTHLY.has(b.plan);
      const rolled = wasLast ? Math.max(num(b.allowance) - Math.max(num(b.used) - num(b.rolled), 0), 0) : 0;
      data = { plan, allowance: num(g.wishes), used: 0, rolled, month: key, renews: addMonths(now, 1) };
    }
    await tx.business.update({ where: { id: b.id }, data: { ...data, since: b.since ?? now, version: { increment: 1 } } });
    await this.store.record(tx, grantId, { plan, wishes: num(g.wishes), logins: num(g.logins), vaultGb: num(g.vaultGb), rolled: data.rolled ?? null, before, month: key }, data.renews as Date);
  }

  async pack(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "wish-pack");
    if (!grantId) return;
    const b = await this.lockBusiness(tx, ctx.payment.businessId);
    if (!b) return this.store.refuse(tx, ctx, grantId, "no_business");
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
    await this.store.record(tx, grantId, { wishes, packs: line.qty, vaultGb: num(g.vaultGb) * line.qty, days: num(g.days), previousPackEnds: b.packEnds?.toISOString() ?? null, setPlan }, ends);
  }

  async vault(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "vault-space");
    if (!grantId) return;
    const b = await this.lockBusiness(tx, ctx.payment.businessId);
    if (!b) return this.store.refuse(tx, ctx, grantId, "no_business");
    const g = await ctx.grant();
    const ends = addDays(this.clock.now(), num(g.days));
    await tx.business.update({ where: { id: b.id }, data: { version: { increment: 1 } } });
    await this.store.record(tx, grantId, { gb: num(g.vaultGb) * line.qty, blocks: line.qty, days: num(g.days) }, ends);
  }

  /**
   * Extra Vault GB the business holds now from Vault space it bought (live, not refunded). The business columns hold no such number,
   * so the Vault's limit adds this to the plan's and the packs' GB.
   */
  async extraGb(tx: Tx, businessId: string): Promise<number> {
    const now = this.clock.now();
    const rows = await tx.$queryRaw<{ gb: number | null }[]>`
      SELECT COALESCE(sum((detail->>'gb')::int), 0)::int AS gb FROM purchase_grant
       WHERE "businessId" = ${businessId}::uuid AND kind = 'vault-space' AND "revokedAt" IS NULL AND "refusedReason" IS NULL AND "endsAt" > ${now}::timestamptz`;
    return rows[0]?.gb ?? 0;
  }

  /**
   * A client wish counted against the business: the month's allowance (and what rolled in) first, a wish pack after, each by ONE
   * conditional UPDATE. Answers where it was counted from, or null when nothing is left.
   */
  async draw(tx: Tx, businessId: string): Promise<"month" | "pack" | null> {
    const month = await tx.$queryRaw<{ id: string }[]>`
      UPDATE business SET used = COALESCE(used, 0) + 1, version = version + 1
       WHERE id = ${businessId}::uuid AND COALESCE(used, 0) < COALESCE(allowance, 0) + COALESCE(rolled, 0) RETURNING id::text AS id`;
    if (month.length) return "month";
    const pack = await tx.$queryRaw<{ id: string }[]>`
      UPDATE business SET pack = pack - 1, version = version + 1
       WHERE id = ${businessId}::uuid AND COALESCE(pack, 0) > 0 RETURNING id::text AS id`;
    return pack.length ? "pack" : null;
  }

  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    const b = await this.lockBusiness(tx, g.businessId);
    if (!b) return "business_gone";
    const d = g.detail;
    if (g.kind === "wish-pack") {
      const pack = Math.max(num(b.pack) - num(d.wishes), 0);
      await tx.business.update({
        where: { id: b.id },
        data: { pack, ...(pack === 0 && d.setPlan === true && b.plan === "pack" ? { plan: null } : {}), version: { increment: 1 } },
      });
    } else if (g.kind === "pro-plan") {
      const was = (d.before ?? {}) as Record<string, unknown>;
      const iso = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
      await tx.business.update({
        where: { id: b.id },
        data: {
          plan: typeof was.plan === "string" ? was.plan : null,
          allowance: typeof was.allowance === "number" ? was.allowance : null,
          used: typeof was.used === "number" ? was.used : null,
          rolled: typeof was.rolled === "number" ? was.rolled : null,
          month: typeof was.month === "string" ? was.month : null,
          renews: iso(was.renews),
          version: { increment: 1 },
        },
      });
    }
    return "revoked";
  }
}
