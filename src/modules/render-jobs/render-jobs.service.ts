import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { rm } from "node:fs/promises";
import type { Entitlements as EntitlementsRow, Prisma, RenderJob as JobRow } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { RenderJob } from "../../contracts";
import { JobsService } from "../jobs/jobs.service";
import { EntitlementsService } from "../price-book/entitlements.service";
import { ServerFileWriter } from "../server-files/server-files";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { videoRefunded, wishHas } from "../wish-extras/wish-extras";
import { ERASE_WISH_FILE_PREFIX } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { VideoRenderer, type RenderKind } from "./video-renderer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Default (lead), owner may override: the portrait video is 1080 x 1920; a status video runs 30 seconds, the file of a resting wish 60. */
export const SPEC: Record<RenderKind, { width: number; height: number; seconds: number }> = {
  "status-video": { width: 1080, height: 1920, seconds: 30 },
  "keepsake-export": { width: 1080, height: 1920, seconds: 60 },
};
/** A job that says "rendering" for longer than this lost its worker; the next run takes it again. R1: longer than the 20 minutes a render may run (10 minutes took a 12 minute render twice). */
export const RENDER_LEASE_MS = 25 * 60_000;
/** R1: the job kind of a render and the limit its row holds when the environment says nothing (RENDER_TIME_LIMIT_SECONDS). */
export const RENDER_JOB_KIND = "render-video";
export const RENDER_TIME_LIMIT_DEFAULT_SECONDS = 1200;

/** R1: RENDER_CONCURRENCY: at most `limit()` holders at once; the rest wait in order, and leave when their signal aborts. */
class Slots {
  private held = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly limit: () => number) {}
  async acquire(signal?: AbortSignal): Promise<() => void> {
    while (this.held >= Math.max(1, this.limit())) {
      await new Promise<void>((resolve, reject) => {
        const go = (): void => {
          signal?.removeEventListener("abort", stop);
          resolve();
        };
        const stop = (): void => {
          const at = this.waiting.indexOf(go);
          if (at >= 0) this.waiting.splice(at, 1);
          reject(new Error("the render was stopped while it waited for a place"));
        };
        if (signal?.aborted) return stop();
        signal?.addEventListener("abort", stop, { once: true });
        this.waiting.push(go);
      });
    }
    this.held++;
    return () => {
      this.held--;
      this.waiting.shift()?.();
    };
  }
}
const DB_KIND: Record<RenderKind, "status_video" | "keepsake_export"> = { "status-video": "status_video", "keepsake-export": "keepsake_export" };

/**
 * The video job (B19): asking makes a RenderJob (queued, rendering, done or failed). A failed job is asked again on the same row,
 * so the same ask is always the same job. The renderer is a port; with none configured the ask is refused (503), never faked.
 */
