import { Injectable } from "@nestjs/common";
import type { StoredFile as FileRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { StyleFile, StyleFiles } from "../../contracts";
import { isUuid, mediaKindOf, purposeOnWire } from "../stored-files/file-rules";
import { type Reader, SignedUrlsService } from "../stored-files/signed-urls.service";
import { hiddenFromBuyer } from "../wishes/wish-shown";

const notFound = () => AppError.notFound("No style has this id.");
/** A player reads at most this many files of one style at once. */
const PLAYER_FILES = 50;

/**
 * HW2: the files a Studio style holds (pictures, a poster, sound, a 3D model), read through signed reads. The style's owner reads
 * its files in any state (a draft's files included, a file still in screening too). A player of a wish in an APPROVED style reads that
 * style's files that passed screening. Nothing of a draft is readable by anyone else: another creator's id is 404.
 */
@Injectable()
export class StudioFilesService {
  constructor(
    private readonly db: PrismaService,
    private readonly signed: SignedUrlsService,
  ) {}

  private async view(f: FileRow, reader: Reader): Promise<StyleFile> {
    let url: string | null = null;
    let expiresAt: string | null = null;
    if (f.status === "ready" || (f.status === "screening" && reader.type === "owner")) {
      const s = await this.signed.signedRead({ fileId: f.id }, reader);
      url = s.url;
      expiresAt = s.expiresAt;
    }
    return { fileId: f.id, purpose: purposeOnWire(f.purpose), kind: f.kind ?? mediaKindOf(f.contentType), contentType: f.contentType, bytes: Number(f.bytes), status: f.status, url, expiresAt, createdAt: toWireInstant(f.createdAt) };
  }

  private async ownStyle(accountId: string, styleId: string): Promise<void> {
    if (!isUuid(styleId) || !(await this.db.studioStyle.findFirst({ where: { id: styleId, accountId }, select: { id: true } }))) throw notFound();
  }

  /** The owner's list of a style's files (ready and in screening), oldest first. */
  async list(accountId: string, styleId: string, q: { cursor?: string; limit?: number }): Promise<Page<StyleFile>> {
    await this.ownStyle(accountId, styleId);
    const limit = q.limit ?? DEFAULT_LIMIT;
    let after: string | null = null;
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!isUuid(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = c.id;
    }
    const rows = await this.db.storedFile.findMany({
      where: { styleId, ownerAccountId: accountId, status: { in: ["ready", "screening"] }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: "", id: r.id }));
    return { items: await Promise.all(page.items.map((r) => this.view(r, { type: "owner", accountId }))), nextCursor: page.nextCursor };
  }

  /** The owner's read of one file of a style. */
  async one(accountId: string, styleId: string, fileId: string): Promise<StyleFile> {
    await this.ownStyle(accountId, styleId);
    const f = isUuid(fileId) ? await this.db.storedFile.findFirst({ where: { id: fileId, styleId, ownerAccountId: accountId, status: { in: ["ready", "screening"] } } }) : null;
    if (!f) throw AppError.notFound("No such file.");
    return this.view(f, { type: "owner", accountId });
  }

  /** A player's read, through the wish's link: the files of the wish's style, once that style is approved (live). Anything else reads as not there. */
  async forPlayer(slug: string): Promise<StyleFiles> {
    const none = () => AppError.notFound("No such wish.");
    const link = await this.db.wishLink.findFirst({ where: { slug, active: true }, select: { wishId: true } });
    if (link && (await hiddenFromBuyer(this.db, link.wishId))) throw none();
    const wish = link ? await this.db.wish.findUnique({ where: { id: link.wishId }, select: { status: true, styleSlug: true, erasedAt: true } }) : null;
    if (!wish || wish.erasedAt || wish.status !== "live" || !wish.styleSlug) throw none();
    const style = await this.db.style.findFirst({ where: { slug: wish.styleSlug }, select: { id: true, on: true } });
    if (!style || style.on === false) return { style: wish.styleSlug, items: [] };
    const approved = await this.db.studioStyle.findFirst({ where: { id: style.id, status: "live" }, select: { id: true } });
    if (!approved) return { style: wish.styleSlug, items: [] };
    const rows = await this.db.storedFile.findMany({ where: { styleId: style.id, status: "ready" }, orderBy: { id: "asc" }, take: PLAYER_FILES });
    return { style: wish.styleSlug, items: await Promise.all(rows.map((r) => this.view(r, { type: "allowed" }))) };
  }
}
