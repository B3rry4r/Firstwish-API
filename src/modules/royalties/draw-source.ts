import type { Prisma } from "@prisma/client";
import { paidLines } from "../payments/settlement.service";

type Tx = Prisma.TransactionClient;

/** The payment a client wish was drawn from, with what that payment paid for the wishes it covers (ZZ5). */
export interface DrawSource {
  paymentId: string;
  /** The sku of the plan or pack line. */
  sku: string;
  /** What the payment's plan or pack line cost, in kobo. */
  lineKobo: bigint;
  /** How many wishes that line gave: the plan's wishes for the month, or the pack's size. */
  wishes: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

interface Candidate {
  paymentId: string;
  sku: string;
  detail: Record<string, unknown>;
  createdAt: Date;
  revokedAt: Date | null;
}

async function grantsOf(tx: Tx, businessId: string, kind: "pro-plan" | "wish-pack"): Promise<Candidate[]> {
  // A refunded payment's grant is revoked in the refund's own transaction, which holds the business row lock the caller holds too.
  const rows = await tx.purchaseGrant.findMany({
    where: { businessId, kind, refusedReason: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { paymentId: true, sku: true, detail: true, createdAt: true, revokedAt: true },
  });
  return rows.map((r) => ({ ...r, detail: (r.detail ?? {}) as Record<string, unknown> }));
}

async function withLine(tx: Tx, c: Candidate, wishes: number): Promise<DrawSource | null> {
  if (wishes <= 0) return null;
  const p = await tx.payment.findUnique({ where: { id: c.paymentId } });
  if (!p || (p.status !== "succeeded" && p.status !== "partly_refunded")) return null;
  const line = paidLines(p).find((l) => l.sku === c.sku);
  if (!line || !(line.totalKobo > 0)) return null;
  return { paymentId: p.id, sku: c.sku, lineKobo: BigInt(line.totalKobo), wishes };
}

/**
 * The plan payment a wish drawn from the month's pool is paid by. The business row carries the allowance of the NEWEST plan payment
 * that stands (the plan handler writes it, a refund works it out again from what remains), so the wish is paid by the newest standing
 * plan payment made by the moment its month's allowance was counted: now for a wish of this month's own allowance. A wish that came
 * out of what rolled over from last month (the first `rolled` of the month: the roll's own sum, allowance - max(used - rolled, 0),
 * says so) is paid by the newest plan payment made by the end of last month, the month it came from.
 */
export async function monthSource(tx: Tx, businessId: string, now: Date): Promise<DrawSource | null> {
  const [b] = await tx.$queryRaw<{ used: number | null; rolled: number | null }[]>`SELECT used, rolled FROM business WHERE id = ${businessId}::uuid`;
  if (!b) return null;
  const rolledWish = num(b.rolled) > 0 && num(b.used) <= num(b.rolled);
  const at = rolledWish ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1) : now;
  const made = (await grantsOf(tx, businessId, "pro-plan")).filter((g) => !g.revokedAt && g.createdAt.getTime() <= at.getTime());
  const pick = made[made.length - 1];
  return pick ? withLine(tx, pick, num(pick.detail.wishes)) : null;
}

/**
 * The pack payment a wish drawn from packs is paid by: packs are used oldest first, so the n-th pack wish the business has drawn
 * (counted from its client-wish records, this wish's own record left out) is paid by the grant where the running total of pack
 * sizes passes n. A refunded pack counts only the wishes drawn from it before the refund (recorded on the grant when it was revoked).
 */
export async function packSource(tx: Tx, businessId: string, wishId: string): Promise<DrawSource | null> {
  const [n] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM client_wish WHERE "businessId" = ${businessId}::uuid AND COALESCE("drawFrom"::text, "from") = 'pack' AND "wishId" IS DISTINCT FROM ${wishId}::uuid`;
  let before = n?.n ?? 0;
  for (const g of await grantsOf(tx, businessId, "wish-pack")) {
    const size = g.revokedAt ? num(g.detail.drawn) : num(g.detail.wishes);
    if (before < size) return g.revokedAt ? null : withLine(tx, g, size);
    before -= size;
  }
  return null;
}


/** HD2: where a draw was counted from and the payment it was counted against, as the client-wish record keeps them. */
export interface DrawColumns {
  drawFrom: "month" | "pack";
  drawPaymentId: string | null;
  drawSku: string | null;
  drawWishes: number | null;
}

/**
 * HD2: the source of a draw, worked out AT the draw (the business row and the grants are as the draw left them) and written on the
 * client-wish record with it. The royalty at the seal reads it back with `sourceOfRecord`; it never works the source out again, so a
 * month's wishes sealed late (or after the month rolled again) earn from the payment they were counted against.
 */
export async function drawColumnsAt(tx: Tx, businessId: string, from: "month" | "pack", wishId: string, now: Date): Promise<DrawColumns> {
  const src = from === "month" ? await monthSource(tx, businessId, now) : await packSource(tx, businessId, wishId);
  return { drawFrom: from, drawPaymentId: src?.paymentId ?? null, drawSku: src?.sku ?? null, drawWishes: src?.wishes ?? null };
}

/**
 * HD2: the source a client-wish record names. The line's cost is read from the payment as it stands: a payment that was refunded in
 * full (or is not paid) no longer pays a royalty. Null when the record names no payment (a wish drawn before the record kept one).
 */
export async function sourceOfRecord(tx: Tx, rec: { drawPaymentId: string | null; drawSku: string | null; drawWishes: number | null }): Promise<DrawSource | null> {
  if (!rec.drawPaymentId || !rec.drawSku || !rec.drawWishes) return null;
  return withLine(tx, { paymentId: rec.drawPaymentId, sku: rec.drawSku, detail: {}, createdAt: new Date(0), revokedAt: null }, rec.drawWishes);
}
