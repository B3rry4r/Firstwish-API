import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";

/**
 * ID1, IF3: the wish's owner drops a waiting ticket or extra payment at once, so a new start is allowed. One conditional UPDATE on the payment row marks it abandoned
 * (flagged as dropped by the owner) only while it is still waiting and unfulfilled: a settle that holds the row first wins and the drop is refused with
 * words; a drop that wins first leaves a late "paid" to the ticket rules (it gives the ticket only when the wish holds no paid ticket, else refund due).
 */
@Injectable()
export class TicketPaymentDrop {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Answers the payment's id; false when it was already dropped or lapsed. A paid, failed or refunded payment is 409; another account's or another purpose's (not a ticket's or an extra's) is 404. */
  async drop(accountId: string, reference: string): Promise<{ id: string; dropped: boolean }> {
    const row = await this.prisma.payment.findFirst({ where: { providerReference: reference, purpose: { in: ["ticket", "extra"] }, accountId }, select: { id: true, purpose: true } });
    if (!row) throw AppError.notFound("No such payment.");
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE payment SET status = 'abandoned', flags = array_append(flags, 'dropped_by_owner'), "updatedAt" = ${now}
         WHERE id = ${row.id}::uuid AND status IN ('pending', 'started') AND "fulfilledAt" IS NULL RETURNING id::text AS id`;
      if (changed.length) return { id: row.id, dropped: true };
      const current = await tx.payment.findUniqueOrThrow({ where: { id: row.id }, select: { status: true } });
      if (current.status === "abandoned") return { id: row.id, dropped: false };
      throw new AppError(409, row.purpose === "extra" ? "extra_payment_not_waiting" : "ticket_payment_not_waiting", current.status === "failed"
        ? "This payment did not go through, so there is nothing to drop."
        : "This payment has been paid, so it cannot be dropped.", { reference });
    });
  }
}
