import type { Payment, Prisma } from "@prisma/client";
import { normaliseId } from "../../common/normalise/id";
import { PAYMENTS_ABANDON_AFTER_MINUTES } from "./abandon";

/** ID1: the ticket payment of a wish that still waits to be paid, as the wish read gives it. */
export interface WaitingTicket {
  ticket: string;
  reference: string;
  startedAt: string;
  lapsesAt: string;
}

type Db = Pick<Prisma.TransactionClient, "payment">;

/**
 * ID1: the ticket payment of this wish, started by this account, that is still waiting: pending or started, not fulfilled, and younger than the time a
 * waiting payment lasts (the sweep marks it abandoned after that). Newest first when more than one waits (older data).
 */
export async function waitingTicketPayment(db: Db, accountId: string, wishId: string, now: Date): Promise<Payment | null> {
  const since = new Date(now.getTime() - PAYMENTS_ABANDON_AFTER_MINUTES * 60_000);
  return db.payment.findFirst({
    where: { accountId, purpose: "ticket", subjectId: normaliseId(wishId), status: { in: ["pending", "started"] }, fulfilledAt: null, createdAt: { gt: since } },
    orderBy: { id: "desc" },
  });
}

/** IF3: the payment of this extra for this wish, started by this account, that still waits (same rule as a ticket's), or null. */
export async function waitingExtraPayment(db: Db, accountId: string, wishId: string, sku: string, now: Date): Promise<Payment | null> {
  const since = new Date(now.getTime() - PAYMENTS_ABANDON_AFTER_MINUTES * 60_000);
  const rows = await db.payment.findMany({
    where: { accountId, purpose: "extra", subjectId: normaliseId(wishId), status: { in: ["pending", "started"] }, fulfilledAt: null, createdAt: { gt: since } },
    orderBy: { id: "desc" },
  });
  return rows.find((p) => skuOf(p) === sku) ?? null;
}

/** The sku of a payment's first line. */
export function skuOf(p: Pick<Payment, "lines">): string {
  const first = (Array.isArray(p.lines) ? p.lines[0] : undefined) as { sku?: unknown } | undefined;
  return typeof first?.sku === "string" ? first.sku : "";
}

/** The ticket a payment's own line names ("moment", "keepsake", ...). */
export function ticketOf(p: Pick<Payment, "lines">): string {
  const first = (Array.isArray(p.lines) ? p.lines[0] : undefined) as { sku?: unknown } | undefined;
  const sku = typeof first?.sku === "string" ? first.sku : "";
  return sku.startsWith("ticket.") ? sku.slice("ticket.".length) : "";
}

export function waitingView(p: Payment): WaitingTicket {
  return {
    ticket: ticketOf(p),
    reference: p.providerReference,
    startedAt: p.createdAt.toISOString(),
    lapsesAt: new Date(p.createdAt.getTime() + PAYMENTS_ABANDON_AFTER_MINUTES * 60_000).toISOString(),
  };
}