@Injectable()
export class RenderJobsService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly jobs: JobsService,
    private readonly renderer: VideoRenderer,
    private readonly files: ServerFileWriter,
    private readonly entitlements: EntitlementsService,
    private readonly signed: SignedUrlsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** RENDER_CONCURRENCY (default 2): how many renders this process runs at once. */
  private readonly slots = new Slots(() => this.env.RENDER_CONCURRENCY);
  /** How often a running render looks whether its wish was erased (milliseconds); a spec makes it short. */
  erasePollMs = 5000;

  /** Not in tests (NODE_ENV=test), like the other job handlers: specs share one database and call run() themselves. */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    await this.setTimeLimit();
    this.register();
  }

  register(): void {
    this.jobs.register(RENDER_JOB_KIND, async (c) => ({ changed: { result: await this.run(c.subjectId, c.signal) } }));
  }

  /** R1: the render-video row of job_kind_config (the migration holds 1200) follows RENDER_TIME_LIMIT_SECONDS. */
  async setTimeLimit(): Promise<void> {
    const seconds = this.env.RENDER_TIME_LIMIT_SECONDS || RENDER_TIME_LIMIT_DEFAULT_SECONDS;
    await this.db.jobKindConfig.upsert({ where: { kind: RENDER_JOB_KIND }, update: { timeLimitSeconds: seconds }, create: { id: this.ids.id(), kind: RENDER_JOB_KIND, timeLimitSeconds: seconds } });
  }

  /** How long a "rendering" row is believed: past the render's own limit, never under RENDER_LEASE_MS. */
  private leaseMs(): number {
    return Math.max(RENDER_LEASE_MS, (this.env.RENDER_TIME_LIMIT_SECONDS || 0) * 1000 + 5 * 60_000);
  }

  /** E-147: the latest job for the caller's wish. */
  async latest(accountId: string, wishId: string): Promise<RenderJob> {
    if (!UUID.test(wishId)) throw AppError.notFound();
    // IK4a: an erased wish gives no read and no address, like every other read of it
    const row = await this.db.renderJob.findFirst({ where: { wishId, wish: { accountId, erasedAt: null } }, orderBy: { id: "desc" } });
    if (!row) throw AppError.notFound();
    // IK4a: a video whose extra was refunded (refund sent) is no longer the person's: no read, no address
    if (row.kind === "status_video") {
      const w = await this.db.wish.findUniqueOrThrow({ where: { id: wishId }, select: { ticket: true, adds: true } });
      if (await videoRefunded(this.db, await this.entitlements.row(), { id: wishId, ...w })) throw AppError.notFound();
    }
    return this.view(row, accountId);
  }

  /** E-148: asks for the portrait video (the wish as a file when it rests). Checked: the owner, the entitlement, the renderer. */
  async ask(accountId: string, wishId: string): Promise<{ payment: null; item: RenderJob }> {
    if (!UUID.test(wishId)) throw AppError.notFound();
    const jobId = await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM wish WHERE id = ${wishId}::uuid AND "accountId" = ${accountId}::uuid AND "erasedAt" IS NULL AND ("conciergeOrderId" IS NULL OR EXISTS (SELECT 1 FROM concierge_order_wish d WHERE d."wishId" = wish.id)) FOR UPDATE`;
      if (!rows[0]) throw AppError.notFound();
      const w = await tx.wish.findUniqueOrThrow({ where: { id: wishId } });
      const state = stateOf(w);
      if (state === "taken_down" || state === "erased") throw AppError.notFound();
      if (state === "draft") throw AppError.conflict("wish_not_sealed", "Seal this wish before asking for its video.");
      const kind: RenderKind = state === "resting" ? "keepsake-export" : "status-video";
      if (kind === "status-video" && !(await this.holdsVideo(tx, await this.entitlements.row(tx), w))) {
        throw new AppError(402, "payment_required", "This wish needs the portrait video. Get it to make the video.");
      }
      const found = await tx.renderJob.findFirst({ where: { wishId, kind: DB_KIND[kind] }, orderBy: { id: "desc" } });
      if (found && found.status !== "failed") return found.id;
      // IK3: the person has the video already (paid, or on their ticket): they are told it is theirs and will not be charged again
      if (!this.renderer.configured()) throw new AppError(503, "video_unavailable", "Your video cannot be made right now. It stays yours and you will not pay again. Ask again later.");
      const now = this.clock.now();
      let id: string;
      if (found) {
        id = found.id;
        await tx.renderJob.update({ where: { id }, data: { status: "queued", updatedAt: now } });
      } else {
        id = this.ids.id();
        await tx.renderJob.create({ data: { id, wishId, kind: DB_KIND[kind], status: "queued", ...SPEC[kind], createdAt: now, updatedAt: now } });
      }
      await this.jobs.schedule("render-video", now, id, tx);
      return id;
    });
    return { payment: null, item: await this.view(await this.db.renderJob.findUniqueOrThrow({ where: { id: jobId } }), accountId) };
  }

  /** The wish has the portrait video to ask for: on its ticket, or bought and not refunded. */
  private async holdsVideo(db: Pick<Prisma.TransactionClient, "purchaseGrant">, book: EntitlementsRow, w: { id: string; ticket: string | null; adds: unknown }): Promise<boolean> {
    return wishHas(book, w, "portraitVideo") && !(await videoRefunded(db, book, w));
  }

  /**
   * Runs one job: queued (or a lost rendering) to rendering to done or failed. A job already taken, done or failed is left alone.
   * R1: waits for a place (RENDER_CONCURRENCY); the renderer gets an AbortSignal that ends when the job's time limit ends or the wish is
   * erased; the file it makes is streamed to the file store and the temp file is removed after a success and after a failure.
   */
  async run(jobId: string, signal?: AbortSignal): Promise<string> {
    if (!UUID.test(jobId)) return "skipped";
    const release = await this.slots.acquire(signal);
    try {
      return await this.runOne(jobId, signal);
    } finally {
      release();
    }
  }

  private async runOne(jobId: string, signal?: AbortSignal): Promise<string> {
    const now = this.clock.now();
    const claimed = await this.db.$queryRaw<{ wishId: string; kind: string; width: number; height: number; seconds: number }[]>`
      UPDATE render_job SET status = 'rendering', "updatedAt" = ${now}
       WHERE id = ${jobId}::uuid AND (status = 'queued' OR (status = 'rendering' AND "updatedAt" < ${new Date(now.getTime() - this.leaseMs())}))
      RETURNING "wishId"::text AS "wishId", kind::text AS kind, width, height, seconds`;
    const c = claimed[0];
    if (!c) return "skipped";
    const kind: RenderKind = c.kind === "keepsake-export" ? "keepsake-export" : "status-video";
    const stop = new AbortController();
    const onParent = (): void => stop.abort();
    if (signal?.aborted) stop.abort();
    else signal?.addEventListener("abort", onParent, { once: true });
    // IK4a: a wish erased while the renderer works stops the renderer
    let looking = false;
    const watch = setInterval(() => {
      if (looking || stop.signal.aborted) return;
      looking = true;
      this.db.wish
        .findUnique({ where: { id: c.wishId }, select: { erasedAt: true } })
        .then((w) => {
          if (!w || w.erasedAt) stop.abort();
        })
        .catch(() => undefined)
        .finally(() => {
          looking = false;
        });
    }, this.erasePollMs);
    let tempPath: string | null = null;
    try {
      const owner = await this.db.wish.findUniqueOrThrow({ where: { id: c.wishId }, select: { accountId: true, erasedAt: true } });
      if (owner.erasedAt) throw new Error("the wish was erased"); // IK4a: nothing is made for an erased wish
      const out = await this.renderer.render({ wishId: c.wishId, kind, width: c.width, height: c.height, seconds: c.seconds }, stop.signal);
      tempPath = out.path;
      if (stop.signal.aborted) throw new Error("the render was stopped");
      // IK4a: erased while it rendered (between two looks): nothing is written
      if ((await this.db.wish.findUnique({ where: { id: c.wishId }, select: { erasedAt: true } }))?.erasedAt) throw new Error("the wish was erased");
      const fileId = await this.files.writeFile({ ownerAccountId: owner.accountId, purpose: kind === "status-video" ? "render" : "export", contentType: out.contentType, path: out.path, bytes: out.bytes, kind: "video" });
      // IK4a: the wish may have been erased while the file was being kept: the file just written goes by the same cleanup job the erase queues for the wish's files
      if ((await this.db.wish.findUniqueOrThrow({ where: { id: c.wishId }, select: { erasedAt: true } })).erasedAt) {
        await this.db.renderJob.updateMany({ where: { id: jobId, status: "rendering" }, data: { status: "failed", outputFileId: fileId } });
        await this.jobs.schedule("upload-cleanup", this.clock.now(), `${ERASE_WISH_FILE_PREFIX}${fileId}`);
        return "failed";
      }
      await this.db.renderJob.updateMany({ where: { id: jobId, status: "rendering" }, data: { status: "done", outputFileId: fileId } });
      return "done";
    } catch {
      await this.db.renderJob.updateMany({ where: { id: jobId, status: "rendering" }, data: { status: "failed" } });
      return "failed";
    } finally {
      clearInterval(watch);
      signal?.removeEventListener("abort", onParent);
      if (tempPath) await rm(tempPath, { force: true });
    }
  }

  /** IK4: a ready job also carries a short-lived signed address of its stored file (the owner's own read only). */
  private async view(r: JobRow, accountId: string): Promise<RenderJob> {
    const out = this.wire(r);
    if (r.status !== "done" || !r.outputFileId) return out;
    const s = await this.signed.signedRead({ fileId: r.outputFileId }, { type: "owner", accountId });
    return { ...out, downloadUrl: s.url, downloadExpiresAt: s.expiresAt };
  }

  private wire(r: JobRow): RenderJob {
    return {
      createdAt: toWireInstant(r.createdAt),
      deliveredVia: r.deliveredVia,
      height: r.height,
      id: r.id,
      kind: r.kind === "keepsake_export" ? "keepsake-export" : r.kind === "premiere_clip" ? "premiere-clip" : "status-video",
      outputFileId: r.outputFileId,
      seconds: r.seconds,
      status: r.status,
      updatedAt: toWireInstant(r.updatedAt),
      width: r.width,
      wishId: r.wishId,
    };
  }
}
