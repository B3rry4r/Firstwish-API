import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { RefundEventSink } from "../payments/refund-event-sink";
import { withFlag } from "../payments/payment-options";
import { AuditService } from "../audit/audit.service";
import { NoticesService } from "../notices/notices.service";
import { nairaText } from "../payments/receipt";
import { InvoicesService } from "../pro-business/invoices.service";
import { PurchasesService } from "../purchases/purchases.service";
import { RoyaltiesService } from "../royalties/royalties.service";
import { reversalEntries } from "./ledger-reversal";
import { OPEN_REFUND, refusalText } from "./refunds.service";

const SECTION = "/admin/payments";
/** What revoke answers when a line was given back or never granted: anything else is recorded for staff. */
const NOTHING_KEPT = new Set(["revoked", "already_revoked", "refused_line", "wish_gone", "nothing_granted"]);

export type RefundEventOutcome = "refunded" | "refund_failed" | "already" | "amount_mismatch" | "unknown_refund" | "ignored";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The provider's signed refund events (the webhook stores them once by event id and hands them here). One transaction with the
 * account then the payment row locked: a refund the provider confirms is succeeded, its payment refunded, the reversing ledger rows
 * written and what the payment bought taken back (PurchasesService.revoke). A second delivery of the same event, or ten at once,
 * finds it done and changes nothing; an event for another amount is flagged on the payment and applies nothing.
 */
