import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { decodeCursor, toPage, type Page } from "../../common/pagination/cursor";
import type { ChapterSpec, EndingPurpose, Moment, OpeningDef } from "../../contracts";

const clean = <T>(row: Record<string, unknown>, drop: string[] = []): T => Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null && v !== undefined && !drop.includes(k))) as T;

/**
 * The four reference lists the maker reads (E-28, E-51, E-74, E-81): rows seeded from the web app's own files (prisma/seed-data, made by
 * scripts/export-seed-data.mjs; R5). Read only. The three small fixed lists answer whole in one page; moments honour ?cursor= and ?limit=.
 * Rows come in id order (the seed's ids are fixed), so the body, and the ETag made from it, is the same until staff-owned data changes.
 */
@Injectable()
export class ReferenceDataService {
  constructor(private readonly db: PrismaService) {}

  async chapterSpecs(): Promise<Page<ChapterSpec>> {
    const rows = await this.db.chapterSpec.findMany({ orderBy: { id: "asc" } });
    return { items: rows.map((r) => clean<ChapterSpec>(r, ["id"])), nextCursor: null };
  }

  async endingPurposes(): Promise<Page<EndingPurpose>> {
    const rows = await this.db.endingPurpose.findMany({ orderBy: { id: "asc" } });
    return { items: rows.map((r) => clean<EndingPurpose>(r)), nextCursor: null };
  }

  async openingDefs(): Promise<Page<OpeningDef>> {
    const rows = await this.db.openingDef.findMany({ orderBy: { id: "asc" } });
    return { items: rows.map((r) => clean<OpeningDef>(r)), nextCursor: null };
  }

  async moments(q: { cursor?: string; limit: number }): Promise<Page<Moment>> {
    const after = q.cursor ? decodeCursor(q.cursor).id : null;
    const rows = await this.db.moment.findMany({ where: after ? { id: { gt: after } } : undefined, orderBy: { id: "asc" }, take: q.limit + 1 });
    const page = toPage(rows, q.limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map((r) => clean<Moment>(r)), nextCursor: page.nextCursor };
  }
}
