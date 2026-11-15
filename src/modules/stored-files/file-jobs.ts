import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { StoragePort } from "../../common/ports/storage.port";
import { IMAGE_WIDTHS, isImage, STAGING_PREFIX, stagingKeyOf, UNCONFIRMED_MAX_AGE_MS, Variant, variantsOf } from "./file-rules";
import { ImageSizesPort } from "../../common/ports/image-sizes.port";

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
    return { removed, swept };
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
