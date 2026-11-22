import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { JobContext, JobResult, JobsService } from "../jobs/jobs.service";
import { AbandonPayments } from "../payments/abandon";
import { FileJobs, ERASE_FILES_PREFIX } from "../stored-files/file-jobs";
import { STAGING_PREFIX } from "../stored-files/file-rules";
import { LinkLimits } from "../public-wishes/link-limits";

/** The subject key of a recurring job: one row for the whole system, moved on by the handler each time it runs. */
export const SWEEP_KEY = "sweep";
/** How often the recurring jobs run again (the handler answers `again`). */
export const ABANDON_EVERY_MS = 5 * 60_000;
export const UPLOAD_CLEANUP_EVERY_MS = 60 * 60_000;
export const LINK_HITS_EVERY_MS = 10 * 60_000;

/**
 * INT-3: the joins only a shared base can make. Registers with the jobs frame (JobsService.register) the handlers other bundles
 * exported, and starts the recurring ones:
 *   abandon-payment   (B05, AbandonPayments)  every 5 minutes: payments still waiting past the abandon time become abandoned
 *   upload-cleanup    (B09, FileJobs)         by subject: a staging key (a stray signed PUT, Y1), erase-files:<account> (X10), and
 *                                             the recurring sweep of uploads never confirmed (hourly)
 *   make-image-sizes  (B09, FileJobs)         one per confirmed image (the subject is the file's id)
 *   clean-link-hits   (B10, LinkLimits)       every 10 minutes: the public link's hits past their keeping time (LL4)
 * Each runs from the queue tick with a recorded run, never because a page is open.
 */
@Injectable()
export class JobHandlers implements OnModuleInit, OnApplicationBootstrap {
  private readonly log = new Logger("job-handlers");

  constructor(
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly abandon: AbandonPayments,
    private readonly files: FileJobs,
    private readonly links: LinkLimits,
  ) {}

  /**
   * Not in tests (NODE_ENV=test), like the tick and the recurring jobs: specs share one database, so an app that handled these kinds
   * would run another spec's waiting jobs from its own tick. A spec that wants them calls registerAll() itself.
   */
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.registerAll();
  }

  registerAll(): void {
    this.jobs.register("abandon-payment", (c) => this.abandonPayments(c));
    this.jobs.register("upload-cleanup", (c) => this.uploadCleanup(c));
    this.jobs.register("make-image-sizes", (c) => this.makeImageSizes(c));
    this.jobs.register("clean-link-hits", (c) => this.cleanLinkHits(c));
  }

  /** Puts the recurring jobs on the table (once: a second call moves the same rows). Not run in tests, which call it themselves. */
  async scheduleRecurring(): Promise<void> {
    const now = this.clock.now();
    await this.jobs.schedule("abandon-payment", now, SWEEP_KEY);
    await this.jobs.schedule("upload-cleanup", now, SWEEP_KEY);
    await this.jobs.schedule("clean-link-hits", now, SWEEP_KEY);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    this.scheduleRecurring().catch((e: unknown) => this.log.error(`could not schedule the recurring jobs: ${String(e)}`));
  }

  private async abandonPayments(c: JobContext): Promise<JobResult> {
    const abandoned = await this.abandon.run();
    return { changed: { abandoned }, again: new Date(c.now.getTime() + ABANDON_EVERY_MS) };
  }

  private async uploadCleanup(c: JobContext): Promise<JobResult> {
    if (c.subjectId.startsWith(STAGING_PREFIX)) {
      await this.files.sweepStagingKey(c.subjectId);
      return { changed: { swept: 1 } };
    }
    if (c.subjectId.startsWith(ERASE_FILES_PREFIX)) {
      const removed = await this.files.eraseFilesOf(c.subjectId.slice(ERASE_FILES_PREFIX.length));
      return { changed: { removed } };
    }
    const removed = (await this.files.sweepUnconfirmed()) + (await this.files.sweepUnattached()) + (await this.files.sweepUnpaidOrderFiles());
    return { changed: { removed }, again: new Date(c.now.getTime() + UPLOAD_CLEANUP_EVERY_MS) };
  }

  /** LL4: the public link's old hits are removed every 10 minutes. */
  private async cleanLinkHits(c: JobContext): Promise<JobResult> {
    const removed = await this.links.removeOld();
    return { changed: { removed }, again: new Date(c.now.getTime() + LINK_HITS_EVERY_MS) };
  }

  private async makeImageSizes(c: JobContext): Promise<JobResult> {
    const out = await this.files.makeImageSizes(c.subjectId);
    return out.made === 0 ? { changed: out, skipped: true } : { changed: out };
  }
}
