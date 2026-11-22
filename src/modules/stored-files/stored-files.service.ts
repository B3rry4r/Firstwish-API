import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma, type Business, type StoredFile as FileRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import { fileNameTag } from "../../common/env/env";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import type { UserPrincipal } from "../../common/auth/principal";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { StoragePort } from "../../common/ports/storage.port";
import { lockAccount } from "../../common/db/account-lock";
import { toWireInstant } from "../../common/time/time";
import type { DeleteUploadsByIdBody, PostUploadsBody, StoredFile, UploadTicket } from "../../contracts";
import {
  fileView,
  GB,
  isImage,
  isUuid,
  looksLikeSvg,
  MAX_VOICE_SECONDS,
  maxBytesFor,
  mediaKindOf,
  normaliseType,
  purposeOf,
  purposeOnWire,
  PurposeRule,
  STAGING_SWEEP_AFTER_SECONDS,
  stagingKeyOf,
  typeFromBytes,
  UPLOAD_TTL_SECONDS,
  variantsOf,
} from "./file-rules";
import { readLimits } from "../price-book/book-limits";
import { notInBusiness } from "../../common/auth/login-removed";
import { businessAccessOf } from "./vault-access";
import { namedBusiness } from "../people/business-of";
import { ScreeningService } from "./screening.service";
import { dropFileHearts } from "../vault/vault-shared";
import { SHOWN_TO_BUYER } from "../wishes/wish-shown";
import { checkOrderRoom, lockOwnOpenOrder } from "./order-files";

type Tx = Prisma.TransactionClient;

const refused = (message: string) => new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "upload_refused", message, { fileId: message });
const WAIT_FOR_OTHER_CONFIRM_MS = 25_000;
const WAIT_POLL_MS = 100;

/** X23: a file still named by a row with a real foreign key (a wish, a card, a render, a request) cannot be deleted. */
const isStillUsed = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Vault space (GG4): the plan's GB plus the GB of every live grant: a wish pack's (its vaultGb, for its 90 days) and bought Vault
 * space (its gb, for its period), read from the grants (not refunded, not refused, not past their end). business.pack is wishes left.
 * EA3: the plan's space counts only while the plan is live (its renewal date not past), as the Vault's own standing counts it.
 */
export async function vaultLimitBytes(tx: Tx, biz: Pick<Business, "id" | "plan" | "renews">, now: Date): Promise<number> {
  const e = await tx.entitlements.findFirst();
  if (!e) throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, "entitlements_missing", "Vault space cannot be worked out right now.");
  const pro = (e.pro ?? {}) as Record<string, { vaultGb?: unknown } | undefined>;
  const gb = (x: unknown) => (typeof x === "number" && x > 0 ? x : 0);
  const planLive = !!biz.plan && biz.plan !== "pack" && !!biz.renews && biz.renews.getTime() > now.getTime();
  const planGb = planLive && biz.plan ? gb(pro[biz.plan]?.vaultGb) : 0;
  const grants = await tx.purchaseGrant.findMany({
    where: { businessId: biz.id, kind: { in: ["wish-pack", "vault-space"] }, revokedAt: null, refusedReason: null, endsAt: { gt: now } },
    select: { kind: true, detail: true },
  });
  const grantGb = grants.reduce((n, g) => n + gb(((g.detail ?? {}) as Record<string, unknown>)[g.kind === "wish-pack" ? "vaultGb" : "gb"]), 0);
  return (planGb + grantGb) * GB;
}

/** A wish holds at most this many voice notes from friends (the price book's friend-message ceiling is 10; 12 is the content default), and the owner's own voice notes are counted apart: at most this many too. */
export const MAX_VOICE_NOTES_PER_WISH = 12;

