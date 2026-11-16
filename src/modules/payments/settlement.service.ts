import { Injectable } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import { EventsService } from "../events/events.service";
import { FulfilmentRegistry, type PaidLineInfo } from "./fulfilment.registry";
import { paymentEntries } from "./ledger";
import { readOptions, withFlag, writeOptions } from "./payment-options";

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
  ) {}

  /**
   * Settles one provider answer. `webhookEventId`: the stored webhook event to mark processed in the same transaction (with the
   * outcome), so a rollback leaves it unprocessed and the next delivery retries.
   */
  async settle(answer: ProviderAnswer, webhookEventId?: string): Promise<SettleResult> {
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

    const lines = paidLines(p);
    await this.writeLedger(tx, p, a, lines);
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: "succeeded",
        verifiedAt: a.paidAt ?? now,
        channel: a.channel ?? p.channel,
        feeKobo: a.feeKobo ?? null,
        fulfilledAt: erased ? null : now,
        flags,
        updatedAt: now,
      },
    });
    const paid = await tx.payment.findUniqueOrThrow({ where: { id: p.id } });
    await this.record(tx, paid, lines);
    if (erased) return { outcome: "recorded_unfulfilled", flagged };
    for (const line of lines) {
      const handler = this.registry.get(line.sku);
      if (!handler) throw new Error(`fulfilment: no handler registered for ${line.sku}`);
      await handler({ tx, payment: paid, line, request: opts.request, grant: () => this.grantIn(tx, line.sku) });
    }
    return { outcome: "fulfilled", flagged };
  }

  /** What the book grants for a line, read on the settle transaction's own connection (never the pool: HH2). */
  private async grantIn(tx: Prisma.TransactionClient, sku: string) {
    const g = grantOf(await this.entitlements.row(tx), sku);
    if (!g) throw new Error(`price book: no entitlement for ${sku}`);
    return g;
  }

  private async writeLedger(tx: Prisma.TransactionClient, p: Payment, a: ProviderAnswer, lines: PaidLineInfo[]): Promise<void> {
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

/** The lines a payment kept when it was started (what the buyer was charged, at the version it names). */
export function paidLines(p: Pick<Payment, "lines">): PaidLineInfo[] {
  const raw = Array.isArray(p.lines) ? p.lines : [];
  return raw.map((l) => {
    const o = l as Record<string, unknown>;
    return { sku: String(o.sku), name: String(o.name), qty: Number(o.qty), unitKobo: Number(o.unitKobo), totalKobo: Number(o.totalKobo) };
  });
}
