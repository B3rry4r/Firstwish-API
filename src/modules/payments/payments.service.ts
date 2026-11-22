import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
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
import { normaliseId } from "../../common/normalise/id";
import { parseRequest } from "./payment-request";
import { checkReturnPath, returnAddress } from "./return-path";
import { readOptions, writeOptions } from "./payment-options";
import { TicketPaymentDrop } from "./ticket-drop";
import { skuOf, ticketOf, waitingExtraPayment, waitingTicketPayment } from "./ticket-waiting";

const KEY = /^[A-Za-z0-9._:-]{8,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HU1: who pays when the holder of a wish's link pays with no account: the wish and the email the receipt goes to. */
export interface PayerByLink {
  wishId: string;
  email: string;
  /** IF1: the slug of the link they came by: the one page they can come back to */
  slug?: string;
}

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

/** HU3, HU6: why a paid payment gave nothing, in words the payer can read (empty unless it is marked refund due). */
export function refundDueWords(flags: readonly string[]): string {
  if (!flags.includes("refund_due")) return "";
  if (flags.includes("refund_due:keep_already_paid")) return "Someone else paid to keep this wish for the same time first, so this payment gave nothing. It is marked to be refunded.";
  if (flags.includes("refund_due:plan_applied_meanwhile")) return "A plan was paid for another way after this payment was started, so this payment gave nothing. It is marked to be refunded.";
  if (flags.includes("refund_due:paid_after_drop")) return "This payment came in after the business dropped it, and a plan was paid for another way meanwhile. It is marked to be refunded.";
  if (flags.includes("refund_due:paid_after_lapse")) return "This payment came in after it had lapsed, and the same thing was paid for another way meanwhile. It is marked to be refunded.";
  if (flags.includes("refund_due:ticket_already_paid")) return "A ticket for this wish was already paid for, so this payment gave nothing. It is marked to be refunded.";
  if (flags.includes("refund_due:extra_already_held")) return "This wish already had that extra, so this payment gave nothing. It is marked to be refunded.";
  return "This payment gave nothing. It is marked to be refunded.";
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
    private readonly ticketDrop: TicketPaymentDrop,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * E-87. Prices the line from the price book (never from the request), stores a pending Payment with a server-made reference,
   * then asks the payments port to initialise (outside the transaction). The same Idempotency-Key and body gives the same payment;
   * the same key with another body is 409. Everything is under the account lock.
   */
  async start(accountId: string | null, body: PostPaymentsBody, idempotencyKey: string | undefined, holder?: PayerByLink): Promise<{ started: PaymentStarted<null>; status: 200 | 201 }> {
    const req = parseRequest(body);
    if (idempotencyKey !== undefined && !KEY.test(idempotencyKey)) {
      throw AppError.validation({ "Idempotency-Key": "Must be 8 to 100 letters, digits or . _ : -" });
    }
    if (!accountId && (!holder || req.purpose !== "keep")) throw AppError.notFound();
    // IF1: where the payer comes back to is checked in words before anything is stored or asked of the provider; no path leaves everything as it was.
    if (req.info.returnPath !== undefined) {
      const subject = req.info.subjectId;
      req.info.returnPath = await checkReturnPath(req.info.returnPath, {
        purpose: req.wirePurpose,
        subjectId: subject,
        holderSlug: accountId ? undefined : (holder?.slug ?? ""),
        linkSlugs: subject && UUID.test(subject) ? async (slug) => (await this.db.wishLink.findFirst({ where: { slug, wishId: subject }, select: { id: true } })) !== null : undefined,
      });
    }
    // HU1: a link holder is no account. Their payment is for the wish; the email is kept on the payment row only (never in the key: it is hashed).
    const payer = accountId ?? `hold:${createHash("sha256").update(`${holder?.wishId}:${holder?.email}`).digest("hex").slice(0, 32)}`;
    const storedKey = `${payer}:${idempotencyKey ?? this.ids.id()}`;
    let email: string | null;
    let businessId: string | null;
    if (accountId) {
      const account = await this.db.account.findUnique({ where: { id: accountId }, select: { contact: true } });
      if (!account) throw AppError.notFound();
      email = account.contact?.includes("@") ? account.contact : null;
      if (!email) throw AppError.validation({ email: "Add an email to your account before you pay." });
      businessId = req.needsBusiness ? await this.businesses.require({ kind: "user", accountId, sides: ["person"] }) : await this.businesses.find(accountId);
    } else {
      if (!holder) throw AppError.notFound();
      email = holder.email;
      businessId = null;
    }

    const created = await this.db.$transaction(async (tx) => {
      // a payer with an account is lined up by the account lock, a link holder by the wish's own row
      if (accountId) await lockAccount(tx, accountId);
      else await tx.$queryRaw`SELECT id FROM wish WHERE id = ${holder?.wishId}::uuid FOR UPDATE`;
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: storedKey } });
      if (existing) return { row: existing, fresh: false, sameThing: false };
      const now = this.clock.now();
      const quote = await this.book.quote(req.lines, now, { db: tx });
      if (req.purpose === "pro_plan" && quote.lines.some((l) => l.sku === "pro.pack")) {
        throw AppError.validation({ lines: "A wish pack is bought as a pack, not as a plan. Choose Buy a pack." });
      }
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
      // ID1: a wish is paid for once. While a ticket payment of the wish waits, a start for any ticket of it is 409 with the waiting payment's reference
      // (the account lock above lines two starts up, so of two at the same moment one is made and the other finds it).
      if (req.purpose === "ticket" && accountId && req.info.subjectId) {
        const waiting = await waitingTicketPayment(tx, accountId, req.info.subjectId, now);
        if (waiting) {
          throw new AppError(409, "ticket_payment_pending", "A payment for a ticket of this wish is waiting to be paid. Continue it, or drop it and choose again.", { reference: waiting.providerReference, ticket: ticketOf(waiting) });
        }
      }
      // IF3: an extra is paid for once per wish as a ticket is: while a payment of the same extra for this wish waits, a start for it is 409 with the
      // waiting payment's reference (the account lock lines two starts up); a different extra is not held up by it.
      if (req.purpose === "extra" && accountId && req.info.subjectId) {
        const waiting = await waitingExtraPayment(tx, accountId, req.info.subjectId, quote.lines[0]?.sku ?? "", now);
        if (waiting) {
          throw new AppError(409, "extra_payment_pending", "A payment for this extra of this wish is waiting to be paid. Continue it, or drop it and start again.", { reference: waiting.providerReference, extra: skuOf(waiting).slice("extra.".length) });
        }
      }
      // GG3: what the fulfilment bundle knows can never be granted is refused now (422), before the buyer pays
      const open = await this.registry.checkStart(accountId, req.info, quote.lines.map((l) => l.sku), tx, quote, holder?.email);
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

    const returnTo = readOptions(created.row.options).request.returnPath;
    let authorizationUrl: string;
    try {
      const started = await this.port.start({
        reference: created.row.providerReference,
        amount: Money.kobo(created.row.amountKobo),
        email,
        callbackUrl: returnTo ? returnAddress(this.env.PUBLIC_SITE_URL, returnTo, created.row.providerReference) : undefined,
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

  /** ID1: the wish's owner drops a waiting ticket payment at once; answers the payment as it stands. */
  async dropTicket(accountId: string, reference: string): Promise<PaymentView> {
    await this.ticketDrop.drop(accountId, reference);
    return this.view(await this.own(accountId, reference));
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
    return this.verifyRow(mine, () => this.own(accountId, reference));
  }

  /** HU1: the result of a link holder's keep payment (no account), read through the link's proof: the payment must be a holder's keep for this wish. */
  async verifyHeld(wishId: string, reference: string): Promise<PaymentView> {
    const find = async (): Promise<Payment> => {
      const row = await this.db.payment.findFirst({ where: { providerReference: reference, subjectId: normaliseId(wishId), purpose: "keep", accountId: null } });
      if (!row) throw AppError.notFound("No such payment.");
      return row;
    };
    return this.verifyRow(await find(), find);
  }

  private async verifyRow(mine: Payment, again: () => Promise<Payment>): Promise<PaymentView> {
    if (mine.status === "pending" || mine.status === "started" || mine.status === "abandoned" || mine.status === "failed") {
      const answer = await this.askProvider(mine.providerReference);
      if (answer) await this.settlement.settle(answer);
    }
    return this.view(await again());
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

  /**
   * The payer's own payment; HY1: a plan payment of a business is also read by everyone who may pay for that business's plan (its owner and a
   * live login, the same people HH6 lets pay), whoever of them started it. A reference of any other payment or business is a 404.
   */
  private async own(accountId: string, reference: string): Promise<Payment> {
    if (!UUID.test(accountId)) throw AppError.notFound();
    const row = await this.db.payment.findFirst({ where: { providerReference: reference, accountId } });
    if (row) return row;
    const plan = await this.db.payment.findFirst({ where: { providerReference: reference, purpose: "pro_plan", businessId: { not: null } } });
    if (plan?.businessId && (await this.mayPayForPlan(accountId, plan.businessId))) return plan;
    throw AppError.notFound("No such payment.");
  }

  /** The business's owner, or an account whose sign-in email is on a live (invited or active) login of it. */
  private async mayPayForPlan(accountId: string, businessId: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM business b WHERE b.id = ${businessId}::uuid AND b."accountId" = ${accountId}::uuid
      UNION ALL
      SELECT 1 AS n FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE l."businessId" = ${businessId}::uuid AND a.contact IS NOT NULL AND a."erasedAt" IS NULL AND lower(trim(l.contact)) = lower(a.contact)
         AND l.status IN ('invited', 'active')
      LIMIT 1`;
    return rows.length > 0;
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
      reason: p.status === "failed" ? (opts.server.reason ?? "The payment did not go through.") : refundDueWords(p.flags),
    };
  }
}
