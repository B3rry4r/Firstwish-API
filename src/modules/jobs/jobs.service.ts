import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { QueueService } from "../../common/queue/queue.service";

type Db = PrismaService | Prisma.TransactionClient;

/** The tries a job gets (the first run counts as one), then it is parked for staff (status dead). */
export const MAX_TRIES = 5;
/** Backoff before try n+1: 30 seconds doubled each time, at most an hour. */
export const backoffMs = (attempts: number): number => Math.min(30_000 * 2 ** (attempts - 1), 3_600_000);
/** A claimed job that never answers is run again after this long (its handler is safe to run twice). */
export const LEASE_MS = 10 * 60_000;

export interface JobContext {
  jobId: string;
  jobRunId: string;
  subjectId: string;
  attempt: number;
  now: Date;
}
/** What a handler answers: nothing, or what it changed. `skipped` records the run as skipped (nothing was due). */
export type JobResult = { changed?: Record<string, unknown>; skipped?: boolean; again?: Date } | void;
export type JobHandler = (ctx: JobContext) => Promise<JobResult> | JobResult;

/** The job type as the database spells it ("open-wish"); "open_wish" is read the same. */
const dbType = (kind: string): string => kind.trim().replace(/_/g, "-");

interface Claimed {
  id: string;
  type: string;
  subjectId: string;
  attempts: number;
  jobRunId: string;
}

