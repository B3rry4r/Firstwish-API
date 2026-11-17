import { Injectable } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import { EventsService } from "../events/events.service";
import { NoticesService } from "../notices/notices.service";
import { FulfilmentRegistry, type PaidLineInfo } from "./fulfilment.registry";
import { paymentEntries } from "./ledger";
import { readOptions, withFlag, writeOptions } from "./payment-options";
import { receiptData } from "./receipt";

/** What the provider says about one payment: from a verify call or a webhook event. Never from a request the payer sent. */
export interface ProviderAnswer {
  reference: string;
  status: "success" | "failed" | "abandoned" | "pending";
  amountKobo: bigint;
  currency: string;
  paidAt: Date | null;
  feeKobo?: bigint | null;
  channel?: string | null;
}

export type SettleOutcome =
  | "fulfilled" // paid, ledger written, handlers ran
  | "recorded_unfulfilled" // paid and in the ledger, but the account was erased: no handler ran
  | "already" // nothing to do: it was paid before
  | "unknown_reference" // no payment with this reference
  | "amount_mismatch" // success for another amount or currency: not paid, flagged
  | "failed" // the provider says it failed: marked failed
  | "not_paid"; // still pending at the provider: nothing changed

export interface SettleResult {
  outcome: SettleOutcome;
  flagged: boolean;
}

