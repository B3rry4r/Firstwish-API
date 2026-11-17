import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { PAYMENTS_ABANDON_AFTER_MINUTES as PLAN_PENDING_MINUTES } from "../payments/abandon";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import type { PlanUsage } from "../purchases/business-handlers";
import { BusinessHandlers } from "../purchases/business-handlers";
import { addMonths, monthKey, num } from "../purchases/grants";
import type { Tx } from "../purchases/grants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GB = 1_000_000_000;
const MONTHLY = new Set(["starter", "studio"]);

/** The plan and what it has left, all worked out here (E-27, E-128, and the Business shape). */
export interface PlanState {
  plan: string | null;
  live: boolean;
  month: string | null;
  renews: string | null;
  allowance: number;
  rolled: number;
  used: number;
  total: number;
  left: number;
  pack: number;
  packEnds: string | null;
  canMake: boolean;
  resets: string;
  logins: { used: number; allowed: number };
  vault: { usedGb: number; allowedGb: number; billedKobo: number };
}

/** HR1: what a payment for one plan would do now, in the server's terms (the Plan screen says it before the business pays). */
export interface PlanOffer {
  plan: string;
  name: string;
  priceKobo: number;
  wishes: number;
  logins: number;
  vaultGb: number;
  /** starts: no live plan, a month from now; adds_month: the same plan is live, a month is added to its end; replaces_plan: another plan is live and is replaced from now */
  effect: "starts" | "adds_month" | "replaces_plan";
  startsAt: string;
  /** the day the plan runs to after this payment */
  runsUntil: string;
  /** the live plan's end, the day a month is added to (null when none is live) */
  addsTo: string | null;
  /** the live plan this payment replaces (null unless it replaces one) */
  replaces: string | null;
  words: string;
}

/** HR1: a plan payment of this business that is still waiting (so the screen can carry on with it). */
export interface PendingPlan {
  reference: string;
  plan: string;
  startedAt: string;
  /** HY1: when the payment lapses (the sweep closes it then); the owner may drop it sooner */
  lapsesAt: string;
}

const PLANS_ON_OFFER = ["starter", "studio"];
const day = (d: Date): string => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Reads one business's plan state in one transaction: the month is rolled in memory (peek, OO6: a read writes nothing), then everything else is counted from the rows. Logins and Vault limits come from the entitlements row.
 */
