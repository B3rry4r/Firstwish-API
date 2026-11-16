import { Global, Logger, Module, OnApplicationBootstrap, OnModuleInit } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { JobContext, JobResult, JobsService } from "../jobs/jobs.service";
import { NoticesModule } from "../notices/notices.module";
import { RoyaltiesModule } from "../royalties/royalties.module";
import { AdminCreatorsService } from "./admin-creators.service";
import { BankAccountsService } from "./bank-accounts.service";
import { PAYOUT_EVENT_SINK } from "./payout-event-sink";
import { PayoutRunService } from "./payout-run.service";
import { PayoutsController } from "./payouts.controller";
import { SignedPeriodService } from "./signed-period.service";

/** The monthly run's job: one row for the whole system, moved on to the next 5th by the handler. */
export const MONTHLY_RUN_KEY = "monthly";
/** Hour of the 5th the run starts: 08:00 UTC, 09:00 in Lagos. */
const RUN_HOUR_UTC = 8;
const RUN_DAY = 5;
/** WW8: the job that ends Signed periods has one row for the whole system and looks once a day. */
export const SIGNED_END_KEY = "signed-end";
const SIGNED_CHECK_MS = 24 * 3_600_000;

/** The next 5th, 08:00 UTC, after `now`. */
export function nextFifth(now: Date): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMonth = Date.UTC(y, m, RUN_DAY, RUN_HOUR_UTC);
  return new Date(thisMonth > now.getTime() ? thisMonth : Date.UTC(y, m + 1, RUN_DAY, RUN_HOUR_UTC));
}

/**
 * B16: the creator's bank account, payouts, the monthly payout run and the staff creators page. Global so the payments webhook can
 * reach the payout event sink (PAYOUT_EVENT_SINK) without the payments module importing this one.
 */
@Global()
@Module({
  imports: [RoyaltiesModule, NoticesModule],
  controllers: [PayoutsController],
  providers: [
    BankAccountsService,
    PayoutRunService,
    SignedPeriodService,
    AdminCreatorsService,
    { provide: PAYOUT_EVENT_SINK, useExisting: PayoutRunService },
  ],
  exports: [PayoutRunService, SignedPeriodService, PAYOUT_EVENT_SINK],
})
export class PayoutsModule implements OnModuleInit, OnApplicationBootstrap {
  private readonly log = new Logger("payouts");

  constructor(
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly runs: PayoutRunService,
    private readonly signed: SignedPeriodService,
  ) {}

  /** Not in tests (specs share one database and one job table): a spec calls registerJobs() itself. */
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.registerJobs();
  }

  registerJobs(): void {
    this.jobs.register("payout-run", (c) => this.monthly(c));
    this.jobs.register("creator-period", (c) => this.endSigned(c));
  }

  /** WW8: the daily job that ends Signed periods that have run out. Not registered in tests (a spec calls registerJobs, or the service). */
  private async endSigned(c: JobContext): Promise<JobResult> {
    const ended = await this.signed.endDue();
    return { changed: { ended }, again: new Date(c.now.getTime() + SIGNED_CHECK_MS) };
  }

  /** Puts the monthly job on the table (once: a second call moves the same row). */
  async scheduleMonthly(): Promise<void> {
    await this.jobs.schedule("payout-run", nextFifth(this.clock.now()), MONTHLY_RUN_KEY);
    await this.jobs.schedule("creator-period", this.clock.now(), SIGNED_END_KEY);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    this.scheduleMonthly().catch((e: unknown) => this.log.error(`could not schedule the payout run: ${String(e)}`));
  }

  /** The 5th: pays last month. Then sets the next 5th. */
  private async monthly(c: JobContext): Promise<JobResult> {
    const result = await this.runs.run(this.runs.lastMonth());
    return { changed: { ...result }, again: nextFifth(c.now) };
  }
}
