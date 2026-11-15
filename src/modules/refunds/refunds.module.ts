import { Global, Logger, Module, OnApplicationBootstrap, OnModuleInit } from "@nestjs/common";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";
import { portTimeouts, withTimeLimit } from "../../common/ports/time-limit";
import { JobContext, JobResult, JobsService } from "../jobs/jobs.service";
import { PaymentsModule } from "../payments/payments.module";
import { REFUND_EVENT_SINK } from "../payments/refund-event-sink";
import { PurchasesModule } from "../purchases/purchases.module";
import { AdminPaymentsService } from "./admin-payments.service";
import { PaystackRefundProvider } from "./paystack-refund-provider";
import { ReconciliationService } from "./reconciliation.service";
import { RefundProviderPort } from "./refund-provider.port";
import { RefundEvents } from "./refund-events.service";
import { AdminLedgerController, AdminPaymentsController, AdminReconciliationsController, AdminRefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";
import { StandinRefundProvider } from "./standin-refund-provider";

/** The daily settlement job: one row for the whole system, moved on to the next night by the handler. */
export const DAILY_SETTLEMENT_KEY = "daily";
const NEXT_RUN_HOUR_UTC = 2;
const DAY_MS = 86_400_000;

/**
 * B08: refunds, the settlement check and the staff payments pages. Global so the payments webhook can reach the refund event sink
 * without the payments module importing this one.
 */
@Global()
@Module({
  imports: [PaymentsModule, PurchasesModule],
  controllers: [AdminPaymentsController, AdminRefundsController, AdminLedgerController, AdminReconciliationsController],
  providers: [
    {
      provide: RefundProviderPort,
      inject: [ENV],
      useFactory: (env: Env): RefundProviderPort =>
        withTimeLimit(env.PROVIDERS === "standin" ? new StandinRefundProvider() : new PaystackRefundProvider(env.PAYSTACK_SECRET_KEY as string), "payments", portTimeouts(env.PORT_TIMEOUTS_MS).payments),
    },
    RefundsService,
    RefundEvents,
    { provide: REFUND_EVENT_SINK, useExisting: RefundEvents },
    ReconciliationService,
    AdminPaymentsService,
  ],
  exports: [RefundsService, ReconciliationService, REFUND_EVENT_SINK, RefundProviderPort],
})
export class RefundsModule implements OnModuleInit, OnApplicationBootstrap {
  private readonly log = new Logger("refunds");

  constructor(
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly days: ReconciliationService,
  ) {}

  /** Not in tests (specs share one database and one job table), like the other recurring jobs: a spec calls registerJobs() itself. */
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.registerJobs();
  }

  registerJobs(): void {
    this.jobs.register("reconcile-ledger", (c) => this.dailySettlement(c));
  }

  /** Puts the daily job on the table (once: a second call moves the same row). */
  async scheduleDaily(): Promise<void> {
    await this.jobs.schedule("reconcile-ledger", nextRun(this.clock.now()), DAILY_SETTLEMENT_KEY);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    this.scheduleDaily().catch((e: unknown) => this.log.error(`could not schedule the daily settlement: ${String(e)}`));
  }

  /** Checks yesterday against the provider, once (a day already checked changes nothing), and sets the next night. */
  private async dailySettlement(c: JobContext): Promise<JobResult> {
    const day = this.days.yesterday();
    const { row, created } = await this.days.reconcile(day);
    return { changed: { day, status: row.status, created }, again: nextRun(c.now) };
  }
}

/** The next 02:00 UTC after `now`. */
export function nextRun(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = midnight + NEXT_RUN_HOUR_UTC * 3_600_000;
  return new Date(today > now.getTime() ? today : today + DAY_MS);
}