@Injectable()
export class PlanView {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly handlers: BusinessHandlers,
    private readonly entitlements: EntitlementsService,
    private readonly prices: PriceBookService,
  ) {}

  /** The seats the plan allows (the owner's own included), from the entitlements row; a business with no plan has its owner's seat. */
  async loginsAllowed(tx: Tx, plan: string | null): Promise<number> {
    if (!plan) return 1;
    const pro = obj((await this.entitlements.row(tx)).pro);
    return Math.max(int(obj(pro[plan]).logins), 1);
  }

  async seatsUsed(tx: Tx, businessId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM login WHERE "businessId" = ${businessId}::uuid AND coalesce(status, '') <> 'removed'`;
    return 1 + (rows[0]?.n ?? 0);
  }

  /**
   * The business's usage as it stands in the clock's month, WITHOUT writing (OO6): the month is rolled in memory by the same rule as
   * BusinessHandlers (carry once from last month, nothing after a gap), and no row is locked or changed. The roll is written only
   * when a wish is drawn or a payment lands (BusinessHandlers).
   */
  async peek(tx: Tx, businessId: string): Promise<PlanUsage | null> {
    if (!UUID.test(businessId)) return null;
    const b = await tx.business.findUnique({ where: { id: businessId }, select: { plan: true, allowance: true, used: true, rolled: true, month: true, renews: true, pack: true } });
    if (!b) return null;
    const now = this.clock.now();
    const key = monthKey(now);
    let used = num(b.used);
    let rolled = num(b.rolled);
    let month = b.month;
    if (b.month && b.month < key) {
      const last = monthKey(addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -1));
      const monthly = b.plan !== null && MONTHLY.has(b.plan);
      rolled = b.month === last && monthly ? Math.max(num(b.allowance) - Math.max(used - rolled, 0), 0) : 0;
      used = 0;
      month = key;
    }
    const live = b.renews !== null && b.renews.getTime() > now.getTime() && b.plan !== null && MONTHLY.has(b.plan);
    const allowance = num(b.allowance);
    const total = allowance + rolled;
    const left = live ? Math.max(total - used, 0) : 0;
    return { plan: b.plan, month, renews: b.renews, live, allowance, rolled, used, total, left, pack: num(b.pack), canMake: left + num(b.pack) > 0 };
  }

  async state(tx: Tx, businessId: string): Promise<PlanState> {
    if (!UUID.test(businessId)) throw AppError.notFound();
    const u = await this.peek(tx, businessId);
    if (!u) throw AppError.notFound();
    const b = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { packEnds: true, vault: true } });
    const now = this.clock.now();
    const ent = await this.entitlements.row(tx);
    const pro = obj(ent.pro);
    const planGb = u.live && u.plan ? int(obj(pro[u.plan]).vaultGb) : 0;
    const grants = await tx.$queryRaw<{ gb: number }[]>`
      SELECT COALESCE(sum((detail->>'vaultGb')::int), 0)::int AS gb FROM purchase_grant
       WHERE "businessId" = ${businessId}::uuid AND kind = 'wish-pack' AND "revokedAt" IS NULL AND "refusedReason" IS NULL AND "endsAt" > ${now}::timestamptz`;
    const extra = await this.handlers.extraGb(tx, businessId);
    const bytes = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT COALESCE(sum(bytes), 0)::bigint AS n FROM stored_file
       WHERE "businessId" = ${businessId}::uuid AND purpose = 'vault-file' AND status IN ('uploaded', 'screening', 'ready')`;
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return {
      plan: u.plan,
      live: u.live,
      month: u.month,
      renews: u.renews ? u.renews.toISOString() : null,
      allowance: u.allowance,
      rolled: u.rolled,
      used: u.used,
      total: u.total,
      left: u.left,
      pack: u.pack,
      packEnds: b.packEnds ? b.packEnds.toISOString() : null,
      canMake: u.canMake,
      resets: first.toISOString(),
      logins: { used: await this.seatsUsed(tx, businessId), allowed: await this.loginsAllowed(tx, u.plan) },
      vault: { usedGb: Math.ceil(Number(bytes[0]?.n ?? 0n) / GB), allowedGb: planGb + (grants[0]?.gb ?? 0) + extra, billedKobo: Number(b.vault ?? 0n) },
    };
  }

  /** The plan payment of this business that is still waiting (started under the lapse time), newest first; null when none. */
  async pending(tx: Tx, businessId: string): Promise<PendingPlan | null> {
    const since = new Date(this.clock.now().getTime() - PLAN_PENDING_MINUTES * 60_000);
    const p = await tx.payment.findFirst({
      where: { businessId, purpose: "pro_plan", status: { in: ["pending", "started"] }, fulfilledAt: null, createdAt: { gt: since } },
      orderBy: { id: "desc" },
      select: { providerReference: true, lines: true, createdAt: true },
    });
    if (!p) return null;
    const sku = (Array.isArray(p.lines) ? (p.lines[0] as { sku?: string } | undefined) : undefined)?.sku ?? "";
    return { reference: p.providerReference, plan: sku.slice("pro.".length), startedAt: p.createdAt.toISOString(), lapsesAt: new Date(p.createdAt.getTime() + PLAN_PENDING_MINUTES * 60_000).toISOString() };
  }

  /**
   * HR1: for each plan on offer, what a payment now would do. Same rule as the plan handler (BusinessHandlers.plan): with a live plan
   * the plan paid for replaces it from now (its wish allowance too; the wishes already used this month stay counted) and the end is
   * pushed one month on from the end already paid, so the time paid for is kept; with none live the plan starts today for a month.
   */
  async offers(tx: Tx, businessId: string): Promise<PlanOffer[]> {
    const u = await this.peek(tx, businessId);
    if (!u) throw AppError.notFound();
    const now = this.clock.now();
    const ent = await this.entitlements.row(tx);
    const quote = await this.prices.quote(PLANS_ON_OFFER.map((k) => ({ sku: `pro.${k}` })), now, { db: tx });
    const nameOf = (plan: string | null): string => (plan ? (quote.lines.find((l) => l.sku === `pro.${plan}`)?.name ?? plan) : "");
    return quote.lines.map((line): PlanOffer => {
      const plan = line.sku.slice("pro.".length);
      const g = grantOf(ent, line.sku);
      const live = u.live && u.renews;
      const effect = !live ? "starts" : u.plan === plan ? "adds_month" : "replaces_plan";
      const ends = addMonths(live && u.renews ? u.renews : now, 1);
      const words =
        effect === "starts"
          ? `Paying starts ${line.name} today. It runs to ${day(ends)}.`
          : effect === "adds_month"
            ? `You are on ${line.name} until ${day(u.renews as Date)}. Paying adds a month: it then runs to ${day(ends)}.`
            : `You are on ${nameOf(u.plan)} until ${day(u.renews as Date)}. Paying for ${line.name} swaps it in from today. The time you paid for is kept: ${line.name} runs to ${day(ends)}. This month's wishes already made stay counted.`;
      return {
        plan,
        name: line.name,
        priceKobo: line.unitKobo,
        wishes: num(g?.wishes),
        logins: num(g?.logins),
        vaultGb: num(g?.vaultGb),
        effect,
        startsAt: now.toISOString(),
        runsUntil: ends.toISOString(),
        addsTo: live && u.renews ? u.renews.toISOString() : null,
        replaces: effect === "replaces_plan" ? u.plan : null,
        words,
      };
    });
  }

  /** E-27: the plan state with what each plan on offer would do, and the plan payment still waiting. */
  async planOf(businessId: string): Promise<PlanState & { offers: PlanOffer[]; pending: PendingPlan | null }> {
    return this.prisma.$transaction(async (tx) => ({ ...(await this.state(tx, businessId)), offers: await this.offers(tx, businessId), pending: await this.pending(tx, businessId) }));
  }

  /** The same, in a transaction of its own (a read: nothing is written). */
  stateOf(businessId: string): Promise<PlanState> {
    return this.prisma.$transaction((tx) => this.state(tx, businessId));
  }
}
