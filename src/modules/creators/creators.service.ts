import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor, Page } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { AppError } from "../../common/errors/app-error";
import type { PublishedWish } from "../../contracts";
import { ShowingService } from "../showing/showing.service";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import type { StyleOut } from "../styles/style-view";
import { StylesService } from "../styles/styles.service";
import { findPublicCreator, listPublicCreators, lookupHandle, PublicCreator, toPublicCreator } from "../accounts/public-creators";

/** E-42: creators to follow: every public creator page, in join order. Public fields only. */
@Injectable()
export class CreatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly signed: SignedUrlsService,
    private readonly styleBook: StylesService,
    private readonly showing: ShowingService,
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
    const items = await Promise.all(page.map(async (r) => ({ ...toPublicCreator(r, { accountId: viewerId, follows }), img: await this.pictureOf(r.img) })));
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
    return { ...toPublicCreator(row, { accountId: viewerId, follows }), img: await this.pictureOf(row.img) };
  }

  /** The row of a creator whose page is public (a handle that is missing, or whose side is off, or that is banned or erased, is one 404: DEC-157). */
  private async visible(raw: string): Promise<{ handle: string }> {
    const handle = lookupHandle(raw);
    const row = handle === null ? null : await findPublicCreator(this.prisma, handle, this.clock.now());
    if (!row) throw AppError.notFound("No creator has that handle.");
    return { handle: row.handle.toLowerCase() };
  }

  /** E-285 (IF6): the styles of a creator with a public page that are on, paged. */
  async styles(raw: string, q: { cursor?: string; limit?: number }): Promise<Page<StyleOut>> {
    return this.styleBook.publicListByCreator((await this.visible(raw)).handle, q);
  }

  /** E-283 (IF6): the wishes of a creator with a public page that are on Now showing now, paged, as the public list gives them (no viewer's marks). */
  async wishes(raw: string, q: { cursor?: string; limit?: number }): Promise<Page<PublishedWish>> {
    return this.showing.publicList(q, null, { creator: (await this.visible(raw)).handle });
  }

  /** HW2: a profile picture is a file id on the creator row; anyone reads it as a signed address once it passed screening (any other text stays as it was). */
  private async pictureOf(img: string | null): Promise<string | null> {
    if (!img || !/^[0-9a-f-]{36}$/i.test(img)) return img;
    return (await this.signed.signedRead({ fileId: img }, { type: "allowed" }).catch(() => null))?.url ?? null;
  }
}
