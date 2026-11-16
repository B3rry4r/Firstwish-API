import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { isUuidV7 } from "../../common/ids/uuidv7";

export interface ReceiverActivity {
  /** reads of the link that showed the content (every one, the first included) */
  opens: number;
  /** how many opening sessions pressed play */
  plays: number;
  reactions: Record<string, number>;
  favourites: number;
  shares: number;
}

/** What the owner sees on a wish: counted from rows. B06's detail reads it through summary(). No personal data is held or returned. */
@Injectable()
export class ReceiverActivityService {
  constructor(private readonly db: PrismaService) {}

  async summary(wishIds: string[]): Promise<Map<string, ReceiverActivity>> {
    const ids = [...new Set(wishIds.filter((w) => isUuidV7(w)))];
    const out = new Map<string, ReceiverActivity>(ids.map((id) => [id, { opens: 0, plays: 0, reactions: {}, favourites: 0, shares: 0 }]));
    if (!ids.length) return out;
    const [opens, reactions, favs, shares] = await Promise.all([
      this.db.wishOpen.groupBy({ by: ["wishId", "kind"], where: { wishId: { in: ids } }, _count: { _all: true } }),
      this.db.wishReaction.groupBy({ by: ["wishId", "reaction"], where: { wishId: { in: ids } }, _count: { _all: true } }),
      this.db.$queryRaw<{ id: string; n: bigint }[]>`
        SELECT "wishId"::text AS id, count(*)::bigint AS n FROM wish_favourite WHERE "wishId" = ANY(${ids}::uuid[]) AND cardinality(hearts) > 0 GROUP BY 1`,
      this.db.$queryRaw<{ id: string; n: bigint }[]>`
        SELECT w.id::text AS id, count(*)::bigint AS n
          FROM share s JOIN wish w ON w.id = ANY(${ids}::uuid[])
         WHERE s.wish = w.id::text OR s.wish IN (SELECT pw.id::text FROM published_wish pw WHERE pw."wishId" = w.id OR pw.wish = w.id::text)
         GROUP BY 1`,
    ]);
    for (const r of opens) {
      const a = r.wishId ? out.get(r.wishId) : undefined;
      if (a && r.kind === "play") a.plays = r._count._all;
      else if (a) a.opens = r._count._all;
    }
    for (const r of reactions) {
      const a = out.get(r.wishId);
      if (a) a.reactions[r.reaction] = r._count._all;
    }
    for (const r of favs) {
      const a = out.get(r.id);
      if (a) a.favourites = Number(r.n);
    }
    for (const r of shares) {
      const a = out.get(r.id);
      if (a) a.shares = Number(r.n);
    }
    return out;
  }
}
