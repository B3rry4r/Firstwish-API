import { Injectable } from "@nestjs/common";
import type { Template as TemplateRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, toPage } from "../../common/pagination/cursor";
import type { GetStudioTemplatesQuery, GetStudioTemplatesResponse, Template } from "../../contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function toWire(r: TemplateRow): Template {
  return {
    id: r.id,
    name: r.name ?? "",
    handle: r.handle ?? "",
    house: r.house ?? false,
    base: r.base ?? "",
    pace: r.pace ?? "",
    orientation: r.orientation ?? "",
    dimension: r.dimension ?? "",
    kinds: arr(r.kinds),
    mood: arr(r.mood),
    line: r.line ?? "",
    theme: r.theme ?? null,
  };
}

/** The house Studio templates (config, seeded from the web app's lib/studio.ts HOUSE), in base order. */
@Injectable()
export class TemplatesService {
  constructor(private readonly db: PrismaService) {}

  async list(q: GetStudioTemplatesQuery): Promise<GetStudioTemplatesResponse> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let where = {};
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (typeof c.key !== "string" || !UUID.test(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      where = { OR: [{ base: { gt: c.key } }, { base: c.key, id: { gt: c.id } }] };
    }
    const rows = await this.db.template.findMany({ where, orderBy: [{ base: "asc" }, { id: "asc" }], take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.base ?? "", id: r.id }));
    return { items: page.items.map(toWire), nextCursor: page.nextCursor };
  }
}
