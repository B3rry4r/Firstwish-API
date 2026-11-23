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
/** R1: kinds that get fewer tries than MAX_TRIES (a render that fails twice is the style's fault: it is parked for staff). */
const MAX_TRIES_BY_KIND: Record<string, number> = { "render-video": 2 };
export const maxTriesOf = (type: string): number => MAX_TRIES_BY_KIND[type.trim().replace(/_/g, "-")] ?? MAX_TRIES;
/** Backoff before try n+1: 30 seconds doubled each time, at most an hour. */
export const backoffMs = (attempts: number): number => Math.min(30_000 * 2 ** (attempts - 1), 3_600_000);
/** A claimed job that never answers is run again after this long (its handler is safe to run twice). */
export const LEASE_MS = 10 * 60_000;
/** R1: a kind whose time limit is long keeps its lease past the limit by this much, so a run still inside its limit is never taken twice. */
export const LEASE_MARGIN_MS = 60_000;

/** The time limit of one run when job_kind_config has no row for the kind (EE1). */
export const DEFAULT_TIME_LIMIT_SECONDS = 60;

export interface JobContext {
  jobId: string;
  /** Aborted when the run passes its time limit (EE1): a handler that can stop early should watch it. */
  signal: AbortSignal;
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
  /** Handlers for the subjects of one kind that start with a prefix; they answer before the kind's own handler. */
  private readonly routes: { type: string; prefix: string; handler: JobHandler }[] = [];
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

  /** Registers a handler for the jobs of `kind` whose subject key starts with `prefix` (a kind several bundles share). */
  registerSubject(kind: string, prefix: string, handler: JobHandler): void {
    const type = dbType(kind);
    const at = this.routes.findIndex((r) => r.type === type && r.prefix === prefix);
    if (at >= 0) this.routes[at] = { type, prefix, handler };
    else this.routes.push({ type, prefix, handler });
  }