@Injectable()
export class StoredFilesService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StoragePort,
    private readonly screening: ScreeningService,
    private readonly ids: IdGenerator,
    private readonly codes: CodeGenerator,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}


  /** The caller's business (owner), or 403. */
  private async businessOf(tx: Tx, p: UserPrincipal, named?: string): Promise<Business> {
    if (named !== undefined) {
      // IF7: the business the header names, and only its owner uploads its brand (a login of it is refused in words, a stranger gets 404)
      const { businessId } = await namedBusiness(tx, p.accountId, named, { ownerOnly: true, words: "Only the owner of the business can change its brand." });
      return tx.business.findUniqueOrThrow({ where: { id: businessId } });
    }
    if (!p.sides.includes("business")) throw AppError.forbidden("Vault files need a business.");
    const biz = await tx.business.findFirst({ where: { accountId: p.accountId } });
    if (!biz) throw AppError.forbidden("Vault files need a business.");
    return biz;
  }

  /**
   * IB6 (HU5): the business a Vault upload goes to: the caller's own, or one where they hold a live login (invited or active, as the business's
   * other pages count it). With `named` (the x-business-id header) it must be one of those. A removed login is refused with login_removed and
   * words; a person of no business, or of another business, with the plain 403.
   */
  private async vaultBusinessOf(tx: Tx, p: UserPrincipal, named: string | undefined): Promise<Business> {
    const access = await businessAccessOf(tx, p.accountId);
    const mine = [...access.owned, ...access.member];
    const want = named === undefined ? mine[0] : mine.find((id) => id === named.trim().toLowerCase());
    if (!want) throw await notInBusiness(tx, p.accountId, "Vault files need a business.");
    const biz = await tx.business.findUnique({ where: { id: want } });
    if (!biz) throw AppError.forbidden("Vault files need a business.");
    return biz;
  }

  /**
   * HU4: a wish holds at most MAX_VOICE_NOTES_PER_WISH voice notes from friends and, counted apart, as many of the owner's own (the owner's own
   * voice is never counted against what friends may send). Only one that has arrived (uploaded, screening or ready) counts, so an ask never
   * uploaded holds no place. The next one is 409 with words.
   */
  private async checkVoiceRoom(tx: Tx, wishId: string, friends: boolean, except?: string): Promise<void> {
    const [n] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM voice_note v JOIN stored_file f ON f.id = v.id
       WHERE v."wishId" = ${wishId}::uuid AND f.status IN ('uploaded', 'screening', 'ready') AND EXISTS (SELECT 1 FROM wish_gather_voice g WHERE g.id = v.id) = ${friends} AND (${except ?? null}::uuid IS NULL OR v.id <> ${except ?? null}::uuid)`;
    if ((n?.n ?? 0) >= MAX_VOICE_NOTES_PER_WISH) throw AppError.conflict("voice_notes_full", `A wish holds at most ${MAX_VOICE_NOTES_PER_WISH} voice notes from friends and ${MAX_VOICE_NOTES_PER_WISH} of the owner's own. Remove one to add another.`);
  }

  /** The subject wish, the caller's own and not yet sealed; a clip also needs a ticket that takes clips. */
  private async checkWish(tx: Tx, p: UserPrincipal, rule: PurposeRule, subjectId: string | undefined, gather = false): Promise<void> {
    if (subjectId === undefined) {
      if (rule.purpose === "video-clip") throw AppError.validation({ subjectId: "Say which wish the clip is for." });
      return;
    }
    if (!isUuid(subjectId)) throw AppError.validation({ subjectId: "Must be a wish id." });
    const wish = await tx.wish.findFirst({ where: { AND: [{ id: subjectId, accountId: p.accountId }, SHOWN_TO_BUYER] }, select: { status: true, ticket: true } });
    if (!wish) throw AppError.notFound("No such wish.");
    // HS1: a friend's voice through the gather link may arrive while the wish is a draft or sealed and not yet open
    if (wish.status !== "draft" && !(gather && wish.status === "sealed")) throw AppError.conflict("wish_sealed", "This wish is sealed; its files cannot change.");
    if (rule.purpose === "video-clip") {
      const e = await tx.entitlements.findFirst();
      const tickets = (e?.tickets ?? {}) as Record<string, { clips?: unknown } | undefined>;
      const clips = wish.ticket ? tickets[wish.ticket]?.clips : 0;
      if (!(typeof clips === "number" && clips > 0)) throw AppError.forbidden("This wish's ticket does not take clips.");
    }
  }

  /**
   * E-182: checks purpose, type, size and entitlement, then issues a signed PUT for one STAGING key (Y1), good for 15 minutes and
   * bound to the type and the exact length (X26). The file's own key is made here too but is never signed for a PUT.
   */
  async createTicket(p: UserPrincipal, body: PostUploadsBody, opts: { gather?: boolean; business?: string } = {}): Promise<UploadTicket> {
    const rule = purposeOf(body.purpose);
    if (!rule) throw AppError.validation({ purpose: "Must be one of photo, voice, clip, vault, studio, picture, poster, sound, model, profile or brand." });
    const contentType = normaliseType(body.contentType);
    if (!contentType || !rule.types.includes(contentType)) {
      throw AppError.validation({ contentType: contentType === "image/svg+xml" ? "An SVG is not taken as a picture." : `Not a type taken for ${rule.purpose}.` });
    }
    // X25: kind is the media kind (image, sound, model, video) and must agree with the type.
    if (body.kind !== undefined && body.kind !== mediaKindOf(contentType)) throw AppError.validation({ kind: "Does not match the type." });
    if (body.fileName !== undefined && body.fileName.length > 200) throw AppError.validation({ fileName: "At most 200 characters." });
    const bytes = body.bytes;
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) throw AppError.validation({ bytes: "Must be the file's size in bytes." });
    // HW6: the largest size is the price book's own (one source for this check and for what the book serves)
    const maxBytes = maxBytesFor(rule, await readLimits(this.db));
    if (bytes > maxBytes) throw AppError.validation({ bytes: `Too large: at most ${Math.floor((maxBytes * 10) / (1024 * 1024)) / 10} MB.` });
    if (body.seconds !== undefined && ((rule.purpose !== "voice-note" && rule.purpose !== "order-voice") || !(body.seconds > 0 && body.seconds <= MAX_VOICE_SECONDS))) {
      throw AppError.validation({ seconds: `A voice note is 1 to ${MAX_VOICE_SECONDS} seconds.` });
    }
    const studioFile = rule.purpose === "studio-asset" || rule.purpose === "studio-sound" || rule.purpose === "studio-model";
    if (studioFile && body.styleId !== undefined && !isUuid(body.styleId)) throw AppError.validation({ styleId: "Must be a style id." });

    const id = this.ids.id();
    // IF9: with the stand-in screening's rules on, the file's name rides in its key so the stand-in can hold or refuse it by name
    const nameTag = this.env.STANDIN_SCREENING !== undefined && typeof body.fileName === "string" && body.fileName.trim() ? `~${fileNameTag(body.fileName)}` : "";
    const objectKey = `${rule.purpose}/${id}/${this.codes.token(16)}${nameTag}`;
    const now = this.clock.now();
    const wishFile = rule.purpose === "wish-photo" || rule.purpose === "voice-note" || rule.purpose === "video-clip";
    const orderFile = rule.purpose === "order-photo" || rule.purpose === "order-voice";
    if (orderFile && (typeof body.subjectId !== "string" || !isUuid(body.subjectId))) throw AppError.validation({ subjectId: "Say which order the file is for." });
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, p.accountId);
      let businessId: string | null = null;
      let styleId: string | null = null;
      if (rule.purpose === "vault-file" || rule.purpose === "brand-logo") {
        const biz = rule.purpose === "vault-file" ? await this.vaultBusinessOf(tx, p, opts.business) : await this.businessOf(tx, p, opts.business);
        businessId = biz.id;
        if (rule.purpose === "vault-file") {
          const limit = await vaultLimitBytes(tx, biz, now);
          if (limit <= 0) throw AppError.forbidden("Your business has no Vault space.");
          if (Number(biz.vault ?? 0n) + bytes > limit) throw AppError.conflict("vault_full", "This file would go over your Vault space.");
        }
      } else if (orderFile) {
        // IC7: the buyer's own order, still open, under its own limits (the order's row is locked, so two tickets cannot both take the last place)
        await lockOwnOpenOrder(tx, p.accountId, body.subjectId as string);
        await checkOrderRoom(tx, body.subjectId as string, rule.purpose === "order-photo" ? "photo" : "voice");
      } else if (wishFile) {
        await this.checkWish(tx, p, rule, body.subjectId, opts.gather === true);
        if (rule.purpose === "voice-note" && body.subjectId !== undefined) await this.checkVoiceRoom(tx, body.subjectId, opts.gather === true);
      } else if (rule.purpose === "profile-picture") {
        // HW2: a creator's own profile picture: the account needs its creator profile
        if (!(await tx.creator.findUnique({ where: { accountId: p.accountId }, select: { id: true } }))) throw AppError.forbidden("Make your creator profile first.");
      } else if (studioFile && body.styleId !== undefined) {
        // HW2: the style is the caller's own Studio style (a draft or one sent in; the style and its draft share one id). Another creator's is 404.
        if (!(await tx.studioStyle.findFirst({ where: { id: body.styleId, accountId: p.accountId }, select: { id: true } }))) throw AppError.notFound("No style has this id.");
        styleId = body.styleId;
      }
      await tx.storedFile.create({
        data: {
          id,
          ownerAccountId: p.accountId,
          businessId,
          styleId,
          purpose: rule.db,
          objectKey,
          contentType,
          bytes: BigInt(bytes),
          status: "pending",
          variants: [],
          driver: this.env.STORAGE_DRIVER ?? "r2",
          fileId: id,
          kind: mediaKindOf(contentType),
          createdAt: now,
        },
      });
      await tx.uploadTicket.create({ data: { id, bytes: BigInt(bytes), contentType, purpose: rule.purpose, subjectId: wishFile || orderFile ? (body.subjectId ?? null) : null } });
      if (orderFile) await tx.$executeRaw`INSERT INTO concierge_order_file ("fileId", "orderId", kind, "createdAt") VALUES (${id}::uuid, ${body.subjectId}::uuid, ${rule.purpose === "order-photo" ? "photo" : "voice"}, ${now})`;
      if (rule.purpose === "voice-note" || rule.purpose === "order-voice") {
        await tx.voiceNote.create({
          data: { id, wishId: orderFile ? null : (body.subjectId ?? null), seconds: body.seconds === undefined ? null : Math.round(body.seconds), audio: { fileId: id }, sound: "voice" },
        });
      }
    });
    const signed = await this.storage.signUpload({ key: stagingKeyOf(objectKey), contentType, contentLength: bytes, expiresInSeconds: UPLOAD_TTL_SECONDS });
    return {
      id,
      purpose: orderFile ? rule.purpose : purposeOnWire(rule.db),
      upload: { url: signed.url, method: signed.method, headers: signed.headers, expiresAt: toWireInstant(signed.expiresAt) },
    };
  }

  private async removeRows(tx: Tx, id: string): Promise<void> {
    await tx.voiceNote.deleteMany({ where: { id } });
    await tx.uploadTicket.deleteMany({ where: { id } });
    await tx.storedFile.delete({ where: { id } });
  }

  /**
   * Y1: a signed PUT for a staging key stays good for 15 minutes, also after the file is confirmed, refused or deleted. One job per
   * key removes whatever lands there once every such PUT has expired (the upload-cleanup handler, FileJobs.cleanupUnconfirmed).
   */
  private async sweepStagingLater(tx: Tx, objectKey: string): Promise<void> {
    const at = new Date(this.clock.now().getTime() + STAGING_SWEEP_AFTER_SECONDS * 1000);
    const subjectId = stagingKeyOf(objectKey);
    await tx.job.upsert({
      where: { type_subjectId: { type: "upload_cleanup", subjectId } },
      create: { id: this.ids.id(), type: "upload_cleanup", subjectId, runAt: at, status: "scheduled", attempts: 0 },
      update: { runAt: at, status: "scheduled", attempts: 0 },
    });
  }

  private async lockOwn(tx: Tx, id: string, accountId: string): Promise<FileRow> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stored_file WHERE id = ${id}::uuid AND "ownerAccountId" = ${accountId}::uuid FOR UPDATE`;
    if (!rows.length) throw AppError.notFound("No such file.");
    return tx.storedFile.findUniqueOrThrow({ where: { id } });
  }

  /** A confirm in flight on another request: wait for it to finish, then answer what it made (Y4). */
  private async awaitOtherConfirm(p: UserPrincipal, id: string): Promise<StoredFile> {
    for (let polls = 0; ; polls++) {
      const row = await this.db.storedFile.findFirst({ where: { id, ownerAccountId: p.accountId } });
      if (!row) throw refused("The file was refused.");
      if (row.status === "ready" || row.status === "screening" || row.status === "rejected") return fileView(row);
      if (row.status === "pending") return this.confirm(p, id, id);
      if (row.status !== "uploaded") throw AppError.notFound("No such file.");
      if (polls * WAIT_POLL_MS > WAIT_FOR_OTHER_CONFIRM_MS) throw AppError.conflict("confirm_in_progress", "This file is still being checked. Try again in a moment.");
      await sleep(WAIT_POLL_MS);
    }
  }

  /** Refuses an upload: the rows go in one short transaction, the objects after it. */
  private async refuse(id: string, objectKey: string, error: AppError): Promise<never> {
    await this.db.$transaction(async (tx) => {
      await this.sweepStagingLater(tx, objectKey);
      await this.removeRows(tx, id).catch((e: unknown) => {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) throw e;
      });
    });
    await this.storage.delete(objectKey);
    await this.storage.delete(stagingKeyOf(objectKey));
    throw error;
  }

  /**
   * E-184 (Y1, Y3, Y4). The upload row is claimed by ONE conditional UPDATE (pending to uploaded), so one request does the work.
   * Storage is then worked outside any transaction: the staged object is copied to the file's own key (which no signed PUT ever
   * pointed at) and everything after reads that copy, so nothing sent later can change what was screened. The type comes from the
   * file's first bytes, the size is the real one. A short transaction finishes it. A file larger than asked, not what its type says,
   * or never uploaded is refused and removed. Confirming twice answers the same row.
   */
  async confirm(p: UserPrincipal, id: string, fileId: string): Promise<StoredFile> {
    if (!isUuid(id)) throw AppError.notFound("No such file.");
    if (fileId !== id) throw AppError.validation({ fileId: "Must be the id in the path." });
    const claimed = await this.db.storedFile.updateMany({ where: { id, ownerAccountId: p.accountId, status: "pending" }, data: { status: "uploaded" } });
    const row = await this.db.storedFile.findFirst({ where: { id, ownerAccountId: p.accountId } });
    if (!row || row.status === "deleted") throw AppError.notFound("No such file.");
    if (claimed.count === 0) {
      if (row.status === "uploaded") return this.awaitOtherConfirm(p, id);
      return fileView(row);
    }
    try {
      return await this.finishConfirm(p, row);
    } catch (e) {
      if (!(e instanceof AppError)) {
        // A storage or database failure: give the claim back so the person can confirm again; the cleanup job removes it if they do not.
        await this.db.storedFile.updateMany({ where: { id, status: "uploaded" }, data: { status: "pending" } });
      }
      throw e;
    }
  }

  private async finishConfirm(p: UserPrincipal, row: FileRow): Promise<StoredFile> {
    const { id, objectKey } = row;
    const staging = stagingKeyOf(objectKey);
    const asked = Number(row.bytes);
    const staged = await this.storage.head(staging);
    if (!staged) return this.refuse(id, objectKey, refused("The file was never uploaded."));
    if (staged.size <= 0) return this.refuse(id, objectKey, refused("The file is empty."));
    if (staged.size > asked) return this.refuse(id, objectKey, refused("The file is larger than asked."));
    await this.storage.copy(staging, objectKey);
    const obj = await this.storage.head(objectKey);
    if (!obj || obj.size <= 0) return this.refuse(id, objectKey, refused("The file was never uploaded."));
    if (obj.size > asked) return this.refuse(id, objectKey, refused("The file is larger than asked."));
    const head = (await this.storage.readStart(objectKey, 64)) ?? Buffer.alloc(0);
    const type = typeFromBytes(head, row.contentType);
    if (!type) {
      return this.refuse(id, objectKey, refused(looksLikeSvg(head) ? "An SVG is not taken as a picture." : "The file is not of the type asked."));
    }
    const screened = await this.screening.screen({ objectKey, contentType: type }, obj.size, head);

    type Done = { row: FileRow; removeKeys: string[]; error?: AppError };
    const done: Done = await this.db.$transaction(
      async (tx): Promise<Done> => {
        await lockAccount(tx, p.accountId);
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stored_file WHERE id = ${id}::uuid AND status = 'uploaded' FOR UPDATE`;
        if (!locked.length) return { row, removeKeys: [objectKey, staging], error: row.styleId ? AppError.notFound("No such file.") : refused("The file was removed.") };
        // HU4: the room is counted again as a voice arrives (the asks made while it was free are many; the arrivals are what fill it)
        const voice = await tx.voiceNote.findUnique({ where: { id }, select: { wishId: true } });
        if (voice?.wishId) {
          try {
            const [g] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM wish_gather_voice WHERE id = ${id}::uuid`;
            await this.checkVoiceRoom(tx, voice.wishId, (g?.n ?? 0) > 0, id);
          } catch (e) {
            if (!(e instanceof AppError)) throw e;
            await this.removeRows(tx, id);
            return { row, removeKeys: [objectKey, staging], error: e };
          }
        }
        await this.screening.record(tx, id, screened);
        await this.sweepStagingLater(tx, objectKey);
        const kind = mediaKindOf(type);
        if (screened.verdict === "reject") {
          const rejected = await tx.storedFile.update({ where: { id }, data: { status: "rejected", bytes: BigInt(obj.size), kind } });
          return { row: rejected, removeKeys: [objectKey, staging] };
        }
        if (row.businessId && row.purpose === "vault_file") {
          const biz = await tx.business.findUniqueOrThrow({ where: { id: row.businessId } });
          const limit = await vaultLimitBytes(tx, biz, this.clock.now());
          const counted = await tx.$queryRaw<{ id: string; vault: bigint }[]>`
            UPDATE business SET vault = COALESCE(vault, 0) + ${obj.size}, version = version + 1
            WHERE id = ${row.businessId}::uuid AND COALESCE(vault, 0) + ${obj.size} <= ${limit}
            RETURNING id, vault`;
          if (!counted.length) {
            await this.removeRows(tx, id);
            return { row, removeKeys: [objectKey, staging], error: AppError.conflict("vault_full", "This file would go over your Vault space.") };
          }
          // EA3: the month's peak is lifted here too, in one statement (extra space is billed by the most the month held).
          await tx.$executeRaw`
            INSERT INTO vault_peak ("businessId", month, bytes) VALUES (${row.businessId}::uuid, ${this.clock.now().toISOString().slice(0, 7)}, ${counted[0].vault})
            ON CONFLICT ("businessId", month) DO UPDATE SET bytes = GREATEST(vault_peak.bytes, EXCLUDED.bytes)`;
        }
        const ready = await tx.storedFile.update({
          where: { id },
          data: { status: screened.verdict === "pass" ? "ready" : "screening", bytes: BigInt(obj.size), kind },
        });
        // HW2: a confirmed profile picture is the creator's picture from now on (the one before it is no longer attached)
        if (row.purpose === "profile_picture" && row.ownerAccountId) await tx.creator.updateMany({ where: { accountId: row.ownerAccountId }, data: { img: id } });
        if (isImage(type)) {
          const at = this.clock.now();
          await tx.job.upsert({
            where: { type_subjectId: { type: "make_image_sizes", subjectId: id } },
            create: { id: this.ids.id(), type: "make_image_sizes", subjectId: id, runAt: at, status: "scheduled", attempts: 0 },
            update: { runAt: at, status: "scheduled", attempts: 0 },
          });
        }
        return { row: ready, removeKeys: [staging] };
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    for (const k of done.removeKeys) await this.storage.delete(k);
    if (done.error) throw done.error;
    return fileView(done.row);
  }

  /** E-183 (Y5, X23): removes the row, then the objects (and sizes). A file a wish or a card names (a real foreign key) is 409. */
  async remove(p: UserPrincipal, id: string, body: DeleteUploadsByIdBody, opts: { gather?: boolean } = {}): Promise<void> {
    if (!isUuid(id)) throw AppError.notFound("No such file.");
    if (body.fileId !== undefined && body.fileId !== id) throw AppError.validation({ fileId: "Must be the id in the path." });
    const row = await this.db.$transaction(
      async (tx) => {
        await lockAccount(tx, p.accountId);
        const r = await this.lockOwn(tx, id, p.accountId);
        // IC7: a file of an order that the maker already added to the wish being made stays until the order ends
        const [used] = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM concierge_order_file l
           WHERE l."fileId" = ${id}::uuid
             AND (EXISTS (SELECT 1 FROM wish_file w WHERE w."fileId" = l."fileId") OR EXISTS (SELECT 1 FROM voice_note v WHERE v.id = l."fileId" AND v."wishId" IS NOT NULL))`;
        if ((used?.n ?? 0) > 0) throw AppError.conflict("file_in_use", "The maker already added this file to your wish. It stays until the order is finished.");
        // Lock the wishes that name the file, so a seal cannot land between this check and the delete.
        const wishes = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT w.id, w.status::text AS status FROM wish w
          WHERE w.id IN (SELECT "wishId" FROM wish_file WHERE "fileId" = ${id}::uuid)
             OR w.id IN (SELECT "wishId" FROM voice_note WHERE id = ${id}::uuid AND "wishId" IS NOT NULL)
          FOR UPDATE`;
        if (wishes.some((w) => w.status !== "draft" && !(opts.gather && w.status === "sealed"))) throw AppError.conflict("file_in_use", "A sealed wish still uses this file.");
        await tx.$executeRaw`DELETE FROM wish_file WHERE "fileId" = ${id}::uuid`;
        if (r.purpose === "vault_file") await dropFileHearts(tx, id); // IC2: a removed file's heart goes with it
        if (r.businessId && r.purpose === "vault_file" && (r.status === "ready" || r.status === "screening")) {
          await tx.$executeRaw`UPDATE business SET vault = GREATEST(COALESCE(vault, 0) - ${r.bytes}, 0), version = version + 1 WHERE id = ${r.businessId}::uuid`;
        }
        try {
          await this.removeRows(tx, id);
        } catch (e) {
          if (isStillUsed(e)) throw AppError.conflict("file_in_use", "This file is still used.");
          throw e;
        }
        await this.sweepStagingLater(tx, r.objectKey);
        return r;
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    for (const k of [row.objectKey, stagingKeyOf(row.objectKey), ...variantsOf(row).map((v) => v.key)]) await this.storage.delete(k);
  }
}
