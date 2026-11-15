import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { StoragePort } from "../../common/ports/storage.port";
import { IMAGE_WIDTHS, isImage, STAGING_PREFIX, stagingKeyOf, UNCONFIRMED_MAX_AGE_MS, Variant, variantsOf } from "./file-rules";
import { IdGenerator } from "../../common/ports/ids.port";
import { ImageSizesPort } from "../../common/ports/image-sizes.port";

/** The subject of an upload-cleanup job that removes every stored file of one account (X10). */
export const ERASE_FILES_PREFIX = "erase-files:";

/**
 * The file jobs, exported for the jobs frame (B06, not merged when this was built): it runs them from the queue with a recorded run.
 *   "upload-cleanup"   -> cleanupUnconfirmed()   on a schedule
 *   "make-image-sizes" -> makeImageSizes(id)     one per confirmed image (confirm writes the job row)
 */
@Injectable()
export class FileJobs {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StoragePort,
    private readonly sizes: ImageSizesPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * The upload-cleanup handler. It removes (1) uploads never confirmed within 24 hours, and an upload a failed confirm left claimed:
   * the objects first, then the rows; (2) the strays a signed PUT left on a staging key after its file was confirmed, refused or
   * deleted (Y1): one scheduled upload-cleanup job per key, due once every signed PUT for it has expired. Each row is claimed by
   * one conditional UPDATE, so two runs at once remove each thing once. Storage is never called inside a transaction (Y4).
   */
  async cleanupUnconfirmed(batch = 100): Promise<{ removed: number; swept: number }> {
    const now = this.clock.now();
    const before = new Date(now.getTime() - UNCONFIRMED_MAX_AGE_MS);
    const old = await this.db.storedFile.findMany({
      where: { status: { in: ["pending", "uploaded", "deleted"] }, createdAt: { lt: before } },
      select: { id: true },
      take: batch,
      orderBy: { id: "asc" },
    });
    let removed = 0;
    for (const { id } of old) {
      const claimed = await this.db.$queryRaw<{ objectKey: string }[]>`
        UPDATE stored_file SET status = 'deleted', "updatedAt" = ${now}
        WHERE id = ${id}::uuid AND status IN ('pending', 'uploaded', 'deleted') AND "createdAt" < ${before}
        RETURNING "objectKey"`;
      if (!claimed.length) continue;
      await this.storage.delete(claimed[0].objectKey);
      await this.storage.delete(stagingKeyOf(claimed[0].objectKey));
      const gone = await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stored_file WHERE id = ${id}::uuid AND status = 'deleted' FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return false;
        await tx.voiceNote.deleteMany({ where: { id } });
        await tx.uploadTicket.deleteMany({ where: { id } });
        await tx.storedFile.delete({ where: { id } });
        return true;
      });
      if (gone) removed++;
    }

    let swept = 0;
    const due = await this.db.job.findMany({
      where: { type: "upload_cleanup", status: "scheduled", runAt: { lte: now }, subjectId: { startsWith: STAGING_PREFIX } },
      select: { id: true, subjectId: true },
      take: batch,
      orderBy: { id: "asc" },
    });
    for (const j of due) {
      const taken = await this.db.job.updateMany({ where: { id: j.id, status: "scheduled" }, data: { status: "running", attempts: { increment: 1 } } });
      if (taken.count === 0) continue;
      try {
        await this.storage.delete(j.subjectId);
        await this.db.job.update({ where: { id: j.id }, data: { status: "succeeded" } });
        swept++;
      } catch (e) {
        await this.db.job.update({ where: { id: j.id }, data: { status: "scheduled" } });
        throw e;
      }
    }

    const erasing = await this.db.job.findMany({
      where: { type: "upload_cleanup", status: "scheduled", runAt: { lte: now }, subjectId: { startsWith: ERASE_FILES_PREFIX } },
      select: { id: true, subjectId: true },
      take: batch,
      orderBy: { id: "asc" },
    });
    for (const j of erasing) {
      const taken = await this.db.job.updateMany({ where: { id: j.id, status: "scheduled" }, data: { status: "running", attempts: { increment: 1 } } });
      if (taken.count === 0) continue;
      try {
        removed += await this.eraseFilesOf(j.subjectId.slice(ERASE_FILES_PREFIX.length), batch);
        await this.db.job.update({ where: { id: j.id }, data: { status: "succeeded" } });
      } catch (e) {
        await this.db.job.update({ where: { id: j.id }, data: { status: "scheduled" } });
        throw e;
      }
    }
    return { removed, swept };
  }

  /**
   * X10: schedules the removal of every stored file the account owns (its sizes and objects too). It writes one job row, due now,
   * in the caller's transaction (the erase service passes its own, so the row exists exactly when the erase commits); the
   * upload-cleanup handler does the storage calls after that, never inside a transaction (Y4). Safe to call twice.
   */
  async removeAccountFiles(accountId: string, tx: Prisma.TransactionClient = this.db): Promise<void> {
    await tx.job.create({
      data: { id: this.ids.id(), type: "upload_cleanup", subjectId: `${ERASE_FILES_PREFIX}${accountId}`, runAt: this.clock.now(), status: "scheduled", attempts: 0 },
    });
  }

  /** The handler for one erase-files job: objects first (idempotent), then each file's rows. Answers how many files it removed. */
  private async eraseFilesOf(accountId: string, batch: number): Promise<number> {
    const businessIds = (await this.db.business.findMany({ where: { accountId }, select: { id: true } })).map((b) => b.id);
    const owned: Prisma.StoredFileWhereInput = { OR: [{ ownerAccountId: accountId }, ...(businessIds.length ? [{ businessId: { in: businessIds } }] : [])] };
    let removed = 0;
    for (;;) {
      const files = await this.db.storedFile.findMany({ where: owned, take: batch, orderBy: { id: "asc" } });
      if (!files.length) return removed;
      for (const f of files) {
        for (const key of [f.objectKey, stagingKeyOf(f.objectKey), ...variantsOf(f).map((v) => v.key)]) await this.storage.delete(key);
        await this.db.$transaction(async (tx) => {
          const id = f.id;
          await tx.aiRequest.updateMany({ where: { inputFileId: id }, data: { inputFileId: null } });
          await tx.aiRequest.updateMany({ where: { voiceFileId: id }, data: { voiceFileId: null } });
          await tx.conciergeOrder.updateMany({ where: { namesFileId: id }, data: { namesFileId: null } });
          await tx.conciergeOrder.updateMany({ where: { reportFileId: id }, data: { reportFileId: null } });
          await tx.qrCard.updateMany({ where: { fileId: id }, data: { fileId: null } });
          await tx.renderJob.updateMany({ where: { outputFileId: id }, data: { outputFileId: null } });
          await tx.wishFile.deleteMany({ where: { fileId: id } });
          await tx.voiceNote.deleteMany({ where: { id } });
          await tx.uploadTicket.deleteMany({ where: { id } });
          await tx.storedFile.deleteMany({ where: { id } });
        });
        removed++;
      }
    }
  }

  /** Makes widths 320, 768 and 1600 of a confirmed image, each under its own key, through the image-sizes port. */
  async makeImageSizes(fileId: string): Promise<{ made: number }> {
    const file = await this.db.storedFile.findFirst({ where: { id: fileId, status: { in: ["ready", "screening"] } } });
    if (!file || !isImage(file.contentType)) return { made: 0 };
    const have = new Set(variantsOf(file).map((v) => v.width));
    const variants: Variant[] = variantsOf(file);
    for (const width of IMAGE_WIDTHS) {
      if (have.has(width)) continue;
      const key = `${file.objectKey}.w${width}`;
      await this.sizes.resize({ sourceKey: file.objectKey, targetKey: key, width, contentType: file.contentType });
      variants.push({ width, key });
    }
    await this.db.storedFile.update({ where: { id: file.id }, data: { variants: variants.map((v) => ({ width: v.width, key: v.key })) } });
    return { made: variants.length - have.size };
  }
}