  private handlerFor(type: string, subjectId: string): JobHandler | undefined {
    return this.routes.find((r) => r.type === type && subjectId.startsWith(r.prefix))?.handler ?? this.handlers.get(type);
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

  /**
   * Takes a waiting job for `kind` and `key` off the table (a wish taken down no longer opens). It never throws and is one statement:
   * a waiting job with no run history is deleted; one that already has job_run history (a job that ran and was scheduled again) cannot
   * be deleted (the history names it), so it is marked cancelled (HC2), which the runner never claims again. A job that is running, already
   * ran (succeeded, failed, dead, cancelled) or is not there is left as it is. Scheduling it again later makes it wait again.
   */
  async cancel(kind: string, key: string, db: Db = this.prisma): Promise<void> {
    await db.$executeRaw`
      WITH j AS (SELECT id FROM job WHERE type = ${dbType(kind)}::"JobType" AND "subjectId" = ${key} AND status = 'scheduled' FOR UPDATE),
           gone AS (DELETE FROM job USING j WHERE job.id = j.id AND NOT EXISTS (SELECT 1 FROM job_run r WHERE r."jobId" = j.id) RETURNING job.id)
      UPDATE job SET status = 'cancelled' FROM j WHERE job.id = j.id AND job.id NOT IN (SELECT id FROM gone)`;
  }

  /**
   * Runs every due job this process can claim, one after another. Answers how many ran. `only` restricts the run to jobs with these
   * subject keys (a spec that shares a database with others runs just its own rows; the tick passes nothing).
   */
  async runDue(limit = 100, only?: string[]): Promise<number> {
    let ran = 0;
    while (ran < limit) {
      const job = await this.claim(only);
      if (!job) break;
      await this.execute(job);
      ran++;
    }
    return ran;
  }

  private async claim(only?: string[]): Promise<Claimed | null> {
    const types = [...this.handlers.keys()];
    const routeTypes = this.routes.map((r) => r.type);
    const routePrefixes = this.routes.map((r) => r.prefix);
    if (!types.length && !routeTypes.length) return null;
    const now = this.clock.now();
    const lease = new Date(now.getTime() + LEASE_MS);
    const runId = this.ids.id();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; type: string; subjectId: string; attempts: number }[]>`
        UPDATE job SET status = 'running', attempts = attempts + 1, "runAt" = ${lease}
         WHERE id = (
           SELECT id FROM job
            WHERE status IN ('scheduled', 'failed', 'running') AND "runAt" <= ${now} AND (type::text = ANY(${types}::text[])
                   OR EXISTS (SELECT 1 FROM unnest(${routeTypes}::text[], ${routePrefixes}::text[]) AS r(t, p)
                               WHERE r.t = type::text AND starts_with("subjectId", r.p)))
              AND (${only ?? null}::text[] IS NULL OR "subjectId" = ANY(${only ?? null}::text[]))
            ORDER BY "runAt", id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id::text AS id, type::text AS type, "subjectId", attempts`;
      const r = rows[0];
      if (!r) return null;
      // R1: a kind with a long time limit (a video render: 20 minutes) is leased past its limit, else a run still inside it is claimed again
      const limit = await this.timeLimitSeconds(r.type, tx);
      if (limit * 1000 + LEASE_MARGIN_MS > LEASE_MS) {
        await tx.$executeRaw`UPDATE job SET "runAt" = ${new Date(now.getTime() + limit * 1000 + LEASE_MARGIN_MS)} WHERE id = ${r.id}::uuid`;
      }
      // Written as a run that did not finish; the end of the run rewrites it. A crash leaves exactly this.
      await tx.$executeRaw`
        INSERT INTO job_run (id, "jobId", "startedAt", outcome, error)
        VALUES (${runId}::uuid, ${r.id}::uuid, ${now}, 'failed', 'did not finish')`;
      return { ...r, jobRunId: runId };
    });
  }

  private async execute(job: Claimed): Promise<void> {
    const handler = this.handlerFor(job.type, job.subjectId);
    const limitMs = (await this.timeLimitSeconds(job.type)) * 1000;
    let outcome: "succeeded" | "failed" | "skipped" = "succeeded";
    let error: string | null = null;
    let changed: Record<string, unknown> | null = null;
    let again: Date | null = null;
    try {
      if (!handler) throw new Error(`no handler for ${job.type}`);
      const res = await this.withTimeLimit(handler, limitMs, {
        jobId: job.id, jobRunId: job.jobRunId, subjectId: job.subjectId, attempt: job.attempts, now: this.clock.now(),
      });
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
      } else if (job.attempts >= maxTriesOf(job.type)) {
        await tx.$executeRaw`UPDATE job SET status = 'dead' WHERE id = ${job.id}::uuid AND status = 'running'`;
      } else {
        const next = new Date(now.getTime() + backoffMs(job.attempts));
        await tx.$executeRaw`UPDATE job SET status = 'failed', "runAt" = ${next} WHERE id = ${job.id}::uuid AND status = 'running'`;
      }
    });
  }

  /** The run's time limit in seconds: the kind's row in job_kind_config, else 60 (EE1). */
  private async timeLimitSeconds(type: string, db: Db = this.prisma): Promise<number> {
    const rows = await db.$queryRaw<{ s: number }[]>`SELECT "timeLimitSeconds" AS s FROM job_kind_config WHERE kind = ${type}`;
    const s = rows[0]?.s;
    return typeof s === "number" && s > 0 ? s : DEFAULT_TIME_LIMIT_SECONDS;
  }

  /**
   * EE1: runs the handler against the limit. Passing it aborts the signal and fails the run (timeout), so the caller records it,
   * retries with backoff and goes on; a handler that never answers cannot hold the worker or the tick. What it does after that is ignored.
   */
  private async withTimeLimit(handler: JobHandler, limitMs: number, base: Omit<JobContext, "signal">): Promise<JobResult> {
    const ac = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new Error(`timeout: the run passed its limit of ${limitMs / 1000} seconds`));
      }, limitMs);
    });
    const run = Promise.resolve().then(() => handler({ ...base, signal: ac.signal }));
    run.catch(() => undefined);
    try {
      return await Promise.race([run, limit]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Staff retry of a parked job: back to scheduled now, with its tries counted again. */
  async retryParked(jobId: string, db: Db = this.prisma): Promise<boolean> {
    const n = await db.$executeRaw`UPDATE job SET status = 'scheduled', attempts = 0, "runAt" = ${this.clock.now()} WHERE id = ${jobId}::uuid AND status IN ('dead', 'failed')`;
    return n > 0;
  }

  /**
   * A BullMQ repeating tick that calls runDue. Not started in tests (NODE_ENV=test); a test starts it by hand, with `only` so that
   * the tick runs just its own subject keys (specs share one job table). Production passes nothing.
   */
  async startPolling(everyMs = 5000, only?: string[]): Promise<void> {
    if (this.worker) return;
    const q = this.queues.queue("jobs-tick");
    await q.upsertJobScheduler("due-jobs", { every: everyMs }, { name: "tick" });
    this.worker = this.queues.worker("jobs-tick", async () => {
      await this.runDue(100, only);
    });
    this.worker.on("error", () => undefined);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    this.startPolling().catch((e: unknown) => this.log.error(`could not start the job tick: ${String(e)}`));
  }
}
