import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { AuditActor, AuditService } from "../audit/audit.service";

/** The audit section of the business's own plan screen. */
export const PLAN_SECTION = "/business/plan";

/**
 * HY1: the owner drops the business's waiting plan payment at once. One conditional UPDATE on the payment row marks it abandoned (and
 * flagged as dropped by the owner) only while it is still waiting and unfulfilled, so a settle that holds the row first wins and the drop
 * is refused with words, and a drop that wins first leaves the settle to HU6 (fulfilled only if nothing else has paid for a plan since,
 * otherwise refund due). The audit row is written in the same transaction as the business's own act. The same payment dropped again
 * changes nothing and writes nothing.
 */
@Injectable()
export class PlanPaymentDrop {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  /** Returns true when this call dropped it, false when it was already dropped or lapsed; a settled, failed or refunded payment is 409, a payment of another business (or none) is 404. */
  async drop(businessId: string, reference: string, actor: AuditActor): Promise<boolean> {
    const row = await this.prisma.payment.findFirst({ where: { providerReference: reference, purpose: "pro_plan", businessId }, select: { id: true } });
    if (!row) throw AppError.notFound("No such payment.");
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE payment SET status = 'abandoned', flags = array_append(flags, 'dropped_by_owner'), "updatedAt" = ${now}
         WHERE id = ${row.id}::uuid AND status IN ('pending', 'started') AND "fulfilledAt" IS NULL RETURNING id::text AS id`;
      if (changed.length) {
        await this.audit.write(tx, {
          actor,
          section: PLAN_SECTION,
          action: "plan.drop-pending",
          target: { type: "Payment", id: row.id },
          reason: "The owner dropped the plan payment that was waiting.",
          changedFields: ["status"],
        });
        return true;
      }
      const current = await tx.payment.findUniqueOrThrow({ where: { id: row.id }, select: { status: true } });
      if (current.status === "abandoned") return false;
      throw new AppError(409, "plan_payment_not_waiting", current.status === "failed"
        ? "This payment did not go through, so there is nothing to drop."
        : "This payment has been paid, so it cannot be dropped.", { reference });
    });
  }
}