/**
 * The jobs frame (declaration "jobs"): a due-jobs table (job) polled by a BullMQ repeating tick. A worker claims a job in one
 * statement (FOR UPDATE SKIP LOCKED), so two workers never run one job; a job that succeeded is never claimed again; a handler
 * that throws is retried with backoff up to MAX_TRIES, then parked (dead) for staff, who retry it from the admin list.
 * Every run is a job_run row. Other bundles call schedule(kind, at, key) and register(kind, handler).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly log = new Logger("jobs");
  private readonly handlers = new Map<string, JobHandler>();
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly queues: QueueService,
  ) {}

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(dbType(kind), handler);
  }

  /**
   * Schedules `kind` for `key` (the subject: a wish id, a payment id) at `at`. There is one job row per kind and key (CC4: a unique
   * index), so scheduling twice, or again after the job ran, moves the same row to `at` and makes it waiting again, in ONE statement
   * that two callers cannot race. A run in flight finishes as a recorded run; the row stays waiting for the new time. Pass the
   * caller's transaction to make the job commit with the caller's write.
   */
  async schedule(kind: string, at: Date, key: string, db: Db = this.prisma): Promise<string> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO job (id, type, "subjectId", "runAt", status, attempts, "createdAt")
      VALUES (${this.ids.id()}::uuid, ${dbType(kind)}::"JobType", ${key}, ${at}, 'scheduled', 0, ${this.clock.now()})
      ON CONFLICT (type, "subjectId") DO UPDATE SET "runAt" = EXCLUDED."runAt", status = 'scheduled', attempts = 0
      RETURNING id::text AS id`;
    return rows[0].id;
  }

  /** Takes a waiting job for `kind` and `key` off the table (a wish taken down no longer opens). */
  async cancel(kind: string, key: string, db: Db = this.prisma): Promise<void> {
    await db.$executeRaw`DELETE FROM job WHERE type = ${dbType(kind)}::"JobType" AND "subjectId" = ${key} AND status = 'scheduled'`;
  }

  /** Runs every due job this process can claim, one after another. Answers how many ran. */
  async runDue(limit = 100): Promise<number> {
    let ran = 0;
    while (ran < limit) {
      const job = await this.claim();
      if (!job) break;
      await this.execute(job);
      ran++;
    }
    return ran;
  }

  private async claim(): Promise<Claimed | null> {
    const types = [...this.handlers.keys()];
    if (!types.length) return null;
    const now = this.clock.now();
    const lease = new Date(now.getTime() + LEASE_MS);
    const runId = this.ids.id();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; type: string; subjectId: string; attempts: number }[]>`
        UPDATE job SET status = 'running', attempts = attempts + 1, "runAt" = ${lease}
         WHERE id = (
           SELECT id FROM job
            WHERE status IN ('scheduled', 'failed', 'running') AND "runAt" <= ${now} AND type::text = ANY(${types}::text[])
            ORDER BY "runAt", id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id::text AS id, type::text AS type, "subjectId", attempts`;
      const r = rows[0];
      if (!r) return null;
      // Written as a run that did not finish; the end of the run rewrites it. A crash leaves exactly this.
      await tx.$executeRaw`
        INSERT INTO job_run (id, "jobId", "startedAt", outcome, error)
        VALUES (${runId}::uuid, ${r.id}::uuid, ${now}, 'failed', 'did not finish')`;
      return { ...r, jobRunId: runId };
    });
  }

  private async execute(job: Claimed): Promise<void> {
    const handler = this.handlers.get(job.type)!;
    let outcome: "succeeded" | "failed" | "skipped" = "succeeded";
    let error: string | null = null;
    let changed: Record<string, unknown> | null = null;
    let again: Date | null = null;
    try {
      const res = await handler({ jobId: job.id, jobRunId: job.jobRunId, subjectId: job.subjectId, attempt: job.attempts, now: this.clock.now() });
      if (res && res.skipped) outcome = "skipped";
      if (res && res.changed) changed = res.changed;
      if (res && res.again) again = res.again;
    } catch (e) {
      outcome = "failed";
      error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      this.log.warn(`job ${job.type} ${job.id} try ${job.attempts} failed: ${error}`);
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE job_run SET outcome = ${outcome}::"JobRunOutcome", error = ${error}, "finishedAt" = ${now}, changed = ${changed === null ? null : JSON.stringify(changed)}::jsonb
         WHERE id = ${job.jobRunId}::uuid`;
      if (outcome !== "failed" && again) {
        await tx.$executeRaw`UPDATE job SET status = 'scheduled', attempts = 0, "runAt" = ${again} WHERE id = ${job.id}::uuid AND status = 'running'`;
      } else if (outcome !== "failed") {
        await tx.$executeRaw`UPDATE job SET status = 'succeeded', "runAt" = ${now} WHERE id = ${job.id}::uuid AND status = 'running'`;
      } else if (job.attempts >= MAX_TRIES) {
        await tx.$executeRaw`UPDATE job SET status = 'dead' WHERE id = ${job.id}::uuid AND status = 'running'`;
      } else {
        const next = new Date(now.getTime() + backoffMs(job.attempts));
        await tx.$executeRaw`UPDATE job SET status = 'failed', "runAt" = ${next} WHERE id = ${job.id}::uuid AND status = 'running'`;
      }
    });
  }

  /** Staff retry of a parked job: back to scheduled now, with its tries counted again. */
  async retryParked(jobId: string, db: Db = this.prisma): Promise<boolean> {
    const n = await db.$executeRaw`UPDATE job SET status = 'scheduled', attempts = 0, "runAt" = ${this.clock.now()} WHERE id = ${jobId}::uuid AND status IN ('dead', 'failed')`;
    return n > 0;
  }

  /** A BullMQ repeating tick that calls runDue. Not started in tests (NODE_ENV=test); a test starts it by hand. */
  async startPolling(everyMs = 5000): Promise<void> {
    if (this.worker) return;
    const q = this.queues.queue("jobs-tick");
    await q.upsertJobScheduler("due-jobs", { every: everyMs }, { name: "tick" });
    this.worker = this.queues.worker("jobs-tick", async () => {
      await this.runDue();
    });
    this.worker.on("error", () => undefined);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    this.startPolling().catch((e: unknown) => this.log.error(`could not start the job tick: ${String(e)}`));
  }
}
