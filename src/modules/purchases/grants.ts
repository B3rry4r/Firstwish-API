import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { flagRefundDue } from "../refunds/refund-due";

export type Tx = Prisma.TransactionClient;
export type Detail = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

/** Calendar months in UTC, clamped to the end of a shorter month (31 January plus one month is 28 or 29 February). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

export const monthKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export interface GrantRow {
  id: string;
  paymentId: string;
  sku: string;
  kind: string;
  accountId: string | null;
  businessId: string | null;
  wishId: string | null;
  detail: Detail;
  startsAt: Date;
  endsAt: Date | null;
  refusedReason: string | null;
  revokedAt: Date | null;
}

/**
 * The record of what each paid line granted (table purchase_grant): one row per payment and line. A handler claims its row first;
 * a row that is already there means the line was done, so the second call changes nothing. A line that could not be granted keeps
 * a row with the reason and flags the payment for a refund, so staff see it and a replay does not try again.
 */
@Injectable()
export class GrantStore {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** Takes the line's row. Answers its id, or null when this payment's line already has one (nothing more to do). */
  async claim(tx: Tx, ctx: FulfilmentContext, kind: string, who: { wishId?: string | null; businessId?: string | null } = {}): Promise<string | null> {
    const now = this.clock.now();
    const named = typeof who.wishId === "string" && UUID.test(who.wishId) ? who.wishId : null;
    // the wish is named on the row only when it exists (the row has a foreign key to the wish); a line for a missing wish is refused later
    const wishId = named && (await tx.wish.findUnique({ where: { id: named }, select: { id: true } })) ? named : null;
    const id = this.ids.id();
    const made = await tx.purchaseGrant.createMany({
      data: [{ id, paymentId: ctx.payment.id, sku: ctx.line.sku, kind, accountId: ctx.payment.accountId, businessId: who.businessId ?? ctx.payment.businessId ?? null, wishId, detail: {}, startsAt: now, createdAt: now }],
      skipDuplicates: true,
    });
    return made.count === 1 ? id : null;
  }

  /** Writes what was granted (and what a refund needs to take back) on the claimed row. */
  async record(tx: Tx, id: string, detail: Detail, endsAt: Date | null = null): Promise<void> {
    await tx.purchaseGrant.update({ where: { id }, data: { detail: detail as Prisma.InputJsonValue, endsAt } });
  }

  /** The wish a granted line changed, named on its row. */
  async nameWish(tx: Tx, id: string, wishId: string): Promise<void> {
    await tx.purchaseGrant.update({ where: { id }, data: { wishId } });
  }

  /** Nothing is granted: the reason is kept and the payment is flagged for a refund. */
  async refuse(tx: Tx, ctx: FulfilmentContext, id: string, reason: string): Promise<void> {
    await tx.purchaseGrant.update({ where: { id }, data: { refusedReason: reason } });
    await flagRefundDue(tx, ctx.payment.id, reason);
  }

  async list(tx: Tx, paymentId: string): Promise<GrantRow[]> {
    const rows = await tx.purchaseGrant.findMany({ where: { paymentId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map((r) => ({ ...r, detail: (r.detail ?? {}) as Detail }));
  }

  async markRevoked(tx: Tx, id: string): Promise<void> {
    await tx.purchaseGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: this.clock.now() } });
  }
}
