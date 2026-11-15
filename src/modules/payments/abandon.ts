import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";

/** payments.abandonAfter (DEC-33, provisional): a payment still waiting this long after it started is marked abandoned. */
export const PAYMENTS_ABANDON_AFTER_MINUTES = 60;

/**
 * The handler of the `abandon-payment` job. Marks every pending or started payment older than the declared time abandoned, in
 * one statement (the status is checked in the same UPDATE, so a payment that was just paid is never touched). A late success
 * after this still fulfils once and is flagged (SettlementService). Returns how many it marked.
 * Registration with the jobs frame (B06) is the lead's wiring: call `abandonPendingPayments()` from the job handler.
 */
@Injectable()
export class AbandonPayments {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  async run(): Promise<number> {
    return abandonPendingPayments(this.db, this.clock.now());
  }
}

export async function abandonPendingPayments(db: Pick<PrismaService, "$executeRaw">, now: Date, afterMinutes = PAYMENTS_ABANDON_AFTER_MINUTES): Promise<number> {
  const cutoff = new Date(now.getTime() - afterMinutes * 60_000);
  return db.$executeRaw`UPDATE payment SET status = 'abandoned', "updatedAt" = ${now} WHERE status IN ('pending', 'started') AND "fulfilledAt" IS NULL AND "createdAt" < ${cutoff}`;
}
