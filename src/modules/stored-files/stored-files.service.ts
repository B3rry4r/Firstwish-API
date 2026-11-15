import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma, type Business, type StoredFile as FileRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import type { UserPrincipal } from "../../common/auth/principal";
import { Clock } from "../../common/ports/clock.port";
import { CodeGenerator, IdGenerator } from "../../common/ports/ids.port";
import { StoragePort } from "../../common/ports/storage.port";
import { toWireInstant } from "../../common/time/time";
import type { DeleteUploadsByIdBody, PostUploadsBody, StoredFile, UploadTicket } from "../../contracts";
import {
  fileView,
  GB,
  isImage,
  isUuid,
  MAX_VOICE_SECONDS,
  normaliseType,
  purposeOf,
  PurposeRule,
  UPLOAD_TTL_SECONDS,
  variantsOf,
} from "./file-rules";
import { ScreeningService } from "./screening.service";

/**
 * The answer to E-182: the registry's UploadTicket plus the signed PUT itself (HALT reported: the registry types E-182's answer as
 * VoiceNote and UploadTicket has no url; this extends the contract type and re-declares none of it).
 */
export interface UploadTicketView extends UploadTicket {
  id: string;
  fileId: string;
  status: StoredFile["status"];
  upload: { url: string; method: "PUT"; headers: Record<string, string>; expiresAt: string };
}

type Tx = Prisma.TransactionClient;

const refused = (message: string) => new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "upload_refused", message, { fileId: message });

