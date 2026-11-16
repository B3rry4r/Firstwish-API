import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { UserPrincipal } from "../../common/auth/principal";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { GatherFriendView, GatherOwnerView, GatherVoiceAdded, PostGBySlugVoiceBody, UploadTicket } from "../../contracts";
import { GATHER_ASKS_PER_ADDRESS_PER_HOUR, GATHER_ASKS_PER_LINK_PER_DAY, LinkLimits } from "../public-wishes/link-limits";
import { BusinessOf } from "../people/business-of";
import { isUuid, MAX_VOICE_SECONDS, UPLOAD_TTL_SECONDS } from "../stored-files/file-rules";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { MAX_VOICE_NOTES_PER_WISH, StoredFilesService } from "../stored-files/stored-files.service";

const SLUG = /^g[A-Za-z0-9_-]{8,30}$/;
/** What one address may do at a gather link: look 60 times a minute (asks are limited in link-limits: HU4). */
const LOOKS_PER_MINUTE = 60;
const NAME_MAX = 40;
const VOICE_MAX_BYTES = 10 * 1024 * 1024;

const firstName = (full: string | null | undefined): string => (full ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * HS1: the gather link. The owner of a wish (a person, or a business for its own wishes) has one link of its own per wish, apart from
 * the wish's link. A friend opens it with no account and sees who is asking and for whom (first names only), adds ONE voice note
 * (the same signed put and screening as any file; counted against the wish's 12) with their first name, and sees nothing else of the wish.
 * It works while the wish is a draft or sealed and not yet open, and while the owner has not turned it off.
 */
@Injectable()
export class GatherService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly limits: LinkLimits,
    private readonly files: StoredFilesService,
    private readonly reads: SignedUrlsService,
    private readonly business: BusinessOf,
  ) {}

  // ---- the owner's side

  private async owned(accountId: string, id: string) {
    if (!isUuid(id)) throw AppError.notFound("No such wish.");
    const biz = await this.business.find(accountId);
    const w = await this.db.wish.findFirst({ where: { id, ...(biz ? { OR: [{ accountId }, { businessId: biz }] } : { accountId }) }, select: { id: true, accountId: true, status: true, openedAt: true, erasedAt: true, removedAt: true } });
    if (!w || w.erasedAt || w.removedAt || w.status === "removed") throw AppError.notFound("No such wish.");
    return w;
  }

  private async linkOf(wishId: string, make: boolean): Promise<{ id: string; slug: string; active: boolean } | null> {
    const found = await this.db.wishGather.findUnique({ where: { wishId } });
    if (found || !make) return found;
    const row = { id: this.ids.id(), slug: `g${randomBytes(9).toString("base64url")}`, wishId, active: true, createdAt: this.clock.now() };
    // two reads at once make one link (wishId is unique)
    return this.db.wishGather.create({ data: row }).catch(async () => this.db.wishGather.findUniqueOrThrow({ where: { wishId } }));
  }

  /** HU4: the voices that have really arrived count against the wish's 12 (an ask that was never uploaded holds no place). */
  private async count(wishId: string): Promise<number> {
    const [n] = await this.db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM voice_note v JOIN stored_file f ON f.id = v.id WHERE v."wishId" = ${wishId}::uuid AND f.status IN ('uploaded', 'screening', 'ready')`;
    return n?.n ?? 0;
  }

  /** HU4: an ask whose upload was never confirmed lapses when its signed put has (15 minutes): its rows go. Safe to repeat. */
  private async lapse(w: { id: string; accountId: string }): Promise<void> {
    const before = new Date(this.clock.now().getTime() - UPLOAD_TTL_SECONDS * 1000);
    const stale = await this.db.$queryRaw<{ id: string }[]>`
      SELECT g.id::text AS id FROM wish_gather_voice g JOIN stored_file f ON f.id = g.id
       WHERE g."wishId" = ${w.id}::uuid AND f.status = 'pending' AND f."createdAt" < ${before}`;
    for (const r of stale) {
      await this.files.remove(this.ownerOf(w.accountId), r.id, {}, { gather: true }).catch(() => undefined);
      await this.db.wishGatherVoice.deleteMany({ where: { id: r.id } });
    }
  }

  private canAdd(w: { status: string; openedAt: Date | null }): boolean {
    return (w.status === "draft" || w.status === "sealed") && !w.openedAt;
  }

  /** E-263: the owner reads the gather link (made at the first read, also for a draft) and the voices that came through it, each as it arrives. */
  async ownerView(accountId: string, id: string): Promise<GatherOwnerView> {
    const w = await this.owned(accountId, id);
    await this.lapse(w);
    const link = (await this.linkOf(w.id, true)) as { id: string; slug: string; active: boolean };
    const rows = await this.db.$queryRaw<{ id: string; fromName: string; seconds: number | null; status: string; createdAt: Date }[]>`
      SELECT g.id::text AS id, g."fromName", v.seconds, f.status::text AS status, g."createdAt"
        FROM wish_gather_voice g JOIN voice_note v ON v.id = g.id JOIN stored_file f ON f.id = g.id
       WHERE g."wishId" = ${w.id}::uuid AND f.status IN ('uploaded', 'screening', 'ready') ORDER BY g."createdAt", g.id`;
    const voices: GatherOwnerView["voices"] = [];
    for (const r of rows) {
      let url: string | null = null;
      let expiresAt: string | null = null;
      if (r.status === "ready") {
        const s = await this.reads.signedRead({ fileId: r.id }, { type: "owner", accountId: w.accountId });
        url = s.url;
        expiresAt = s.expiresAt;
      }
      voices.push({ id: r.id, from: r.fromName, seconds: r.seconds ?? 0, state: r.status === "ready" ? "ready" : "checking", at: toWireInstant(r.createdAt), url, expiresAt });
    }
    const count = await this.count(w.id);
    return { slug: link.slug, link: `/g/${link.slug}`, active: link.active, open: link.active && this.canAdd(w), count, limit: MAX_VOICE_NOTES_PER_WISH, voices };
  }

  /** E-264: the owner turns the gather link off: a friend's visit finds it closed. Repeating it is 409 with words. */
  async turnOff(accountId: string, id: string): Promise<GatherOwnerView> {
    const w = await this.owned(accountId, id);
    const link = await this.linkOf(w.id, true);
    const done = await this.db.wishGather.updateMany({ where: { id: link?.id, active: true }, data: { active: false } });
    if (done.count === 0) throw AppError.conflict("gather_off", "This link is already turned off.");
    return this.ownerView(accountId, id);
  }

  /** E-265: the owner removes one voice that came through the link; the file goes with it and the room comes back. */
  async removeVoice(accountId: string, id: string, voiceId: string): Promise<void> {
    const w = await this.owned(accountId, id);
    if (!isUuid(voiceId)) throw AppError.notFound("No such voice.");
    const row = await this.db.wishGatherVoice.findFirst({ where: { id: voiceId, wishId: w.id } });
    if (!row) throw AppError.notFound("No such voice.");
    await this.files.remove(this.ownerOf(w.accountId), voiceId, {}, { gather: true });
    await this.db.wishGatherVoice.deleteMany({ where: { id: voiceId } });
  }

  private ownerOf(accountId: string): UserPrincipal {
    return { kind: "user", accountId, sides: ["person"] };
  }

  // ---- the friend's side (no account)

  private async friendLink(slug: string, address: string | null) {
    await this.limits.take("gather-look", this.limits.keyOf(address), LOOKS_PER_MINUTE, 60);
    if (!SLUG.test(slug)) throw AppError.notFound("No gather link is here.");
    const link = await this.db.wishGather.findUnique({ where: { slug }, include: { wish: { select: { id: true, accountId: true, status: true, openedAt: true, erasedAt: true, removedAt: true, name: true, kind: true, occasion: true } } } });
    const w = link?.wish;
    if (!link || !w || w.erasedAt || w.removedAt || w.status === "removed") throw AppError.notFound("No gather link is here.");
    return { link, w };
  }

  private async asking(w: { accountId: string; name: string | null; kind: string; occasion: string }): Promise<{ from: string; forName: string }> {
    const a = await this.db.account.findUnique({ where: { id: w.accountId }, select: { name: true, erasedAt: true } });
    return { from: a?.erasedAt ? "" : firstName(a?.name), forName: firstName(w.name) };
  }

  /** E-260: who is asking and for whom (first names only), how many voices there are room for, and what a voice may be. Nothing else of the wish. */
  async friendView(slug: string, address: string | null): Promise<GatherFriendView> {
    const { link, w } = await this.friendLink(slug, address);
    const who = await this.asking(w);
    const count = await this.count(w.id);
    const open = link.active && this.canAdd(w);
    return {
      from: who.from,
      forName: who.forName,
      kind: w.kind,
      occasion: w.occasion,
      open,
      reason: open ? null : !link.active ? "The person who asked has turned this link off." : "This wish is no longer taking voices.",
      count,
      limit: MAX_VOICE_NOTES_PER_WISH,
      full: count >= MAX_VOICE_NOTES_PER_WISH,
      maxSeconds: MAX_VOICE_SECONDS,
      maxBytes: VOICE_MAX_BYTES,
    };
  }

  private async openLink(slug: string, address: string | null) {
    const r = await this.friendLink(slug, address);
    if (!r.link.active) throw AppError.conflict("gather_off", "The person who asked has turned this link off.");
    if (!this.canAdd(r.w)) throw AppError.conflict("gather_closed", "This wish is no longer taking voices.");
    return r;
  }

  /** E-261: the friend asks to add one voice with their first name: a signed put (the same checks as any voice upload) and the voice's id. */
  async addVoice(slug: string, body: PostGBySlugVoiceBody, address: string | null): Promise<GatherVoiceAdded> {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > NAME_MAX || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw AppError.validation({ name: `Your first name, up to ${NAME_MAX} letters.` });
    const { w } = await this.openLink(slug, address);
    // HU4: asks are limited per address (any link) and per link, whether or not they ever upload
    await this.limits.take("gather-add", this.limits.keyOf(address), GATHER_ASKS_PER_ADDRESS_PER_HOUR, 3600);
    await this.limits.take("gather-add-link", this.limits.keyOf(slug), GATHER_ASKS_PER_LINK_PER_DAY, 86_400);
    await this.lapse(w);
    const ticket: UploadTicket = await this.files.createTicket(this.ownerOf(w.accountId), { purpose: "voice", contentType: body.contentType, bytes: body.bytes, seconds: body.seconds, subjectId: w.id }, { gather: true });
    await this.db.wishGatherVoice.create({ data: { id: ticket.id, wishId: w.id, fromName: firstName(name) || name, createdAt: this.clock.now() } });
    return { id: ticket.id, upload: ticket.upload };
  }

  /** E-262: the friend says the file is up. The file is checked and screened like any other; the answer is its state. */
  async confirmVoice(slug: string, voiceId: string, address: string | null): Promise<{ id: string; state: "ready" | "checking" | "refused"; reason?: string }> {
    const { w } = await this.openLink(slug, address);
    if (!isUuid(voiceId)) throw AppError.notFound("No such voice.");
    const row = await this.db.wishGatherVoice.findFirst({ where: { id: voiceId, wishId: w.id } });
    if (!row) throw AppError.notFound("No such voice.");
    const f = await this.files.confirm(this.ownerOf(w.accountId), voiceId, voiceId).catch(async (e: unknown) => {
      if (e instanceof AppError && e.getStatus() >= 400 && e.getStatus() < 500) await this.db.wishGatherVoice.deleteMany({ where: { id: voiceId } });
      throw e;
    });
    const status = (f as { status?: string }).status;
    if (status === "rejected" || status === "deleted") {
      await this.db.wishGatherVoice.deleteMany({ where: { id: voiceId } });
      return { id: voiceId, state: "refused", reason: (f as { reason?: string }).reason ?? "This voice could not be taken." };
    }
    return { id: voiceId, state: status === "ready" ? "ready" : "checking" };
  }
}
