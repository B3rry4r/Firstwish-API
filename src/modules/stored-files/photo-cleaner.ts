import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { CleanResult, ImageSizesPort } from "../../common/ports/image-sizes.port";
import { isImage } from "./file-rules";

/** The words a reader gets for a stored picture the server cannot open (a HEIC stored before round 23, a damaged file): never a broken picture. */
export const PHOTO_NOT_SHOWN = "This picture is in a kind we cannot open. Send it again as a JPEG or PNG.";
/** The code of that refusal: a 404 so the reads that leave out a file they cannot give leave this one out too. */
export const PHOTO_NOT_SHOWN_CODE = "photo_not_shown";
export const photoNotShown = () => new AppError(HttpStatus.NOT_FOUND, PHOTO_NOT_SHOWN_CODE, PHOTO_NOT_SHOWN);

/**
 * IM1: a photo a person gives us never carries their position to someone else. The bytes kept at a picture's own key are a CLEAN copy (made at
 * confirm, before screening: no EXIF, GPS, serial, XMP, IPTC or thumbnail), and cleanAt says so. The untouched original is not kept at all: the
 * clean copy REPLACES it at the same key, so it is the one that is hashed (sha256), counted (bytes, the Vault's space), kept for an approved
 * style (II4), sized and erased with the file. A file stored before round 23 (cleanAt null) is cleaned by a job, or the first time it is asked
 * for; until it is clean, no address is given for it.
 */
@Injectable()
export class PhotoCleaner {
  constructor(
    private readonly db: PrismaService,
    private readonly sizes: ImageSizesPort,
    private readonly clock: Clock,
  ) {}

  /** IM1: at confirm, the picture at `key` made clean in place (its own key). Rejects with plain words when it cannot be opened. */
  makeClean(key: string, contentType: string): Promise<CleanResult> {
    return this.sizes.clean({ sourceKey: key, targetKey: key, contentType });
  }

  /** A stored picture made clean in place and marked. Answers false when it cannot be opened (the row stays unmarked, so no one is given it). Safe to repeat. */
  async cleanStored(file: { id: string; objectKey: string; contentType: string; cleanAt: Date | null }): Promise<boolean> {
    if (file.cleanAt) return true;
    if (!isImage(file.contentType)) return false;
    try {
      const out = await this.sizes.clean({ sourceKey: file.objectKey, targetKey: file.objectKey, contentType: file.contentType });
      const kept = out.unchanged ? (out.sha256 ? { sha256: out.sha256 } : {}) : { bytes: BigInt(out.bytes), sha256: out.sha256 };
      await this.db.storedFile.updateMany({ where: { id: file.id, cleanAt: null }, data: { cleanAt: this.clock.now(), ...kept } });
      return true;
    } catch {
      return false;
    }
  }

  /** The job: cleans ready or held pictures that are not clean yet, reading at most `pages` pages of `batch` (a picture that cannot be opened stays unmarked and is passed over). Answers how many it made clean. */
  async sweep(batch = 50, pages = 20): Promise<number> {
    let made = 0;
    let after = "00000000-0000-0000-0000-000000000000";
    for (let i = 0; i < pages; i++) {
      const rows = await this.db.storedFile.findMany({ where: { id: { gt: after }, cleanAt: null, status: { in: ["ready", "screening"] }, contentType: { startsWith: "image/" } }, orderBy: { id: "asc" }, take: batch });
      if (!rows.length) break;
      after = rows[rows.length - 1].id;
      for (const r of rows) if (await this.cleanStored(r)) made++;
    }
    return made;
  }
}
