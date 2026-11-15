import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor, Page } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { AppError } from "../../common/errors/app-error";
import { findPublicCreator, listPublicCreators, lookupHandle, PublicCreator, toPublicCreator } from "../accounts/public-creators";

/** E-42: creators to follow: every public creator page, in join order. Public fields only. */
@Injectable()
export class CreatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(viewerId: string | null, cursor: string | undefined, limit = DEFAULT_LIMIT): Promise<Page<PublicCreator>> {
    let after: string | null = null;
    if (cursor) {
      const pos = decodeCursor(cursor);
      if (!isUuidV7(pos.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = pos.id;
    }
    const rows = await listPublicCreators(this.prisma, after, limit + 1, this.clock.now());
    const follows = new Set<string>();
    if (viewerId) {
      const mine = await this.prisma.follow.findMany({ where: { accountId: viewerId }, select: { handle: true } });
      for (const f of mine) if (f.handle) follows.add(f.handle);
    }
    const page = rows.slice(0, limit);
    const items = page.map((r) => toPublicCreator(r, { accountId: viewerId, follows }));
    const last = page[page.length - 1];
    return { items, nextCursor: rows.length > limit && last ? encodeCursor({ key: 0, id: last.creatorId }) : null };
  }

  /**
   * E-236 (X6): one creator's public page by handle. Public fields only. A handle that is missing, or whose side is off, or
   * that is banned or erased, is the same 404 (DEC-157).
   */
  async one(viewerId: string | null, raw: string): Promise<PublicCreator> {
    const handle = lookupHandle(raw);
    const notFound = () => AppError.notFound("No creator has that handle.");
    if (handle === null) throw notFound();
    const row = await findPublicCreator(this.prisma, handle, this.clock.now());
    if (!row) throw notFound();
    const follows = new Set<string>();
    if (viewerId) {
      const mine = await this.prisma.follow.findFirst({ where: { accountId: viewerId, handle: row.handle }, select: { id: true } });
      if (mine) follows.add(row.handle);
    }
    return toPublicCreator(row, { accountId: viewerId, follows });
  }
}
