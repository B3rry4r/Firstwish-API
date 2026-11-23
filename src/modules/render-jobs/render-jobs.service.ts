import { Injectable, OnModuleInit } from "@nestjs/common";
import type { RenderJob as JobRow } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { RenderJob } from "../../contracts";
import { JobsService } from "../jobs/jobs.service";
import { EntitlementsService } from "../price-book/entitlements.service";
import { ServerFileWriter } from "../server-files/server-files";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { wishHas } from "../wish-extras/wish-extras";
import { stateOf } from "../wishes/wish-state";
import { VideoRenderer, type RenderKind } from "./video-renderer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Default (lead), owner may override: the portrait video is 1080 x 1920; a status video runs 30 seconds, the file of a resting wish 60. */
export const SPEC: Record<RenderKind, { width: number; height: number; seconds: number }> = {
  "status-video": { width: 1080, height: 1920, seconds: 30 },
  "keepsake-export": { width: 1080, height: 1920, seconds: 60 },
};
/** A job that says "rendering" for longer than this lost its worker; the next run takes it again. */
export const RENDER_LEASE_MS = 10 * 60_000;
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
  ) {}

  /** Not in tests (NODE_ENV=test), like the other job handlers: specs share one database and call run() themselves. */
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.register();
  }

  register(): void {
    this.jobs.register("render-video", async (c) => ({ changed: { result: await this.run(c.subjectId) } }));
  }

  /** E-147: the latest job for the caller's wish. */
  async latest(accountId: string, wishId: string): Promise<RenderJob> {
    if (!UUID.test(wishId)) throw AppError.notFound();
    const row = await this.db.renderJob.findFirst({ where: { wishId, wish: { accountId } }, orderBy: { id: "desc" } });
    if (!row) throw AppError.notFound();
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
      if (kind === "status-video" && !wishHas(await this.entitlements.row(tx), w, "portraitVideo")) {
        throw new AppError(402, "payment_required", "This wish needs the portrait video. Get it to make the video.");
      }
      const found = await tx.renderJob.findFirst({ where: { wishId, kind: DB_KIND[kind] }, orderBy: { id: "desc" } });
      if (found && found.status !== "failed") return found.id;
      if (!this.renderer.configured()) // IK3: the person has the video already (paid, or on their ticket): they are told it is theirs and will not be charged again
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

  /** Runs one job: queued (or a lost rendering) to rendering to done or failed. A job already taken, done or failed is left alone. */
  async run(jobId: string, signal?: AbortSignal): Promise<string> {
    if (!UUID.test(jobId)) return "skipped";
    const now = this.clock.now();
    const claimed = await this.db.$queryRaw<{ wishId: string; kind: string; width: number; height: number; seconds: number }[]>`
      UPDATE render_job SET status = 'rendering', "updatedAt" = ${now}
       WHERE id = ${jobId}::uuid AND (status = 'queued' OR (status = 'rendering' AND "updatedAt" < ${new Date(now.getTime() - RENDER_LEASE_MS)}))
      RETURNING "wishId"::text AS "wishId", kind::text AS kind, width, height, seconds`;
    const c = claimed[0];
    if (!c) return "skipped";
    const kind: RenderKind = c.kind === "keepsake-export" ? "keepsake-export" : "status-video";
    try {
      const owner = await this.db.wish.findUniqueOrThrow({ where: { id: c.wishId }, select: { accountId: true } });
      const out = await this.renderer.render({ wishId: c.wishId, kind, width: c.width, height: c.height, seconds: c.seconds }, signal);
      const fileId = await this.files.write({ ownerAccountId: owner.accountId, purpose: kind === "status-video" ? "render" : "export", contentType: out.contentType, bytes: out.bytes, kind: "video" });
      await this.db.renderJob.updateMany({ where: { id: jobId, status: "rendering" }, data: { status: "done", outputFileId: fileId } });
      return "done";
    } catch {
      await this.db.renderJob.updateMany({ where: { id: jobId, status: "rendering" }, data: { status: "failed" } });
      return "failed";
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