/** True for a database error raised by the stored-file link triggers (SQLSTATE 23503). */
function isStillUsed(e: unknown): boolean {
  const s = e instanceof Error ? e.message : String(e);
  return (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") || s.includes("23503") || s.includes("still used") || s.includes("Foreign key");
}

/** Vault space: the plan's GB plus every live pack's GB (entitlements.pro; DEC-96 price book). */
export async function vaultLimitBytes(tx: Tx, biz: Pick<Business, "plan" | "pack" | "packEnds">, now: Date): Promise<number> {
  const e = await tx.entitlements.findFirst();
  if (!e) throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, "entitlements_missing", "Vault space cannot be worked out right now.");
  const pro = (e.pro ?? {}) as Record<string, { vaultGb?: unknown } | undefined>;
  const gb = (x: unknown) => (typeof x === "number" && x > 0 ? x : 0);
  const planGb = biz.plan && biz.plan !== "pack" ? gb(pro[biz.plan]?.vaultGb) : 0;
  const packGb = biz.packEnds && biz.packEnds > now ? Math.max(0, biz.pack ?? 0) * gb(pro.pack?.vaultGb) : 0;
  return (planGb + packGb) * GB;
}

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
  private async businessOf(tx: Tx, p: UserPrincipal): Promise<Business> {
    if (!p.sides.includes("business")) throw AppError.forbidden("Vault files need a business.");
    const biz = await tx.business.findFirst({ where: { accountId: p.accountId } });
    if (!biz) throw AppError.forbidden("Vault files need a business.");
    return biz;
  }

  /** The subject wish, the caller's own and not yet sealed; a clip also needs a ticket that takes clips. */
  private async checkWish(tx: Tx, p: UserPrincipal, rule: PurposeRule, subjectId: string | undefined): Promise<void> {
    if (subjectId === undefined) {
      if (rule.purpose === "video-clip") throw AppError.validation({ subjectId: "Say which wish the clip is for." });
      return;
    }
    if (!isUuid(subjectId)) throw AppError.validation({ subjectId: "Must be a wish id." });
    const wish = await tx.wish.findFirst({ where: { id: subjectId, accountId: p.accountId }, select: { status: true, ticket: true } });
    if (!wish) throw AppError.notFound("No such wish.");
    if (wish.status !== "draft") throw AppError.conflict("wish_sealed", "This wish is sealed; its files cannot change.");
    if (rule.purpose === "video-clip") {
      const e = await tx.entitlements.findFirst();
      const tickets = (e?.tickets ?? {}) as Record<string, { clips?: unknown } | undefined>;
      const clips = wish.ticket ? tickets[wish.ticket]?.clips : 0;
      if (!(typeof clips === "number" && clips > 0)) throw AppError.forbidden("This wish's ticket does not take clips.");
    }
  }

  /** E-182: checks kind, type, size and entitlement, then issues a signed PUT for one server-made key, good for 15 minutes. */
  async createTicket(p: UserPrincipal, body: PostUploadsBody): Promise<UploadTicketView> {
    const rule = purposeOf(body.purpose);
    if (!rule) throw AppError.validation({ purpose: "Must be one of photo, voice, clip or vault." });
    const contentType = normaliseType(body.contentType);
    if (!contentType || !rule.types.includes(contentType)) throw AppError.validation({ contentType: `Not a type taken for ${rule.purpose}.` });
    if (body.kind !== undefined && rule.kinds.length && !rule.kinds.includes(body.kind)) {
      throw AppError.validation({ kind: "Does not match the purpose." });
    }
    const bytes = body.bytes;
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) throw AppError.validation({ bytes: "Must be the file's size in bytes." });
    if (bytes > rule.maxBytes) throw AppError.validation({ bytes: `Too large: at most ${rule.maxBytes / (1024 * 1024)} MB.` });
    if (body.seconds !== undefined && (rule.purpose !== "voice-note" || !(body.seconds > 0 && body.seconds <= MAX_VOICE_SECONDS))) {
      throw AppError.validation({ seconds: `A voice note is 1 to ${MAX_VOICE_SECONDS} seconds.` });
    }

    const id = this.ids.id();
    const objectKey = `${rule.purpose}/${id}/${this.codes.token(16)}`;
    const now = this.clock.now();
    await this.db.$transaction(async (tx) => {
      let businessId: string | null = null;
      if (rule.purpose === "vault-file") {
        const biz = await this.businessOf(tx, p);
        businessId = biz.id;
        const limit = await vaultLimitBytes(tx, biz, now);
        if (limit <= 0) throw AppError.forbidden("Your business has no Vault space.");
        if (Number(biz.vault ?? 0n) + bytes > limit) throw AppError.conflict("vault_full", "This file would go over your Vault space.");
      } else {
        await this.checkWish(tx, p, rule, body.subjectId);
      }
      await tx.storedFile.create({
        data: {
          id,
          ownerAccountId: p.accountId,
          businessId,
          purpose: rule.db,
          objectKey,
          contentType,
          bytes: BigInt(bytes),
          status: "pending",
          variants: [],
          driver: this.env.STORAGE_DRIVER ?? "r2",
          fileId: id,
          createdAt: now,
        },
      });
      await tx.uploadTicket.create({ data: { id, bytes: BigInt(bytes), contentType, purpose: rule.purpose, subjectId: body.subjectId ?? null } });
      if (rule.purpose === "voice-note") {
        await tx.voiceNote.create({
          data: { id, wishId: body.subjectId ?? null, seconds: body.seconds === undefined ? null : Math.round(body.seconds), audio: { fileId: id }, sound: "voice" },
        });
      }
    });
    const signed = await this.storage.signUpload({ key: objectKey, contentType, expiresInSeconds: UPLOAD_TTL_SECONDS });
    return {
      id,
      fileId: id,
      status: "pending",
      bytes,
      contentType,
      purpose: rule.purpose,
      subjectId: body.subjectId ?? "",
      upload: { url: signed.url, method: signed.method, headers: signed.headers, expiresAt: toWireInstant(signed.expiresAt) },
    };
  }

  private async removeRows(tx: Tx, id: string): Promise<void> {
    await tx.voiceNote.deleteMany({ where: { id } });
    await tx.uploadTicket.deleteMany({ where: { id } });
    await tx.storedFile.delete({ where: { id } });
  }

  private async lockOwn(tx: Tx, id: string, accountId: string): Promise<FileRow> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stored_file WHERE id = ${id}::uuid AND "ownerAccountId" = ${accountId}::uuid FOR UPDATE`;
    if (!rows.length) throw AppError.notFound("No such file.");
    return tx.storedFile.findUniqueOrThrow({ where: { id } });
  }

  /**
   * E-184: reads the object's real size and type from storage, screens it, and only then makes it usable. A file larger than
   * asked, of another type, or never uploaded is refused and removed. Confirming twice answers the same row.
   */
  async confirm(p: UserPrincipal, id: string, fileId: string): Promise<StoredFile> {
    if (!isUuid(id)) throw AppError.notFound("No such file.");
    if (fileId !== id) throw AppError.validation({ fileId: "Must be the id in the path." });
    type Outcome = { row: FileRow; removeKeys: string[]; error?: AppError };
    const out: Outcome = await this.db.$transaction(
      async (tx): Promise<Outcome> => {
        const row = await this.lockOwn(tx, id, p.accountId);
        if (row.status === "ready" || row.status === "screening" || row.status === "rejected") return { row, removeKeys: [] };
        if (row.status !== "pending") throw AppError.notFound("No such file.");
        const obj = await this.storage.head(row.objectKey);
        const type = normaliseType(obj?.contentType ?? null);
        let why: string | null = null;
        if (!obj) why = "The file was never uploaded.";
        else if (obj.size <= 0) why = "The file is empty.";
        else if (obj.size > Number(row.bytes)) why = "The file is larger than asked.";
        else if (type !== row.contentType) why = "The file is not of the type asked.";
        if (why || !obj) {
          await this.removeRows(tx, id);
          return { row, removeKeys: [row.objectKey], error: refused(why ?? "Refused.") };
        }
        const head = (await this.storage.readStart(row.objectKey, 64)) ?? Buffer.alloc(0);
        const { verdict } = await this.screening.screenFile(tx, row, obj.size, head);
        if (verdict === "reject") {
          const rejected = await tx.storedFile.update({ where: { id }, data: { status: "rejected", bytes: BigInt(obj.size) } });
          return { row: rejected, removeKeys: [row.objectKey] };
        }
        if (row.businessId && row.purpose === "vault_file") {
          const biz = await tx.business.findUniqueOrThrow({ where: { id: row.businessId } });
          const limit = await vaultLimitBytes(tx, biz, this.clock.now());
          const counted = await tx.$queryRaw<{ id: string }[]>`
            UPDATE business SET vault = COALESCE(vault, 0) + ${obj.size}, version = version + 1
            WHERE id = ${row.businessId}::uuid AND COALESCE(vault, 0) + ${obj.size} <= ${limit}
            RETURNING id`;
          if (!counted.length) {
            await this.removeRows(tx, id);
            return { row, removeKeys: [row.objectKey], error: AppError.conflict("vault_full", "This file would go over your Vault space.") };
          }
        }
        const done = await tx.storedFile.update({
          where: { id },
          data: { status: verdict === "pass" ? "ready" : "screening", bytes: BigInt(obj.size) },
        });
        if (isImage(row.contentType)) {
          await tx.job.create({ data: { id: this.ids.id(), type: "make_image_sizes", subjectId: id, runAt: this.clock.now(), status: "scheduled", attempts: 0 } });
        }
        return { row: done, removeKeys: [] };
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    for (const k of out.removeKeys) await this.storage.delete(k);
    if (out.error) throw out.error;
    return fileView(out.row);
  }

  /** True when a sealed, live or resting wish still uses this file (its photos, voices or content, or a voice note on it). */
  private async usedBySealedWish(tx: Tx, id: string): Promise<boolean> {
    const like = `%${id}%`;
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM wish w
      WHERE w.status::text IN ('sealed', 'live', 'resting')
        AND (COALESCE(w.photos::text, '') LIKE ${like} OR COALESCE(w.voices::text, '') LIKE ${like} OR COALESCE(w.content::text, '') LIKE ${like}
             OR EXISTS (SELECT 1 FROM voice_note v WHERE v.id = ${id}::uuid AND v."wishId" = w.id)
             OR EXISTS (SELECT 1 FROM upload_ticket t WHERE t.id = ${id}::uuid AND t."subjectId" = w.id::text))
      LIMIT 1`;
    return rows.length > 0;
  }

  /** E-183: removes the row and the object (and its sizes); a file still used by a sealed wish is 409. */
  async remove(p: UserPrincipal, id: string, body: DeleteUploadsByIdBody): Promise<StoredFile> {
    if (!isUuid(id)) throw AppError.notFound("No such file.");
    if (body.fileId !== undefined && body.fileId !== id) throw AppError.validation({ fileId: "Must be the id in the path." });
    const row = await this.db.$transaction(
      async (tx) => {
        const r = await this.lockOwn(tx, id, p.accountId);
        if (await this.usedBySealedWish(tx, id)) throw AppError.conflict("file_in_use", "A sealed wish still uses this file.");
        if (r.businessId && r.purpose === "vault_file" && (r.status === "ready" || r.status === "screening")) {
          await tx.$executeRaw`UPDATE business SET vault = GREATEST(COALESCE(vault, 0) - ${r.bytes}, 0), version = version + 1 WHERE id = ${r.businessId}::uuid`;
        }
        try {
          await this.removeRows(tx, id);
        } catch (e) {
          if (isStillUsed(e)) throw AppError.conflict("file_in_use", "This file is still used.");
          throw e;
        }
        for (const k of [r.objectKey, ...variantsOf(r).map((v) => v.key)]) await this.storage.delete(k);
        return r;
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    return { ...fileView(row), status: "deleted" };
  }
}
