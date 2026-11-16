import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { EntitlementsService } from "../price-book/entitlements.service";
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

  /** The same, in a transaction of its own (a read: nothing is written). */
  stateOf(businessId: string): Promise<PlanState> {
    return this.prisma.$transaction((tx) => this.state(tx, businessId));
  }
}