const EVENT_LINE: Record<string, "tickets" | "extras" | "keeps" | "pass" | "pro" | "vault" | "concierge" | "creator"> = {
  ticket: "tickets",
  extra: "extras",
  keep: "keeps",
  pass: "pass",
  pro: "pro",
  vault: "vault",
  concierge: "concierge",
  creator: "creator",
};
/** HU6: the purposes that are one per intent (a pack, a vault block or an extra photo may be bought again at once; these may not). */
const ONE_PER_INTENT = new Set(["ticket", "keep", "pass", "pro_plan", "creator_plan"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * The one path to "paid": the webhook and the verify page both end here. One transaction, the account locked first (the account
 * lock helper), then the payment row locked: state, ledger rows, `fulfilledAt` (once) and the registered handler of every line
 * happen together or not at all. Two arrivals for one payment queue on the row lock; the second sees it paid and does nothing.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly book: PriceBookService,
    private readonly entitlements: EntitlementsService,
    private readonly events: EventsService,
    private readonly registry: FulfilmentRegistry,
    private readonly notices: NoticesService,
  ) {}

  /**
   * Settles one provider answer. `webhookEventId`: the stored webhook event to mark processed in the same transaction (with the
   * outcome), so a rollback leaves it unprocessed and the next delivery retries.
   */
  async settle(answer: ProviderAnswer, webhookEventId?: string): Promise<SettleResult> {
    let result: SettleResult;
    try {
      result = await this.settleOnce(answer, webhookEventId);
    } catch (e) {
      // a deadlock (40P01) or a serialization failure (40001) rolled the whole settle back: run it once more
      if (!isLockConflict(e)) throw e;
      result = await this.settleOnce(answer, webhookEventId);
    }
    if (result.outcome === "fulfilled") await this.sendReceiptNow(answer.reference);
    return result;
  }

  /** The receipt was queued in the settle transaction; once that has committed it goes at once instead of at the next tick. */
  private async sendReceiptNow(reference: string): Promise<void> {
    const p = await this.db.payment.findUnique({ where: { providerReference: reference }, select: { id: true } });
    if (!p) return;
    const row = await this.db.messageDelivery.findFirst({ where: { idempotencyKey: `receipt:${p.id}`, status: "queued" }, select: { id: true } });
    if (row) await this.notices.deliverNow(row.id);
  }

  /**
   * THE LOCK ORDER of every settle, owner's or link holder's, whatever the line: the account (when the payment has one), then the
   * payment row, then the wish the line names (before its grant row is claimed: the grant's foreign key to the wish takes a share
   * lock on it, and two settles holding that share lock would each wait for the other's exclusive one), then anything else.
   */
  private async settleOnce(answer: ProviderAnswer, webhookEventId?: string): Promise<SettleResult> {
    const pre = await this.db.payment.findUnique({ where: { providerReference: answer.reference }, select: { accountId: true } });
    return this.db.$transaction(async (tx) => {
      if (pre?.accountId) await lockAccount(tx, pre.accountId, { allowErased: true });
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM payment WHERE "providerReference" = ${answer.reference} FOR UPDATE`;
      const result = locked.length ? await this.apply(tx, locked[0].id, answer) : { outcome: "unknown_reference" as const, flagged: true };
      if (webhookEventId) {
        await tx.webhookEvent.update({
          where: { id: webhookEventId },
          data: { processedAt: this.clock.now(), outcome: result.outcome },
        });
      }
      return result;
    });
  }

  private async apply(tx: Prisma.TransactionClient, paymentId: string, a: ProviderAnswer): Promise<SettleResult> {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const now = this.clock.now();
    if (p.status === "succeeded" || p.status === "refunded" || p.status === "partly_refunded") return { outcome: "already", flagged: false };
    const opts = readOptions(p.options);
    let flags = p.flags;

    if (a.status === "failed") {
      if (p.status === "failed") return { outcome: "already", flagged: false };
      // API-BASE-6: the payment says why it failed, in words the payer can read
      const reason = "The payment did not go through. Your card or bank did not approve it. Try again, or use another way to pay.";
      await tx.payment.update({ where: { id: p.id }, data: { status: "failed", updatedAt: now, options: writeOptions({ ...opts, server: { ...opts.server, reason } }) } });
      return { outcome: "failed", flagged: false };
    }
    if (a.status !== "success") return { outcome: "not_paid", flagged: false };

    if (a.currency !== p.currency || a.amountKobo !== p.amountKobo) {
      flags = withFlag(flags, "amount_mismatch");
      await tx.payment.update({ where: { id: p.id }, data: { flags, updatedAt: now } });
      return { outcome: "amount_mismatch", flagged: true };
    }

    let flagged = false;
    if (p.status === "abandoned" || p.status === "failed") {
      flags = withFlag(flags, `late_success_after_${p.status}`);
      flagged = true;
    }
    const erased = p.accountId ? (await tx.account.findUnique({ where: { id: p.accountId }, select: { erasedAt: true } }))?.erasedAt != null : false;
    if (erased) {
      flags = withFlag(withFlag(flags, "account_erased"), "refund_due");
      flagged = true;
    }

    // HU6: a payment the sweep closed (or that failed) and the provider later reports paid: if the same thing was paid for since, this one gave nothing and is refund due
    const superseded = !erased && (p.status === "abandoned" || p.status === "failed") && (await this.paidSince(tx, p));
    if (superseded) {
      flags = withFlag(withFlag(flags, "refund_due"), flags.includes("dropped_by_owner") ? "refund_due:paid_after_drop" : "refund_due:paid_after_lapse");
      flagged = true;
    }
    const lines = paidLines(p);
    const vatKobo = await this.writeLedger(tx, p, a, lines);
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: "succeeded",
        verifiedAt: a.paidAt ?? now,
        channel: a.channel ?? p.channel,
        feeKobo: a.feeKobo ?? null,
        fulfilledAt: erased || superseded ? null : now,
        flags,
        updatedAt: now,
      },
    });
    const paid = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
    await this.record(tx, paid, lines);
    if (erased || superseded) return { outcome: "recorded_unfulfilled", flagged };
    for (const line of lines) {
      const handler = this.registry.get(line.sku);
      if (!handler) throw new Error(`fulfilment: no handler registered for ${line.sku}`);
      await handler({ tx, payment: paid, line, request: opts.request, grant: () => this.grantIn(tx, line.sku) });
    }
    await this.receipt(tx, paid, lines, vatKobo);
    return { outcome: "fulfilled", flagged };
  }

  /**
   * HU6: has anything else paid for the same intent since this payment started? The intent is the payer's own (their account, or a link
   * holder's email), the purpose and the wish; for a plan it is the business, whoever of its payers paid (one plan is applied once for one intent, whichever plan it was).
   */
  private async paidSince(tx: Prisma.TransactionClient, p: Payment): Promise<boolean> {
    if (!ONE_PER_INTENT.has(p.purpose)) return false;
    const plan = p.purpose === "pro_plan";
    // a plan is the business's, whichever of its payers paid: the owner's and a login's payments are one intent
    if (plan ? !p.businessId : !p.accountId && !p.payerContact) return false;
    const others = await tx.payment.findMany({
      where: {
        id: { not: p.id },
        purpose: p.purpose,
        status: { in: ["succeeded", "refunded", "partly_refunded"] },
        verifiedAt: { gt: p.createdAt },
        ...(plan ? { businessId: p.businessId } : { ...(p.accountId ? { accountId: p.accountId } : { accountId: null, payerContact: p.payerContact }), subjectId: p.subjectId }),
      },
      select: { lines: true },
      take: 20,
    });
    const sku = (x: Pick<Payment, "lines">) => paidLines(x)[0]?.sku;
    return others.some((o) => plan || sku(o) === sku(p));
  }

  /** What the book grants for a line, read on the settle transaction's own connection (never the pool: HH2). */
  private async grantIn(tx: Prisma.TransactionClient, sku: string) {
    const g = grantOf(await this.entitlements.row(tx), sku);
    if (!g) throw new Error(`price book: no entitlement for ${sku}`);
    return g;
  }

  /**
   * HW1 (R11): one receipt email for the settled payment, in the settle transaction, to the account's email or the payer's email kept
   * on the payment when a link holder paid. The key is the payment's id, so a second settle, a replayed webhook or a retry sends none.
   */
  private async receipt(tx: Prisma.TransactionClient, p: Payment, lines: PaidLineInfo[], vatKobo: bigint): Promise<void> {
    const name = p.accountId ? (await tx.account.findUnique({ where: { id: p.accountId }, select: { name: true } }))?.name ?? null : null;
    const data = receiptData(p, lines, vatKobo, name);
    const key = `receipt:${p.id}`;
    if (p.accountId) await this.notices.send(tx, { template: "receipt", toAccountId: p.accountId, data, key });
    else if (p.payerContact) await this.notices.send(tx, { template: "receipt", toEmail: p.payerContact, data, key });
  }

  private async writeLedger(tx: Prisma.TransactionClient, p: Payment, a: ProviderAnswer, lines: PaidLineInfo[]): Promise<bigint> {
    const book = await this.book.load(p.priceBookVersion, tx);
    const vatIncluded = new Map(book.lines.map((l) => [l.sku, l.vatIncluded]));
    const entitlements = await this.entitlements.row(tx);
    const drafts = paymentEntries({
      journal: () => this.ids.id(),
      lines: lines.map((l) => ({ sku: l.sku, totalKobo: BigInt(l.totalKobo), vatIncluded: vatIncluded.get(l.sku) ?? false })),
      vatRate: entitlements.vatRate,
      feeKobo: a.feeKobo ?? null,
      reference: p.providerReference,
    });
    const at = this.clock.now();
    await tx.ledgerEntry.createMany({
      data: drafts.map((d) => ({
        id: this.ids.id(),
        journalId: d.journalId,
        account: d.account,
        direction: d.direction,
        amountKobo: d.amountKobo,
        currency: "NGN" as const,
        paymentId: p.id,
        memo: d.memo,
        createdAt: at,
      })),
    });
    return drafts.filter((d) => d.account === "vat_payable").reduce((sum, d) => sum + d.amountKobo, 0n);
  }

  /** The server's own "paid" event, in the payment's transaction (once per reference). A style named in the request counts the style. */
  private async record(tx: Prisma.TransactionClient, p: Payment, lines: PaidLineInfo[]): Promise<void> {
    const request = readOptions(p.options).request;
    const style = typeof request.options?.style === "string" ? request.options.style.trim().toLowerCase() : "";
    const group = lines[0].sku.slice(0, lines[0].sku.indexOf("."));
    await this.events.record(
      {
        name: "paid",
        key: p.providerReference,
        accountId: p.accountId,
        styleSlug: SLUG.test(style) ? style : null,
        amountKobo: p.amountKobo,
        line: EVENT_LINE[group] ?? null,
      },
      tx,
    );
  }
}

/** Postgres says "deadlock detected" (40P01) or "could not serialize" (40001), as the driver or Prisma (P2034) reports it. */
export function isLockConflict(e: unknown): boolean {
  const x = e as { code?: string; meta?: { code?: string; message?: string }; message?: string } | null;
  const text = `${x?.code ?? ""} ${x?.meta?.code ?? ""} ${x?.meta?.message ?? ""} ${x?.message ?? ""}`;
  return /P2034|40P01|40001|deadlock detected|could not serialize/i.test(text);
}

/** The lines a payment kept when it was started (what the buyer was charged, at the version it names). */
export function paidLines(p: Pick<Payment, "lines">): PaidLineInfo[] {
  const raw = Array.isArray(p.lines) ? p.lines : [];
  return raw.map((l) => {
    const o = l as Record<string, unknown>;
    return { sku: String(o.sku), name: String(o.name), qty: Number(o.qty), unitKobo: Number(o.unitKobo), totalKobo: Number(o.totalKobo) };
  });
}
