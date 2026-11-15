import { HttpStatus, Injectable } from "@nestjs/common";
import type { Payment, Prisma, Refund } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Money } from "../../common/money/money";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { isPortTimeout } from "../../common/ports/time-limit";
import type { Refund as RefundWire } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { RefundProviderPort, RefundRefused } from "./refund-provider.port";
import { refundView } from "./refund-wire";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OPEN_REFUND = ["requested", "approved", "sent"] as const;
const SECTION = "/admin/payments";

export interface StartInput {
  paymentId?: string;
  reference?: string;
  /** Checked against the payment's own amount: a refund is always the whole payment. */
  amountKobo?: number;
  reason: string;
}

/** A provider refusal, in 4 to 500 characters for the audit row. */
export function refusalText(message: string): string {
  const t = message.replace(/\s+/g, " ").trim().slice(0, 480);
  return t.length >= 4 ? t : "The provider refused the refund.";
}

/**
 * Refunds (A11, DEC-18): staff start one for a whole, paid payment (requested); a second staff member sends it (approved, then
 * sent once the provider has taken it); the provider's signed webhook confirms it (RefundEvents). Every state change is one
 * transaction with the account then the payment row locked. The provider is asked outside any transaction, once per refund (its
 * id is the idempotency key), so a time-out leaves the refund approved and the same request can be sent again.
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly provider: RefundProviderPort,
  ) {}

  /** E-145: a refund asked for, by one staff member. */
  async start(input: StartInput, actor: AuditActor): Promise<RefundWire> {
    return refundView(await this.create(input, actor));
  }

  /** E-146: a second staff member sends it. The requester cannot (two people, DEC-18). A repeat after a time-out sends it again. */
  async approve(id: string, reason: string, actor: AuditActor): Promise<RefundWire> {
    return refundView(await this.dispatch(id, requireReason(reason), actor, false));
  }

  /** E-86: one staff member starts and sends it from the payment's page. Answers the refund as it stands. */
  async startAndSend(reference: string, reason: string, actor: AuditActor): Promise<Refund> {
    const made = await this.create({ reference, reason }, actor);
    return this.dispatch(made.id, null, actor, true);
  }

  private async create(input: StartInput, actor: AuditActor): Promise<Refund> {
    const reason = requireReason(input.reason);
    const pre = await this.findPayment(input);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, pre);
      const p = await tx.payment.findUniqueOrThrow({ where: { id: pre.id } });
      if (p.status === "refunded" || p.status === "partly_refunded") throw AppError.conflict("already_refunded", "This payment was already refunded.");
      if (p.status !== "succeeded") throw AppError.conflict("not_refundable", "Only a paid payment can be refunded.");
      if (input.amountKobo !== undefined && BigInt(input.amountKobo) !== p.amountKobo) {
        throw AppError.validation({ amountKobo: `A refund is for the whole payment: ${p.amountKobo} kobo.` });
      }
      const open = await tx.refund.findFirst({ where: { paymentId: p.id, status: { in: [...OPEN_REFUND] } }, select: { id: true } });
      if (open) throw AppError.conflict("refund_open", "This payment is already being refunded.");
      const row = await tx.refund.create({
        data: { id: this.ids.id(), paymentId: p.id, amountKobo: p.amountKobo, reason: "staff_decision", status: "requested", requestedBy: staffId(actor), createdAt: this.clock.now(), updatedAt: this.clock.now() },
      });
      await this.audit.write(tx, { actor, section: SECTION, action: "refund.start", target: { type: "refund", id: row.id }, reason, changedFields: ["status", "amountKobo"] });
      return row;
    });
  }

  /**
   * Moves a refund to approved (one transaction, one audit row when `reason` is given), asks the provider (outside it), then moves
   * it to sent, or to failed with the provider's words. A time-out or an unknown answer changes nothing more: it stays approved.
   */
  private async dispatch(id: string, reason: string | null, actor: AuditActor, allowSelf: boolean): Promise<Refund> {
    if (!UUID.test(id)) throw AppError.notFound("No such refund.");
    const pre = await this.db.refund.findUnique({ where: { id }, include: { payment: { select: { id: true, accountId: true } } } });
    if (!pre) throw AppError.notFound("No such refund.");
    const ready = await this.db.$transaction(async (tx) => {
      await this.lock(tx, pre.payment);
      const r = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (r.status === "requested") {
        if (!allowSelf && r.requestedBy === actor.id) throw AppError.forbidden("A refund is sent by someone other than who asked for it.");
        await tx.refund.update({ where: { id }, data: { status: "approved", approvedBy: staffId(actor), updatedAt: this.clock.now() } });
      } else if (r.status !== "approved") {
        throw AppError.conflict("refund_not_sendable", r.status === "sent" ? "This refund is already started." : `This refund is ${r.status}.`);
      }
      if (reason !== null) {
        await this.audit.write(tx, { actor, section: SECTION, action: "refund.send", target: { type: "refund", id }, reason, changedFields: ["status", "approvedBy"] });
      }
      return tx.refund.findUniqueOrThrow({ where: { id }, include: { payment: { select: { providerReference: true } } } });
    });

    let accepted: { providerReference: string } | null = null;
    let refusal: string | null = null;
    try {
      accepted = await this.provider.refund({ refundId: id, paymentReference: ready.payment.providerReference, amount: Money.kobo(ready.amountKobo) });
    } catch (e) {
      if (e instanceof RefundRefused) refusal = refusalText(e.message);
      else if (isPortTimeout(e) || e instanceof AppError) throw e;
      else throw new AppError(HttpStatus.BAD_GATEWAY, "provider_unavailable", "The payment service did not answer. The refund is kept; send it again in a moment.");
    }

    return this.db.$transaction(async (tx) => {
      await this.lock(tx, pre.payment);
      const r = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (r.status !== "approved") return r; // the provider's webhook got here first, or a second send did
      if (refusal !== null) {
        await tx.refund.update({ where: { id }, data: { status: "failed", updatedAt: this.clock.now() } });
        await this.audit.write(tx, {
          actor: { type: "system", id: null, requestId: actor.requestId },
          section: SECTION,
          action: "refund.failed",
          target: { type: "refund", id },
          reason: refusal,
          changedFields: ["status"],
        });
      } else if (accepted) {
        await tx.refund.update({ where: { id }, data: { status: "sent", providerReference: accepted.providerReference, updatedAt: this.clock.now() } });
      }
      return tx.refund.findUniqueOrThrow({ where: { id } });
    });
  }

  private async findPayment(input: StartInput): Promise<Pick<Payment, "id" | "accountId">> {
    const select = { id: true, accountId: true } as const;
    if (input.reference !== undefined) {
      const p = await this.db.payment.findUnique({ where: { providerReference: input.reference }, select });
      if (!p) throw AppError.notFound("No such payment.");
      return p;
    }
    if (!input.paymentId || !UUID.test(input.paymentId)) throw AppError.notFound("No such payment.");
    const p = await this.db.payment.findUnique({ where: { id: input.paymentId }, select });
    if (!p) throw AppError.notFound("No such payment.");
    return p;
  }

  /** The account first (an erased account's payment is still refunded), then the payment row. */
  private async lock(tx: Prisma.TransactionClient, p: Pick<Payment, "id" | "accountId">): Promise<void> {
    if (p.accountId) await lockAccount(tx, p.accountId, { allowErased: true });
    await tx.$queryRaw`SELECT id FROM payment WHERE id = ${p.id}::uuid FOR UPDATE`;
  }
}

function staffId(actor: AuditActor): string {
  if (actor.type !== "staff" || !actor.id) throw AppError.unauthorized();
  return actor.id;
}
