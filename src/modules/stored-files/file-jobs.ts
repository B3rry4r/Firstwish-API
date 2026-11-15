import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { StoragePort } from "../../common/ports/storage.port";
import { IMAGE_WIDTHS, isImage, UNCONFIRMED_MAX_AGE_MS, Variant, variantsOf } from "./file-rules";
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

  /** Removes uploads never confirmed within 24 hours: the object, then the rows, one file per transaction. */
  async cleanupUnconfirmed(batch = 100): Promise<{ removed: number }> {
    const before = new Date(this.clock.now().getTime() - UNCONFIRMED_MAX_AGE_MS);
    const old = await this.db.storedFile.findMany({ where: { status: "pending", createdAt: { lt: before } }, select: { id: true }, take: batch, orderBy: { id: "asc" } });
    let removed = 0;
    for (const { id } of old) {
      const gone = await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ objectKey: string }[]>`
          SELECT "objectKey" FROM stored_file WHERE id = ${id}::uuid AND status = 'pending' AND "createdAt" < ${before} FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return false;
        await this.storage.delete(rows[0].objectKey);
        await tx.voiceNote.deleteMany({ where: { id } });
        await tx.uploadTicket.deleteMany({ where: { id } });
        await tx.storedFile.delete({ where: { id } });
        return true;
      });
      if (gone) removed++;
    }
    return { removed };
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