@Injectable()
export class RefundEvents implements RefundEventSink {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly purchases: PurchasesService,
    private readonly invoices: InvoicesService,
    private readonly royalties: RoyaltiesService,
    private readonly notices: NoticesService,
  ) {}

  async apply(eventRowId: string, type: string, data: Record<string, unknown>): Promise<void> {
    const reference = str(data.transaction_reference) || str(data.reference);
    const pre = reference ? await this.db.payment.findUnique({ where: { providerReference: reference }, select: { id: true, accountId: true } }) : null;
    if (!pre || (type !== "refund.processed" && type !== "refund.failed")) {
      await this.finish(this.db, eventRowId, pre ? "ignored" : "unknown_refund");
      return;
    }
    await this.db.$transaction(async (tx) => {
      if (pre.accountId) await lockAccount(tx, pre.accountId, { allowErased: true });
      await tx.$queryRaw`SELECT id FROM payment WHERE id = ${pre.id}::uuid FOR UPDATE`;
      const event = await tx.webhookEvent.findUniqueOrThrow({ where: { id: eventRowId }, select: { processedAt: true } });
      if (event.processedAt) return;
      const outcome = await this.applyLocked(tx, eventRowId, type, data, pre.id);
      await this.finish(tx, eventRowId, outcome.outcome, outcome.detail);
    });
    await this.sendNoticeNow(pre.id);
  }

  /** The refund notice was queued with the refund's own transaction; once that has committed it goes at once. */
  private async sendNoticeNow(paymentId: string): Promise<void> {
    const refund = await this.db.refund.findFirst({ where: { paymentId, status: "succeeded" }, select: { id: true } });
    if (!refund) return;
    const row = await this.db.messageDelivery.findFirst({ where: { idempotencyKey: `refund:${refund.id}`, status: "queued" }, select: { id: true } });
    if (row) await this.notices.deliverNow(row.id);
  }

  /** HW1: the refund's own notice, to the account's email or the payer's email on the payment (once per refund). */
  private async notice(tx: Prisma.TransactionClient, payment: { accountId: string | null; payerContact: string | null; providerReference: string }, refundId: string, amountKobo: bigint): Promise<void> {
    const name = payment.accountId ? (await tx.account.findUnique({ where: { id: payment.accountId }, select: { name: true } }))?.name ?? null : null;
    const data = { name: name?.trim() || "there", amount: nairaText(amountKobo), reference: payment.providerReference };
    const key = `refund:${refundId}`;
    if (payment.accountId) await this.notices.send(tx, { template: "refund", toAccountId: payment.accountId, data, key });
    else if (payment.payerContact) await this.notices.send(tx, { template: "refund", toEmail: payment.payerContact, data, key });
  }

  /**
   * Join 5: an event that came before its refund was recorded as sent was left unprocessed (outcome unknown_refund) for the
   * provider's retry. When the refund is claimed and answered, the events stored for its payment are applied here, oldest first,
   * so the money does not wait for a retry that may be hours away. One already closed is never touched.
   */
  async applyPending(paymentId: string): Promise<void> {
    const pay = await this.db.payment.findUnique({ where: { id: paymentId }, select: { providerReference: true } });
    if (!pay?.providerReference) return;
    const rows = await this.db.webhookEvent.findMany({
      where: { processedAt: null, outcome: "unknown_refund", type: { startsWith: "refund." } },
      orderBy: { id: "asc" },
      select: { id: true, type: true, payload: true },
    });
    for (const r of rows) {
      const data = (r.payload as { data?: Record<string, unknown> } | null)?.data ?? {};
      if ((str(data.transaction_reference) || str(data.reference)) !== pay.providerReference) continue;
      await this.apply(r.id, r.type, data);
    }
  }

  private async applyLocked(tx: Prisma.TransactionClient, eventRowId: string, type: string, data: Record<string, unknown>, paymentId: string): Promise<{ outcome: RefundEventOutcome; detail?: Prisma.InputJsonObject }> {
    const now = this.clock.now();
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const refund = await tx.refund.findFirst({ where: { paymentId, status: { in: OPEN_REFUND.filter((s) => s !== "requested") } }, orderBy: { id: "desc" } });
    if (!refund) {
      const done = await tx.refund.findFirst({ where: { paymentId, status: type === "refund.processed" ? "succeeded" : "failed" }, select: { id: true } });
      return { outcome: done ? "already" : "unknown_refund" };
    }
    if (type === "refund.failed") {
      const why = refusalText(str(data.failure_reason) || "The provider could not complete the refund.");
      await tx.refund.update({ where: { id: refund.id }, data: { status: "failed", note: why, updatedAt: now } });
      await this.audit.write(tx, {
        actor: { type: "system", id: null, requestId: eventRowId },
        section: SECTION,
        action: "refund.failed",
        target: { type: "refund", id: refund.id },
        reason: why,
        changedFields: ["status"],
      });
      return { outcome: "refund_failed", detail: { refundId: refund.id } };
    }
    const amount = typeof data.amount === "number" && Number.isSafeInteger(data.amount) ? BigInt(data.amount) : -1n;
    if (amount !== refund.amountKobo) {
      await tx.payment.update({ where: { id: paymentId }, data: { flags: withFlag(payment.flags, "refund_amount_mismatch"), updatedAt: now } });
      return { outcome: "amount_mismatch", detail: { refundId: refund.id, eventKobo: Number.isSafeInteger(Number(amount)) ? Number(amount) : -1 } };
    }
    const rows = await tx.ledgerEntry.findMany({ where: { paymentId }, select: { journalId: true, account: true, direction: true, amountKobo: true, memo: true, refundId: true }, orderBy: { id: "asc" } });
    const drafts = reversalEntries(rows, () => this.ids.id(), payment.providerReference);
    await tx.ledgerEntry.createMany({
      data: drafts.map((d) => ({ id: this.ids.id(), journalId: d.journalId, account: d.account, direction: d.direction, amountKobo: d.amountKobo, currency: "NGN" as const, paymentId, refundId: refund.id, memo: d.memo, createdAt: now })),
    });
    const revoked = await this.purchases.revoke(tx, payment);
    await this.invoices.voidFor(tx, paymentId);
    // WW2: the royalties this payment earned are taken back in the same transaction (one reversal per accrual; a second call changes nothing).
    await this.royalties.reverse(tx, paymentId);
    await tx.refund.update({ where: { id: refund.id }, data: { status: "succeeded", updatedAt: now } });
    await tx.payment.update({ where: { id: paymentId }, data: { status: "refunded", flags: payment.flags.filter((f) => f !== "refund_due" && f !== "refund_amount_mismatch"), updatedAt: now } });
    await this.notice(tx, payment, refund.id, refund.amountKobo);
    const kept = revoked.filter((r) => !NOTHING_KEPT.has(r.result));
    if (kept.length) {
      const keptText = refusalText(`Money went back; kept: ${kept.map((k) => `${k.sku} (${k.result})`).join(", ")}`);
      await tx.refund.update({ where: { id: refund.id }, data: { note: keptText } });
      await this.audit.write(tx, {
        actor: { type: "system", id: null, requestId: eventRowId },
        section: SECTION,
        action: "refund.kept",
        target: { type: "refund", id: refund.id },
        reason: keptText,
        changedFields: ["status"],
      });
    }
    return { outcome: "refunded", detail: { refundId: refund.id, revoked: revoked.map((r) => ({ sku: r.sku, result: r.result })) } };
  }

  /**
   * Writes the outcome on the stored event. An event we cannot match to a refund yet stays unprocessed (the provider sends it again,
   * and a refund we have not recorded as sent yet may be there by then); every other outcome closes it.
   */
  private async finish(db: Pick<Prisma.TransactionClient, "webhookEvent">, id: string, outcome: RefundEventOutcome, detail?: Prisma.InputJsonObject): Promise<void> {
    await db.webhookEvent.updateMany({
      where: { id, processedAt: null },
      data: { ...(outcome === "unknown_refund" ? {} : { processedAt: this.clock.now() }), outcome, ...(detail ? { event: detail } : {}) },
    });
  }
}
