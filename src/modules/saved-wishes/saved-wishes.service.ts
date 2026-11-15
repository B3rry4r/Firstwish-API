import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { SaveResponse } from "../../contracts";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import { isUuidV7 } from "../../common/ids/uuidv7";

type Db = PrismaService | Prisma.TransactionClient;

/**
 * An account saves a feed wish (E-155, E-156). A feed wish is a published_wish row; it is gone (not found) when the row is
 * taken down, or when the wish behind it is removed or erased. Save and unsave are idempotent: one row per account and wish
 * (unique index), and the answer is the same however many times either is sent. counts are the wish's reactions and saves as
 * counted in the database. forget() takes a wish off every saved list; taking a wish down or erasing it calls it.
 */
@Injectable()
export class SavedWishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  async save(accountId: string, wish: string): Promise<SaveResponse> {
    if (!isUuidV7(wish) || !(await this.listed(wish))) throw AppError.notFound("That wish is not in the feed.");
    await this.prisma.$executeRaw`
      INSERT INTO saved_wish (id, wish, "accountId") VALUES (${this.ids.id()}::uuid, ${wish}, ${accountId}::uuid)
      ON CONFLICT ("accountId", wish) DO NOTHING`;
    return { saved: true, counts: await this.counts(wish) };
  }

  /** Unsave answers saved: false even for a wish that has left the feed, and takes this account's row away either way. */
  async unsave(accountId: string, wish: string): Promise<SaveResponse> {
    if (!isUuidV7(wish)) throw AppError.notFound("That wish is not in the feed.");
    await this.prisma.savedWish.deleteMany({ where: { accountId, wish } });
    return { saved: false, counts: await this.counts(wish) };
  }

  /** Takes these wishes off every account's saved list. Answers how many saves were dropped. */
  async forget(wishIds: string[], db: Db = this.prisma): Promise<number> {
    if (!wishIds.length) return 0;
    const done = await db.savedWish.deleteMany({ where: { wish: { in: wishIds } } });
    return done.count;
  }

  /** True when the feed wish exists and the wish behind it (when it names one) is neither removed nor erased. */
  private async listed(id: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT NOT EXISTS (
               SELECT 1 FROM wish w
                WHERE w.id::text = pw.wish AND (w.status = 'removed' OR w."erasedAt" IS NOT NULL OR w."removedAt" IS NOT NULL)
             ) AS ok
        FROM published_wish pw WHERE pw.id = ${id}::uuid`;
    return rows[0]?.ok === true;
  }

  private async counts(wish: string): Promise<{ reactions: number; saves: number }> {
    const [reactions, saves] = await Promise.all([
      this.prisma.reaction.count({ where: { wish, reaction: { not: null } } }),
      this.prisma.savedWish.count({ where: { wish } }),
    ]);
    return { reactions, saves };
  }
}
