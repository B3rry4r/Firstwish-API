import { Injectable } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { normaliseEmail } from "../../common/normalise/email";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import { maskEmail } from "../../common/normalise/mask-email";
import { PaymentsService } from "../payments/payments.service";
import { readOptions } from "../payments/payment-options";
import { refundView } from "./refund-wire";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLAG = /^[a-z][a-z0-9_]{0,63}$/;

export interface AdminPaymentsQuery {
  cursor?: string;
  limit: number;
  /** A payment reference, a wish number or the payer's email. */
  q?: string;
  /** Only payments carrying this flag ("refund_due": paid, granted nothing, waiting for a refund). */
  flag?: string;
}

type PaymentView = ReturnType<PaymentsService["view"]>;
export type AdminPayment = Omit<PaymentView, "state"> & {
  state: string;
  idempotencyKey: string;
  accountId: string | null;
  businessId: string | null;
  person: string;
  personName: string;
  payerContact: string | null;
  flags: string[];
  record: number;
  ref: string;
  reason: string;
  /** The wish number of the wish this payment was for, when it was for one. */
  wish?: string;
  options: Record<string, unknown>;
};

const PAYMENT_STATE_STARTED = "refund-started";
const PAYMENT_STATE_WAITING = "refund-waiting";

/**
 * Staff read of payments (E-84, E-85) and the refund's effect on how one reads. The payer's email is always masked. The detail adds
 * the payment's ledger rows, its refunds (with what staff were told: a provider refusal, what could not be taken back) and the
 * provider events stored for it (type and outcome, never the body).
 */
