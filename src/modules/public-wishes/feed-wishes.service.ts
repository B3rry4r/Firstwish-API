import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import type { PlayWish, ReactResponse, ShareResponse } from "../../contracts";
import { SignedUrlsService } from "../stored-files/signed-urls.service";

type Reaction = "love" | "joy" | "clap" | "wow";
type Db = PrismaService | Prisma.TransactionClient;

interface Feed {
  id: string;
  wishId: string | null;
  title: string | null;
  kind: string | null;
  style: string | null;
  slug: string | null;
  ok: boolean;
}

/**
 * The signed-in side of a published wish: react (E-143, E-142), share (E-166) and play (E-122). A feed wish is a published_wish
 * row; it is not found unless the wish behind it is live (NN1: opened, its open time passed), and not removed, erased or resting, with no passcode. A share row holds no
 * account and no address: only which feed wish and which style.
 */
@Injectable()
export class FeedWishesService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly signed: SignedUrlsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async react(accountId: string, wish: string, reaction: Reaction): Promise<ReactResponse> {
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.feed(tx, wish);
      await tx.$executeRaw`
        INSERT INTO reaction (id, reaction, wish, "accountId") VALUES (${this.ids.id()}::uuid, ${reaction}::"ReactionReaction", ${wish}, ${accountId}::uuid)
        ON CONFLICT ("accountId", wish) DO UPDATE SET reaction = EXCLUDED.reaction`;
    });
    return { reaction: { reaction, wish }, counts: await this.counts(wish) };
  }

  /** Taking a reaction back works for a wish that has left the feed too. */
  async unreact(accountId: string, wish: string): Promise<ReactResponse> {
    if (!isUuidV7(wish)) throw AppError.notFound("That wish is not in the feed.");
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await tx.reaction.deleteMany({ where: { accountId, wish } });
    });
    return { reaction: null, counts: await this.counts(wish) };
  }

  async share(wish: string, style: string): Promise<ShareResponse> {
    const f = await this.feed(this.db, wish);
    const st = style.trim().slice(0, 60);
    await this.db.$executeRaw`INSERT INTO share (id, style, wish) VALUES (${this.ids.id()}::uuid, ${st || null}, ${wish})`;
    const base = this.env.PUBLIC_SITE_URL.replace(/\/+$/, "");
    return { url: `${base}/w/${f.slug}`, title: f.title ?? "A wish on Firstwish", text: "Someone made this wish on Firstwish." };
  }

  /** E-122: the wish and its content as a signed-in viewer plays it, with a signed read for each file the wish-to-file rows name. */
  async play(id: string): Promise<PlayWish> {
    const f = await this.feed(this.db, id);
    const w = await this.db.wish.findUniqueOrThrow({ where: { id: f.wishId as string } });
    const rows = await this.db.wishFile.findMany({ where: { wishId: w.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { fileId: true, role: true } });
    const files: { fileId: string; role: string; url: string; expiresAt: string }[] = [];
    for (const r of rows) {
      try {
        const s = await this.signed.signedRead({ fileId: r.fileId }, { type: "allowed" });
        files.push({ fileId: r.fileId, role: r.role, url: s.url, expiresAt: s.expiresAt });
      } catch (e) {
        if (!(e instanceof AppError) || e.getStatus() !== 404) throw e;
      }
    }
    const content = w.content && typeof w.content === "object" && !Array.isArray(w.content) ? w.content : {};
    return {
      wish: { id: f.id, no: w.no, kind: w.kind, occasion: w.occasion, styleSlug: w.styleSlug, receiverName: w.name },
      data: { ...content, files },
    };
  }

  private async counts(wish: string): Promise<{ reactions: number; saves: number }> {
    const [reactions, saves] = await Promise.all([
      this.db.reaction.count({ where: { wish, reaction: { not: null } } }),
      this.db.savedWish.count({ where: { wish } }),
    ]);
    return { reactions, saves };
  }

  /** The feed row, or 404 when it is not listed (same words for a wrong id, a taken-down wish and a resting one). */
  private async feed(db: Db, id: string): Promise<Feed & { slug: string }> {
    const none = AppError.notFound("That wish is not in the feed.");
    const now = this.clock.now();
    if (!isUuidV7(id)) throw none;
    const rows = await db.$queryRaw<Feed[]>`
      SELECT pw.id::text AS id, w.id::text AS "wishId", pw.title, w.kind, pw.style, l.slug,
             (w.status = 'live' AND w."opensAt" IS NOT NULL AND w."opensAt" <= ${now}
              AND w."erasedAt" IS NULL AND w."removedAt" IS NULL AND w."passcodeHash" IS NULL
              AND w."endsAt" IS NOT NULL AND w."endsAt" > ${now}
              AND l.active AND a."erasedAt" IS NULL) AS ok
        FROM published_wish pw
        JOIN wish w ON w.id = COALESCE(pw."wishId", CASE WHEN pw.wish ~ '^[0-9a-f-]{36}$' THEN pw.wish::uuid END)
        JOIN account a ON a.id = w."accountId"
        LEFT JOIN LATERAL (SELECT slug, active FROM wish_link WHERE "wishId" = w.id ORDER BY "createdAt" DESC, id DESC LIMIT 1) l ON true
       WHERE pw.id = ${id}::uuid`;
    const f = rows[0];
    if (!f || !f.ok || !f.slug) throw none;
    return f as Feed & { slug: string };
  }
}
