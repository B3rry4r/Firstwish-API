import { Injectable } from "@nestjs/common";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { PAYMENTS_ABANDON_AFTER_MINUTES as PLAN_PENDING_MINUTES } from "./abandon";
import { AppError } from "../../common/errors/app-error";
import { Money } from "../../common/money/money";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { PaymentsPort } from "../../common/ports/payments.port";
import type { PostPaymentsBody, PaymentStart, PaymentStarted } from "../../contracts";
import { BusinessOf } from "../people/business-of";
import { PriceBookService } from "../price-book/price-book.service";
import { FulfilmentRegistry } from "./fulfilment.registry";
import { paidLines, SettlementService, type SettleResult } from "./settlement.service";
import { parseRequest } from "./payment-request";
import { readOptions, writeOptions } from "./payment-options";

const KEY = /^[A-Za-z0-9._:-]{8,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The payer's own view of a payment: no idempotency key, no staff flags, no provider detail. */
export interface PaymentView {
  /** API-BASE-6: why the payment failed, in words the payer can read ("" unless it failed) */
  reason: string;
  id: string;
  reference: string;
  state: PaymentStart["state"];
  status: PaymentStart["state"];
  amountKobo: number;
  currency: "NGN";
  purpose: string;
  line: string;
  title: string;
  what: string;
  lines: { sku: string; name: string; qty: number; unitKobo: number; totalKobo: number }[];
  priceBookVersion: number;
  provider: "paystack";
  way: string | null;
  channel: string | null;
  subjectId: string | null;
  feeKobo: number | null;
  authorizationUrl: string | null;
  at: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  fulfilled: boolean;
}

export interface PaymentPage {
  items: PaymentView[];
  nextCursor: string | null;
}

const wireState = (s: Payment["status"]): PaymentStart["state"] => s.replace("_", "-") as PaymentStart["state"];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly port: PaymentsPort,
    private readonly book: PriceBookService,
    private readonly settlement: SettlementService,
    private readonly businesses: BusinessOf,
    private readonly registry: FulfilmentRegistry,
  ) {}

  /**
   * E-87. Prices the line from the price book (never from the request), stores a pending Payment with a server-made reference,
   * then asks the payments port to initialise (outside the transaction). The same Idempotency-Key and body gives the same payment;
   * the same key with another body is 409. Everything is under the account lock.
   */
  async start(accountId: string, body: PostPaymentsBody, idempotencyKey: string | undefined): Promise<{ started: PaymentStarted<null>; status: 200 | 201 }> {
    const req = parseRequest(body);
    if (idempotencyKey !== undefined && !KEY.test(idempotencyKey)) {
      throw AppError.validation({ "Idempotency-Key": "Must be 8 to 100 letters, digits or . _ : -" });
    }
    const storedKey = `${accountId}:${idempotencyKey ?? this.ids.id()}`;
    const account = await this.db.account.findUnique({ where: { id: accountId }, select: { contact: true } });
    if (!account) throw AppError.notFound();
    const email = account.contact?.includes("@") ? account.contact : null;
    if (!email) throw AppError.validation({ email: "Add an email to your account before you pay." });
    const businessId = req.needsBusiness ? await this.businesses.require({ kind: "user", accountId, sides: ["person"] }) : await this.businesses.find(accountId);

    const created = await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: storedKey } });
      if (existing) return { row: existing, fresh: false, sameThing: false };
      const now = this.clock.now();
      const quote = await this.book.quote(req.lines, now, { db: tx });
      // HR1: one plan payment at a time for a business. The same plan again hands back the payment that waits; another plan is 409 with its reference.
      if (req.purpose === "pro_plan" && businessId) {
        await tx.$queryRaw`SELECT id FROM business WHERE id = ${businessId}::uuid FOR UPDATE`;
        const since = new Date(now.getTime() - PLAN_PENDING_MINUTES * 60_000);
        const waiting = await tx.payment.findFirst({ where: { businessId, purpose: "pro_plan", status: { in: ["pending", "started"] }, fulfilledAt: null, createdAt: { gt: since } }, orderBy: { id: "desc" } });
        if (waiting) {
          const wasSku = (Array.isArray(waiting.lines) ? (waiting.lines[0] as { sku?: string } | undefined) : undefined)?.sku;
          if (wasSku === quote.lines[0]?.sku) return { row: waiting, fresh: false, sameThing: true };
          throw new AppError(409, "plan_payment_pending", "A payment for a plan is waiting to be paid. Finish it, or wait for it to lapse, before you start another.", { reference: waiting.providerReference });
        }
      }
      // GG3: what the fulfilment bundle knows can never be granted is refused now (422), before the buyer pays
      const open = await this.registry.checkStart(accountId, req.info, quote.lines.map((l) => l.sku), tx, quote);
      // CB1: a payment already open for the same order is answered again: no new row, no new provider call
      if (open) return { row: await tx.payment.findUniqueOrThrow({ where: { id: open } }), fresh: false, sameThing: true };
      const id = this.ids.id();
      const row = await tx.payment.create({
        data: {
          id,
          accountId,
          businessId,
          payerContact: email,
          purpose: req.purpose,
          subjectId: req.info.subjectId ?? null,
          lines: quote.lines.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty, unitKobo: l.unitKobo, totalKobo: l.totalKobo })),
          amountKobo: BigInt(quote.totalKobo),
          currency: "NGN",
          priceBookVersion: quote.version,
          status: "pending",
          provider: "paystack",
          providerReference: `fw-${id}`,
          idempotencyKey: storedKey,
          channel: req.way,
          options: writeOptions({ request: req.info, server: { fingerprint: req.fingerprint } }),
          createdAt: now,
          updatedAt: now,
        },
      });
      return { row, fresh: true, sameThing: false };
    });

    if (!created.fresh) {
      const opts = readOptions(created.row.options);
      if (!created.sameThing && opts.server.fingerprint !== req.fingerprint) {
        throw AppError.conflict("idempotency_key_reused", "This Idempotency-Key was already used for a different payment.");
      }
      // FF4: a repeat of a payment that is no longer waiting answers 200 with it as it stands and no checkout address.
      const cur = await this.waitForCheckout(created.row);
      return { started: this.started(cur), status: cur.status === "pending" ? 201 : 200 };
    }

    let authorizationUrl: string;
    try {
      const started = await this.port.start({
        reference: created.row.providerReference,
        amount: Money.kobo(created.row.amountKobo),
        email,
        metadata: { paymentId: created.row.id, purpose: req.wirePurpose },
      });
      authorizationUrl = started.authorizationUrl;
    } catch {
      const o = readOptions(created.row.options);
      o.server.reason = "We could not reach the payment provider, so nothing was charged. Try again in a moment.";
      await this.db.payment.updateMany({ where: { id: created.row.id, status: "pending" }, data: { status: "failed", updatedAt: this.clock.now(), options: writeOptions(o) } });
      throw new AppError(502, "payment_provider_unavailable", "We could not reach the payment provider. Try again.");
    }
    const opts = readOptions(created.row.options);
    opts.server.authorizationUrl = authorizationUrl;
    const row = await this.db.payment.update({ where: { id: created.row.id }, data: { options: writeOptions(opts), updatedAt: this.clock.now() } });
    return { started: this.started(row), status: 201 };
  }

  /** A repeat that arrives while the first is still asking the provider waits for the checkout address (a few seconds at most). */
  private async waitForCheckout(row: Payment): Promise<Payment> {
    let cur = row;
    for (let i = 0; i < 60 && !readOptions(cur.options).server.authorizationUrl && cur.status === "pending"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      cur = await this.db.payment.findUniqueOrThrow({ where: { id: row.id } });
    }
    if (cur.status === "failed" && !readOptions(cur.options).server.authorizationUrl) {
      throw new AppError(502, "payment_provider_unavailable", "We could not reach the payment provider. Try again.");
    }
    return cur;
  }

  private started(p: Payment): PaymentStarted<null> {
    return { payment: { reference: p.providerReference, state: wireState(p.status), amountKobo: Number(p.amountKobo), authorizationUrl: p.status === "pending" ? (readOptions(p.options).server.authorizationUrl ?? "") : "" }, item: null };
  }

  /**
   * E-88: the payer's own payment, and the verify page's door. A payment still waiting is checked with the provider by its
   * reference (the port), never by anything in the address, and goes down the same path as the webhook. The owner check is part
   * of the query: someone else's reference is a 404.
   */
  async verifyOwn(accountId: string, reference: string): Promise<PaymentView> {
    const mine = await this.own(accountId, reference);
    if (mine.status === "pending" || mine.status === "started" || mine.status === "abandoned" || mine.status === "failed") {
      const answer = await this.askProvider(mine.providerReference);
      if (answer) await this.settlement.settle(answer);
    }
    return this.view(await this.own(accountId, reference));
  }

  /** The provider's answer for a reference, or null when the provider cannot be reached (the page shows the state it has). */
  private async askProvider(reference: string) {
    try {
      const v = await this.port.verify(reference);
      return { reference, status: v.status, amountKobo: BigInt(v.amount.kobo), currency: "NGN", paidAt: v.paidAt };
    } catch {
      // FF1: the port is time-limited, so a provider that never answers arrives here as a PortTimeoutError within the limit. It
      // grants nothing: the caller answers the payment as it stands.
      return null;
    }
  }

  /** Settles a reference from the provider's own answer (used by jobs and tests). */
  async verifyReference(reference: string): Promise<SettleResult | null> {
    const answer = await this.askProvider(reference);
    return answer ? this.settlement.settle(answer) : null;
  }

  private async own(accountId: string, reference: string): Promise<Payment> {
    if (!UUID.test(accountId)) throw AppError.notFound();
    const row = await this.db.payment.findFirst({ where: { providerReference: reference, accountId } });
    if (!row) throw AppError.notFound("No such payment.");
    return row;
  }

  /** The payer's own payments, newest first, by cursor. The owner is a condition of the query. */
  async listOwn(accountId: string, opts: { cursor?: string; limit?: number } = {}): Promise<PaymentPage> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    let before: string | undefined;
    if (opts.cursor !== undefined) {
      if (!UUID.test(opts.cursor)) throw AppError.validation({ cursor: "Not a valid cursor." });
      before = opts.cursor;
    }
    const rows = await this.db.payment.findMany({
      where: { accountId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { items: page.map((p) => this.view(p)), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
  }

  view(p: Payment): PaymentView {
    const lines = paidLines(p);
    const opts = readOptions(p.options);
    const first = lines[0];
    return {
      id: p.id,
      reference: p.providerReference,
      state: wireState(p.status),
      status: wireState(p.status),
      amountKobo: Number(p.amountKobo),
      currency: "NGN",
      purpose: opts.request.purpose ?? p.purpose,
      line: first?.sku ?? "",
      title: opts.request.title ?? first?.name ?? "",
      what: first?.name ?? "",
      lines,
      priceBookVersion: p.priceBookVersion,
      provider: "paystack",
      way: p.channel,
      channel: p.channel,
      subjectId: p.subjectId,
      feeKobo: p.feeKobo === null ? null : Number(p.feeKobo),
      authorizationUrl: p.status === "pending" ? (opts.server.authorizationUrl ?? null) : null,
      at: p.createdAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      fulfilled: p.fulfilledAt !== null,
      reason: p.status === "failed" ? (opts.server.reason ?? "The payment did not go through.") : "",
    };
  }
}
