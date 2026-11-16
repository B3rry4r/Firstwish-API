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
 * The pack payment a wish drawn from packs is paid by: packs are used oldest first, and each pack's standing draws are counted on their own
 * (the client-wish records naming that pack's payment, this wish's own and those already given back left out: HF2). The wish goes to the
 * oldest pack that is not full, so a wish given back from the first pack leaves a place there that the next draw takes, and no pack is
 * ever named for more wishes than it sold. A refunded pack is closed: it takes no new draw. Records that name no payment (drawn before
 * the record kept one) fill the oldest packs first.
 */
export async function packSource(tx: Tx, businessId: string, wishId: string): Promise<DrawSource | null> {
  for (const p of await packPlaces(tx, businessId, wishId)) {
    if (p.size - p.drawn > 0) {
      const g = p.grant;
      return withLine(tx, g, p.size);
    }
  }
  return null;
}

/**
 * HJ1: each standing pack's size and its own standing draws, counted the one way packSource counts them (the client-wish records naming
 * that pack's payment, given-back ones and `exceptWishId` left out: HF2; records naming no payment fill the oldest packs first).
 * Packs already revoked are left out. The revoke of a pack reads its own unused places from here, so there is no second count.
 */
export async function packPlaces(tx: Tx, businessId: string, exceptWishId: string | null): Promise<{ paymentId: string; size: number; drawn: number; grant: Candidate }[]> {
  const rows = await tx.$queryRaw<{ pid: string | null; n: number }[]>`
    SELECT "drawPaymentId"::text AS pid, count(*)::int AS n FROM client_wish
     WHERE "businessId" = ${businessId}::uuid AND COALESCE("drawFrom"::text, "from") = 'pack' AND "drawnBackAt" IS NULL
       AND (${exceptWishId}::uuid IS NULL OR "wishId" IS DISTINCT FROM ${exceptWishId}::uuid)
     GROUP BY "drawPaymentId"`;
  const own = new Map(rows.filter((r) => r.pid).map((r) => [r.pid as string, r.n]));
  let loose = rows.find((r) => !r.pid)?.n ?? 0;
  const out: { paymentId: string; size: number; drawn: number; grant: Candidate }[] = [];
  for (const g of await grantsOf(tx, businessId, "wish-pack")) {
    if (g.revokedAt) continue;
    const size = num(g.detail.wishes);
    let drawn = own.get(g.paymentId) ?? 0;
    const take = Math.min(loose, Math.max(size - drawn, 0));
    loose -= take;
    drawn += take;
    out.push({ paymentId: g.paymentId, size, drawn, grant: g });
  }
  return out;
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
