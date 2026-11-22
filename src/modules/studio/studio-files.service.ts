import { Injectable } from "@nestjs/common";
import type { StoredFile as FileRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { toWireInstant } from "../../common/time/time";
import type { StyleFile, StyleFiles } from "../../contracts";
import { Clock } from "../../common/ports/clock.port";
import { UnlockTokens } from "../public-wishes/unlock-token";
import { ApprovedStyleDocuments, NEWEST_APPROVED } from "../styles/approved-document";
import { fileIdsOf } from "./submission-checks";
import { NOT_ACCEPTED, refusalsOf } from "../stored-files/refusal-words";
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
    private readonly approved: ApprovedStyleDocuments,
    private readonly tokens: UnlockTokens,
    private readonly clock: Clock,
  ) {}

  private async view(f: FileRow, reader: Reader, reasons?: Map<string, string>): Promise<StyleFile> {
    let url: string | null = null;
    let expiresAt: string | null = null;
    if (f.status === "ready" || (f.status === "screening" && reader.type === "owner")) {
      const s = await this.signed.signedRead({ fileId: f.id }, reader);
      url = s.url;
      expiresAt = s.expiresAt;
    }
    return { fileId: f.id, purpose: purposeOnWire(f.purpose), kind: f.kind ?? mediaKindOf(f.contentType), contentType: f.contentType, bytes: Number(f.bytes), status: f.status, reason: f.status === "rejected" ? (reasons ?? (await refusalsOf(this.db, [f]))).get(f.id) ?? NOT_ACCEPTED : null, url, expiresAt, createdAt: toWireInstant(f.createdAt) };
  }

  private async ownStyle(accountId: string, styleId: string): Promise<void> {
    if (!isUuid(styleId) || !(await this.db.studioStyle.findFirst({ where: { id: styleId, accountId }, select: { id: true } }))) throw notFound();
  }

  /** The owner's list of a style's files (ready, in screening and refused, with the refusal's words), oldest first. */
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
      where: { styleId, ownerAccountId: accountId, keptAt: null, status: { in: ["ready", "screening", "rejected"] }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: "", id: r.id }));
    const reasons = await refusalsOf(this.db, page.items);
    return { items: await Promise.all(page.items.map((r) => this.view(r, { type: "owner", accountId }, reasons))), nextCursor: page.nextCursor };
  }

  /** The owner's read of one file of a style. */
  async one(accountId: string, styleId: string, fileId: string): Promise<StyleFile> {
    await this.ownStyle(accountId, styleId);
    const f = isUuid(fileId) ? await this.db.storedFile.findFirst({ where: { id: fileId, styleId, ownerAccountId: accountId, keptAt: null, status: { in: ["ready", "screening", "rejected"] } } }) : null;
    if (!f) throw AppError.notFound("No such file.");
    return this.view(f, { type: "owner", accountId });
  }

  /**
   * A player's read, through the wish's link (HW2, II1): the files of the wish's style and the style's APPROVED document, once the style
   * was approved. A wish already made keeps playing when its style is later switched off, taken back by its creator or its creator's
   * account is erased (HX4); a style that was never approved (a draft, one in review, one sent back) gives nothing. The wish must be
   * showing as E-129 decides: live and opened, not resting, not removed, its link on, and behind its passcode (the page's unlock token)
   * where it has one. Anything else reads as not there.
   */
  async forPlayer(slug: string, token?: string): Promise<StyleFiles> {
    const none = () => AppError.notFound("No such wish.");
    const link = await this.db.wishLink.findFirst({ where: { slug, active: true }, select: { id: true, wishId: true } });
    if (link && (await hiddenFromBuyer(this.db, link.wishId))) throw none();
    const wish = link
      ? await this.db.wish.findUnique({
          where: { id: link.wishId },
          select: { status: true, styleSlug: true, styleSubmissionId: true, erasedAt: true, removedAt: true, openedAt: true, endsAt: true, passcodeHash: true, businessId: true, account: { select: { erasedAt: true } } },
        })
      : null;
    if (!link || !wish || wish.erasedAt || wish.removedAt || wish.status !== "live" || !wish.styleSlug) throw none();
    if (wish.account.erasedAt && !wish.businessId) throw none();
    if (!wish.openedAt || !wish.endsAt || wish.endsAt.getTime() <= this.clock.now().getTime()) throw none();
    if (wish.passcodeHash && !this.tokens.valid(token, link.id, wish.passcodeHash)) throw none();
    const style = await this.db.style.findFirst({ where: { slug: wish.styleSlug }, select: { id: true } });
    const document = style ? await this.approved.of(style.id, wish.styleSubmissionId) : null;
    if (!style || !document) return { style: wish.styleSlug, items: [], document: null };
    // II3/II4: a wish made under an older approved version gets the files that version names (a kept file included), not what a newer draft uploaded;
    // the newest version gets the style's files, and a kept file only where the newest version names it.
    const pin = wish.styleSubmissionId ? await this.db.styleSubmission.findFirst({ where: { id: wish.styleSubmissionId, styleId: style.id, status: "live" }, include: { styleSubmissionSnapshotBySubmission: { select: { document: true } } } }) : null;
    const newest = await this.db.styleSubmission.findFirst({ where: { styleId: style.id, status: "live" }, orderBy: NEWEST_APPROVED, include: { styleSubmissionSnapshotBySubmission: { select: { document: true } } } });
    const named = (sub: typeof pin): string[] => {
      const d = sub?.styleSubmissionSnapshotBySubmission?.document;
      return d && typeof d === "object" && !Array.isArray(d) ? fileIdsOf(d as Record<string, unknown>).map((x) => x.toLowerCase()) : [];
    };
    // a style being edited (taken back, sent in, returned) has uploads that belong to the next version: only what the version names is given then
    const studio = await this.db.studioStyle.findUnique({ where: { id: style.id }, select: { status: true } });
    const older = (pin && newest && pin.id !== newest.id) || studio?.status !== "live";
    const rows = await this.db.storedFile.findMany({
      where: older
        ? { styleId: style.id, status: "ready", id: { in: named(pin ?? newest) } }
        : { styleId: style.id, status: "ready", OR: [{ keptAt: null }, { id: { in: named(newest) } }] },
      orderBy: { id: "asc" },
      take: PLAYER_FILES,
    });
    return { style: wish.styleSlug, items: await Promise.all(rows.map((r) => this.view(r, { type: "allowed" }))), document };
  }
}
