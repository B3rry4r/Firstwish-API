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
/** The words the maker shows for each ending purpose (the web app's PURPOSES in lib/engine/registry.ts), keyed by the purpose's own word. */
const PURPOSE_WORDS: Record<string, { name: string; line: string }> = {
  wish: { name: "A last act", line: "Something they do to finish it: blow, pop, light." },
  question: { name: "A question", line: "You ask. Their answer reaches you at once." },
  reveal: { name: "A reveal", line: "Something hidden comes out: a gift, one last line." },
  date: { name: "A date to keep", line: "The day, saved to their calendar." },
  credits: { name: "Every name", line: "Everyone who made it, rolling like a film." },
  close: { name: "A quiet close", line: "Your name, and nothing more." },
};
/** The id the web app's OPENINGS give each opening (lib/engine/registry.ts), by the opening's name. */
const OPENING_SLUGS: Record<string, string> = {
  "Sealed until a moment": "sealed",
  "A countdown": "countdown",
  "A passcode": "passcode",
  "A question only they can answer": "question",
  "A title card": "presents",
  "Opens straight away": "open",
};

@Injectable()
export class ReferenceDataService {
  constructor(private readonly db: PrismaService) {}

  async chapterSpecs(): Promise<Page<ChapterSpec>> {
    const rows = await this.db.chapterSpec.findMany({ orderBy: { id: "asc" } });
    return { items: rows.map((r) => clean<ChapterSpec>(r, ["id"])), nextCursor: null };
  }

  async endingPurposes(): Promise<Page<EndingPurpose>> {
    const rows = await this.db.endingPurpose.findMany({ orderBy: { id: "asc" } });
    // API-BASE-6: the row's `name` is the purpose's own word (wish, question...): it goes out as `slug`, and `name` and `line` are the words a person reads
    return { items: rows.map((r) => ({ ...clean<EndingPurpose>(r), slug: r.name ?? "", name: PURPOSE_WORDS[r.name ?? ""]?.name ?? r.name ?? "", line: PURPOSE_WORDS[r.name ?? ""]?.line ?? r.line ?? "" })), nextCursor: null };
  }

  async openingDefs(): Promise<Page<OpeningDef>> {
    const rows = await this.db.openingDef.findMany({ orderBy: { id: "asc" } });
    return { items: rows.map((r) => ({ ...clean<OpeningDef>(r), slug: OPENING_SLUGS[r.name ?? ""] ?? "" })), nextCursor: null };
  }

  async moments(q: { cursor?: string; limit: number }): Promise<Page<Moment>> {
    const after = q.cursor ? decodeCursor(q.cursor).id : null;
    const rows = await this.db.moment.findMany({ where: after ? { id: { gt: after } } : undefined, orderBy: { id: "asc" }, take: q.limit + 1 });
    const page = toPage(rows, q.limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map((r) => clean<Moment>(r)), nextCursor: page.nextCursor };
  }
}
