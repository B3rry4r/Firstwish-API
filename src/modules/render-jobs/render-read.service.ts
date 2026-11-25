import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { toWireInstant } from "../../common/time/time";
import type { PublicWishView, RenderWish } from "../../contracts";
import { LinkLimits, READS_PER_MINUTE } from "../public-wishes/link-limits";
import { EntitlementsService } from "../price-book/entitlements.service";
import { SignedUrlsService, type SizedRead } from "../stored-files/signed-urls.service";
import { StudioFilesService } from "../studio/studio-files.service";
import { videoRefunded } from "../wish-extras/wish-extras";
import { HOUSE_HANDLE } from "../wishes/house";
import { withoutSecrets } from "../wishes/opening-secret";
import { RENDER_TIME_LIMIT_DEFAULT_SECONDS } from "./render-jobs.service";
import { RenderTokens } from "./render-token";

/** The signed addresses of a render's files live the render's own limit plus this margin (seconds). */
export const RENDER_FILE_MARGIN_SECONDS = 600;
/** R6: reads a minute for one token (the page reads once; a few tries are allowed). */
export const RENDER_READS_PER_MINUTE = 20;

interface WishRow {
  id: string;
  slug: string | null;
  status: string;
  kind: string;
  occasion: string;
  styleSlug: string;
  styleSubmissionId: string | null;
  ticket: string | null;
  adds: unknown;
  opensAt: Date | null;
  openedAt: Date | null;
  endsAt: Date | null;
  timeZone: string;
  name: string | null;
  no: string | null;
  content: unknown;
  house: boolean;
}

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * R3 (IK6): `GET /v1/render/:token/wish`. What the web's render page needs to play one wish with no gate: the view a receiver gets after a right
 * unlock (content without any secret, signed file addresses), the opening marked passed, the style and the Studio style document the wish holds,
 * and the render's kind and length. It starts no term, counts no open, tells no sender and marks nothing opened (E-131's effects stay untouched).
 * A wish that is erased, taken down, a draft, of an erased account (a business wish keeps), not yet delivered by Concierge, or whose video extra was
 * refunded is 404 whatever the token: the token's own checks come first, then these.
 */
@Injectable()
export class RenderReadService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly tokens: RenderTokens,
    private readonly limits: LinkLimits,
    private readonly signed: SignedUrlsService,
    private readonly studio: StudioFilesService,
    private readonly entitlements: EntitlementsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async read(token: string, address: string | null): Promise<RenderWish> {
    // R6: the worker's one read by a RIGHT token has its own bucket, keyed by the token's hash, so a flood of the public link from the same address cannot refuse it;
    // a wrong or malformed token is limited by address, in the public link's shared "read" bucket, as before
    if (await this.tokens.isKnown(token)) await this.limits.take("render-read", this.limits.keyOf("render-token", this.tokens.hashOf(token)), RENDER_READS_PER_MINUTE, 60);
    else await this.limits.take("read", this.limits.keyOf(address), READS_PER_MINUTE, 60);
    const job = await this.tokens.consume(token);
    const row = await this.wishOf(job.wishId);
    if (!row) throw AppError.notFound("No such render.");
    // IK4a: an extra that was refunded gives no video read
    if (job.kind === "status-video" && (await videoRefunded(this.db, await this.entitlements.row(), { id: row.id, ticket: row.ticket, adds: row.adds }))) throw AppError.notFound("No such render.");
    const ttl = (this.env.RENDER_TIME_LIMIT_SECONDS || RENDER_TIME_LIMIT_DEFAULT_SECONDS) + RENDER_FILE_MARGIN_SECONDS;
    const files = await this.fileLinks(row.id, ttl);
    const stored = plain(row.content) ? withoutSecrets(row.content) : {}; // IK1c: no read returns a code or an answer
    const t = (d: Date | null): string | null => (d ? toWireInstant(d) : null);
    const wish: PublicWishView = {
      slug: row.slug ?? "", kind: row.kind, occasion: row.occasion, styleSlug: row.styleSlug, state: "open", openable: true,
      serverTime: toWireInstant(this.clock.now()), opensAt: t(row.opensAt), timeZone: row.timeZone, receiverName: row.name, wishNo: row.no,
      openedAt: t(row.openedAt), endsAt: t(row.endsAt), house: row.house, content: { ...stored, files }, files, opening: null, keepOffer: null,
    };
    const style = await this.studio.forRender({ styleSlug: row.styleSlug, styleSubmissionId: row.styleSubmissionId }, ttl);
    return { kind: job.kind, seconds: job.seconds, width: job.width, height: job.height, wish, style };
  }

  /** The wish the render plays, or null when it may not be read (the rules of the public link's own row query, without the link's switch and the wish's term). */
  private async wishOf(wishId: string): Promise<WishRow | null> {
    const rows = await this.db.$queryRaw<WishRow[]>`
      SELECT w.id::text AS id, (SELECT l.slug FROM wish_link l WHERE l."wishId" = w.id ORDER BY l.id LIMIT 1) AS slug, w.status::text AS status, w.kind, w.occasion,
             w."styleSlug", w."styleSubmissionId"::text AS "styleSubmissionId", w.ticket, w.adds, w."opensAt", w."openedAt", w."endsAt", w."timeZone", w.name, w.no, w.content,
             COALESCE(a.handle = ${HOUSE_HANDLE}, false) AS house
        FROM wish w JOIN account a ON a.id = w."accountId"
       WHERE w.id = ${wishId}::uuid AND w."erasedAt" IS NULL AND w."removedAt" IS NULL AND w.status::text IN ('sealed', 'live', 'resting')
         AND (a."erasedAt" IS NULL OR w."businessId" IS NOT NULL)
         AND (w."conciergeOrderId" IS NULL OR EXISTS (SELECT 1 FROM concierge_order_wish d WHERE d."wishId" = w.id))`;
    return rows[0] ?? null;
  }

  /** A signed read for each file the wish-to-file rows name; a file not passed by screening (held, refused, still checking) is left out, as the public link leaves it out. */
  private async fileLinks(wishId: string, ttl: number): Promise<{ fileId: string; role: string; url: string; expiresAt: string; variants: SizedRead[] }[]> {
    const rows = await this.db.wishFile.findMany({ where: { wishId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { fileId: true, role: true } });
    const out: { fileId: string; role: string; url: string; expiresAt: string; variants: SizedRead[] }[] = [];
    for (const r of rows) {
      try {
        const { read: s, sizes } = await this.signed.signedSet({ fileId: r.fileId }, { type: "allowed" }, ttl);
        out.push({ fileId: r.fileId, role: r.role, url: s.url, expiresAt: s.expiresAt, variants: sizes });
      } catch (e) {
        if (!(e instanceof AppError) || e.getStatus() !== 404) throw e;
      }
    }
    return out;
  }
}