@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async list(q: AdminPaymentsQuery): Promise<Page<AdminPayment>> {
    const where: Prisma.PaymentWhereInput[] = [];
    if (q.flag !== undefined) {
      if (!FLAG.test(q.flag)) throw AppError.validation({ flag: "Not a flag name." });
      where.push({ flags: { has: q.flag } });
    }
    if (q.q !== undefined && q.q.trim() !== "") where.push(await this.search(q.q.trim()));
    if (q.cursor !== undefined) {
      const c = decodeCursor(q.cursor);
      if (typeof c.key !== "string" || !UUID.test(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where.push({ id: { lt: c.id } });
    }
    const rows = await this.db.payment.findMany({ where: { AND: where }, orderBy: { id: "desc" }, take: q.limit + 1 });
    const page = toPage(rows, q.limit, (p) => ({ key: "id", id: p.id }));
    const refunds = await this.openRefunds(page.items.map((p) => p.id));
    const people = await this.people(page.items);
    const wishes = await this.wishNumbers(page.items);
    return { items: page.items.map((p) => this.present(p, people, refunds.has(p.id), wishes)), nextCursor: page.nextCursor };
  }

  async detail(reference: string) {
    const p = await this.db.payment.findUnique({ where: { providerReference: reference } });
    if (!p) throw AppError.notFound("No such payment.");
    const [refunds, ledger, events, people, wishes] = await Promise.all([
      this.db.refund.findMany({ where: { paymentId: p.id }, orderBy: { id: "asc" } }),
      this.db.ledgerEntry.findMany({ where: { paymentId: p.id }, orderBy: { id: "asc" } }),
      this.db.webhookEvent.findMany({
        where: { OR: [{ payload: { path: ["data", "reference"], equals: reference } }, { payload: { path: ["data", "transaction_reference"], equals: reference } }] },
        orderBy: { createdAt: "asc" },
      }),
      this.people([p]),
      this.wishNumbers([p]),
    ]);
    const notes = await this.db.auditEntry.findMany({
      where: { subjectType: "refund", subjectId: { in: refunds.map((r) => r.id) } },
      orderBy: { id: "asc" },
    });
    const open = refunds.some((r) => r.status === "sent");
    const view = this.present(p, people, open, wishes);
    const lastReason = [...notes].reverse().find((n) => n.actorType === "staff")?.reason;
    return {
      ...view,
      reason: lastReason ?? "",
      ledger: ledger.map((l) => ({
        id: l.id,
        journalId: l.journalId,
        account: l.account.replace("_", "-"),
        direction: l.direction,
        amountKobo: Number(l.amountKobo),
        refundId: l.refundId,
        memo: l.memo,
        createdAt: toWireInstant(l.createdAt),
      })),
      refunds: refunds.map((r) => ({
        ...refundView(r),
        // PP3: the refund's own `note` column holds the last system note; the audit rows are the history it came from
        notes: (() => {
          const own = notes.filter((n) => n.subjectId === r.id && n.actorType === "system").map((n) => ({ action: n.action, text: n.reason ?? "", at: toWireInstant(n.createdAt) }));
          return own.length || !r.note ? own : [{ action: "refund.note", text: r.note, at: toWireInstant(r.updatedAt) }];
        })(),
      })),
      events: events.map((e) => ({ id: e.id, type: e.type, outcome: e.outcome, processedAt: e.processedAt ? toWireInstant(e.processedAt) : null, createdAt: toWireInstant(e.createdAt) })),
    };
  }

  /** A reference or a wish number or an email: the three ways staff find a payment. */
  private async search(q: string): Promise<Prisma.PaymentWhereInput> {
    if (q.includes("@")) {
      const email = normaliseEmail(q);
      if (!email) throw AppError.validation({ q: "That is not an email address." });
      const accounts = await this.db.account.findMany({ where: { contact: email }, select: { id: true }, take: 50 });
      return { OR: [{ payerContact: email }, { accountId: { in: accounts.map((a) => a.id) } }] };
    }
    const wishes = await this.db.wish.findMany({ where: { no: q }, select: { id: true }, take: 50 });
    return { OR: [{ providerReference: q }, { subjectId: { in: wishes.map((w) => w.id) } }] };
  }

  private async openRefunds(ids: string[]): Promise<Set<string>> {
    const rows = await this.db.refund.findMany({ where: { paymentId: { in: ids }, status: "sent" }, select: { paymentId: true } });
    return new Set(rows.map((r) => r.paymentId));
  }

  private async people(rows: Payment[]): Promise<Map<string, { contact: string | null; name: string | null }>> {
    const accountIds = [...new Set(rows.map((p) => p.accountId).filter((v): v is string => v !== null))];
    const accounts = await this.db.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, contact: true, name: true } });
    return new Map(accounts.map((a) => [a.id, { contact: a.contact, name: a.name }]));
  }

  private async wishNumbers(rows: Payment[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((p) => p.subjectId).filter((v): v is string => v !== null && UUID.test(v)))];
    const wishes = await this.db.wish.findMany({ where: { id: { in: ids } }, select: { id: true, no: true } });
    return new Map(wishes.flatMap((w) => (w.no ? [[w.id, w.no] as [string, string]] : [])));
  }

  private present(p: Payment, people: Map<string, { contact: string | null; name: string | null }>, refundStarted: boolean, wishes: Map<string, string>): AdminPayment {
    const v = this.payments.view(p);
    const who = p.accountId ? people.get(p.accountId) : undefined;
    const contact = who?.contact ?? p.payerContact ?? null;
    const wish = p.subjectId ? wishes.get(p.subjectId) : undefined;
    return {
      ...v,
      state: refundStarted ? PAYMENT_STATE_STARTED : v.state,
      idempotencyKey: p.idempotencyKey,
      accountId: p.accountId,
      businessId: p.businessId,
      person: contact ? maskEmail(contact) : "",
      personName: who?.name ?? "",
      payerContact: p.payerContact ? maskEmail(p.payerContact) : null,
      flags: p.flags,
      record: v.amountKobo,
      ref: p.providerReference,
      reason: "",
      ...(wish ? { wish } : {}),
      options: { request: readOptions(p.options).request },
    };
  }

  /** E-86's answer: the payment as it reads now. */
  async byReference(reference: string): Promise<AdminPayment> {
    const p = await this.db.payment.findUnique({ where: { providerReference: reference } });
    if (!p) throw AppError.notFound("No such payment.");
    const open = (await this.openRefunds([p.id])).has(p.id);
    const view = this.present(p, await this.people([p]), open, await this.wishNumbers([p]));
    if (open) return view;
    // Started by someone who may not send it: it waits for a second person (TT3).
    const waiting = await this.db.refund.findFirst({ where: { paymentId: p.id, status: { in: ["requested", "approved"] } }, select: { id: true } });
    return waiting ? { ...view, state: PAYMENT_STATE_WAITING } : view;
  }
}
