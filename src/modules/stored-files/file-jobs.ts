import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { StoragePort } from "../../common/ports/storage.port";
import { MAX_SOURCE_BYTES } from "../../common/ports/image-sizes.port";
import { IMAGE_WIDTHS, isImage, sizedKeyOf, STAGING_PREFIX, stagingKeyOf, UNCONFIRMED_MAX_AGE_MS, Variant, variantsOf } from "./file-rules";
import { IdGenerator } from "../../common/ports/ids.port";
import { playableFileIds } from "../styles/approved-document";
import { readLimits } from "../price-book/book-limits";
import { ImageSizesPort } from "../../common/ports/image-sizes.port";
import { PhotoCleaner } from "./photo-cleaner";

/** HW5: a confirmed upload that nothing names is removed once it is this old. */
export const UNATTACHED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The subject of an upload-cleanup job that removes every stored file of one account (X10). */
export const ERASE_FILES_PREFIX = "erase-files:";

/**
 * HC1: true when a reveal that plays right now names the file (fileIds). Playing is the public read's own rule: the link is on, its end
 * has not come, and an erased owner's reveal plays only while its term has not ended (the client wish's end, else its wish's, else the link's).
 */
export async function playingRevealNames(db: Pick<PrismaService, "$queryRaw">, fileId: string, now: Date): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM reveal_access a
      JOIN business b ON b.id = a."businessId"
      LEFT JOIN account o ON o.id = b."accountId"
      LEFT JOIN client_wish w ON w.id = a."wishId"
      LEFT JOIN wish ww ON ww.id = w."wishId"
     WHERE a."fileIds" @> to_jsonb(${fileId}::text) AND a."offAt" IS NULL
       AND (a."endsAt" IS NULL OR a."endsAt" > ${now})
       AND (o."erasedAt" IS NULL OR COALESCE(w."endsAt", ww."endsAt", a."endsAt") > ${now})
     LIMIT 1`;
  return rows.length > 0;
}

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
    private readonly cleaner: PhotoCleaner,
  ) {}

  /**
   * Part 1 of the cleanup alone (INT-3: the jobs frame runs one job per staging key and per erased account, so the recurring job
   * only needs this): uploads never confirmed within 24 hours, objects first, then rows. Answers how many files it removed.
   */
  async sweepUnconfirmed(batch = 100): Promise<number> {
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

    return removed;
  }

  /**
   * HW5: a confirmed upload attached to nothing is removed after 7 days (from its confirm). Attached means a wish names it (a wish file or
   * a voice note of a wish), a style that still exists holds it (Studio files), a creator's profile shows it, a business's brand or one of its shoots
   * names it, or a reveal that is on names it. A Vault file is held by its business's Vault, and a render, a card and an export by their
   * owners: they are not swept here. A file attached when the sweep looks is never touched; each row is checked again in the claim.
   */
  async sweepUnattached(batch = 100): Promise<number> {
    const before = new Date(this.clock.now().getTime() - UNATTACHED_MAX_AGE_MS);
    const old = await this.db.$queryRaw<{ id: string }[]>`
      SELECT f.id::text AS id FROM stored_file f
       WHERE f.status IN ('ready', 'screening') AND f.purpose IN ('wish-photo', 'voice-note', 'video-clip', 'studio-asset', 'brand-logo', 'profile-picture')
         AND f."updatedAt" < ${before}
         AND (f."styleId" IS NULL OR NOT EXISTS (SELECT 1 FROM studio_style y WHERE y.id = f."styleId"))
         AND NOT EXISTS (SELECT 1 FROM wish_file w WHERE w."fileId" = f.id)
         AND NOT EXISTS (SELECT 1 FROM voice_note v WHERE v.id = f.id AND v."wishId" IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM concierge_order_file o WHERE o."fileId" = f.id)
         AND NOT EXISTS (SELECT 1 FROM creator c WHERE c.img = f.id::text)
         AND NOT EXISTS (SELECT 1 FROM business b WHERE b.brand::text LIKE '%' || f.id::text || '%')
         AND NOT EXISTS (SELECT 1 FROM shoot s WHERE s.files::text LIKE '%' || f.id::text || '%')
         AND NOT EXISTS (SELECT 1 FROM reveal_access a WHERE a."fileIds" @> to_jsonb(f.id::text))
       ORDER BY f.id LIMIT ${batch}`;
    let removed = 0;
    for (const { id } of old) {
      // claimed one row at a time: the row is re-read under the same conditions, so a file attached since is left alone
      const gone = await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; objectKey: string; variants: Prisma.JsonValue }[]>`
          SELECT f.id::text AS id, f."objectKey", f.variants FROM stored_file f
           WHERE f.id = ${id}::uuid AND f.status IN ('ready', 'screening') AND f."updatedAt" < ${before}
             AND (f."styleId" IS NULL OR NOT EXISTS (SELECT 1 FROM studio_style y WHERE y.id = f."styleId"))
             AND NOT EXISTS (SELECT 1 FROM wish_file w WHERE w."fileId" = f.id)
             AND NOT EXISTS (SELECT 1 FROM voice_note v WHERE v.id = f.id AND v."wishId" IS NOT NULL)
             AND NOT EXISTS (SELECT 1 FROM concierge_order_file o WHERE o."fileId" = f.id)
             AND NOT EXISTS (SELECT 1 FROM creator c WHERE c.img = f.id::text)
             AND NOT EXISTS (SELECT 1 FROM business b WHERE b.brand::text LIKE '%' || f.id::text || '%')
             AND NOT EXISTS (SELECT 1 FROM shoot s WHERE s.files::text LIKE '%' || f.id::text || '%')
             AND NOT EXISTS (SELECT 1 FROM reveal_access a WHERE a."fileIds" @> to_jsonb(f.id::text))
           FOR UPDATE SKIP LOCKED`;
        return rows[0] ?? null;
      });
      if (!gone) continue;
      await this.dropFile(gone);
      removed++;
    }
    return removed;
  }

  /**
   * II4: a Studio file kept for an approved version (keptAt) is removed for good once no approved version that can still be played names it
   * (the newest approved version, or one a live wish was made under). A file one of those names is never touched. Answers how many it removed.
   */
  async sweepKeptStyleFiles(batch = 100): Promise<number> {
    const kept = await this.db.storedFile.findMany({ where: { keptAt: { not: null }, styleId: { not: null }, status: "ready" }, orderBy: { id: "asc" }, take: batch });
    const playable = new Map<string, Set<string>>();
    let removed = 0;
    for (const f of kept) {
      const sid = f.styleId as string;
      if (!playable.has(sid)) playable.set(sid, await playableFileIds(this.db, sid));
      if (playable.get(sid)?.has(f.id.toLowerCase())) continue;
      await this.dropFile(f);
      removed++;
    }
    return removed;
  }

  /**
   * IE3 (IC7): the files given with a Concierge order that was never paid (placed or quoted) are removed, rows and stored objects, once the order has not
   * changed for the price book's conciergeFilesDays (30, PROVISIONAL, the owner may change it). The order itself stays. Each order is locked and its
   * conditions read again, so an order paid at that moment is left alone; the objects go after the commit. Answers how many files it removed.
   */
  async sweepUnpaidOrderFiles(batch = 100): Promise<number> {
    const now = this.clock.now();
    const before = new Date(now.getTime() - (await readLimits(this.db)).conciergeFilesDays * 86_400_000);
    const orders = await this.db.$queryRaw<{ id: string }[]>`
      SELECT o.id::text AS id FROM concierge_order o
       WHERE o.status IN ('brief', 'quoted') AND o."updatedAt" < ${before}
         AND EXISTS (SELECT 1 FROM concierge_order_file x WHERE x."orderId" = o.id)
       ORDER BY o.id LIMIT ${batch}`;
    let removed = 0;
    for (const { id } of orders) {
      const files = await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id::text AS id FROM concierge_order WHERE id = ${id}::uuid AND status IN ('brief', 'quoted') AND "updatedAt" < ${before} FOR UPDATE SKIP LOCKED`;
        if (!locked.length) return [];
        const rows = await tx.$queryRaw<{ id: string; objectKey: string; variants: Prisma.JsonValue }[]>`
          SELECT f.id::text AS id, f."objectKey", f.variants FROM concierge_order_file x JOIN stored_file f ON f.id = x."fileId" WHERE x."orderId" = ${id}::uuid`;
        await tx.$executeRaw`DELETE FROM concierge_order_file WHERE "orderId" = ${id}::uuid`;
        for (const r of rows) await tx.$executeRaw`UPDATE stored_file SET status = 'deleted', "updatedAt" = ${now} WHERE id = ${r.id}::uuid`;
        return rows;
      });
      for (const f of files) {
        await this.dropFile(f);
        removed++;
      }
    }
    return removed;
  }

  /**
   * HX3: a Studio draft is being deleted. In the caller's transaction every file the style holds (one still waiting for its upload or its
   * confirm too) is marked deleted, so nobody reads it and no confirm can finish it; the objects and rows go after the commit
   * (dropRetired), and a row a failed removal leaves behind is taken by the unconfirmed sweep. Answers the ids it marked.
   */
  async retireStyleFiles(tx: Prisma.TransactionClient, styleId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE stored_file SET status = 'deleted', "updatedAt" = ${this.clock.now()} WHERE "styleId" = ${styleId}::uuid RETURNING id::text AS id`;
    return rows.map((r) => r.id);
  }

  /** HX3: removes the objects, then the rows, of files retireStyleFiles marked. Safe to run twice. Answers how many files it removed. */
  async dropRetired(ids: string[]): Promise<number> {
    let removed = 0;
    for (const id of ids) {
      const f = await this.db.storedFile.findFirst({ where: { id, status: "deleted" } });
      if (!f) continue;
      await this.dropFile(f);
      removed++;
    }
    return removed;
  }

  /** One staging key's job (Y1): removes whatever a signed PUT left there. Safe to run twice (deleting nothing is fine). */
  async sweepStagingKey(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  /**
   * The upload-cleanup handler. It removes (1) uploads never confirmed within 24 hours, and an upload a failed confirm left claimed:
   * the objects first, then the rows; (2) the strays a signed PUT left on a staging key after its file was confirmed, refused or
   * deleted (Y1): one scheduled upload-cleanup job per key, due once every signed PUT for it has expired. Each row is claimed by
   * one conditional UPDATE, so two runs at once remove each thing once. Storage is never called inside a transaction (Y4).
   */
  async cleanupUnconfirmed(batch = 100): Promise<{ removed: number; swept: number }> {
    const now = this.clock.now();
    let removed = await this.sweepUnconfirmed(batch);
    removed += await this.sweepUnattached(batch);
    removed += await this.sweepUnpaidOrderFiles(batch);
    // IM1: pictures stored before round 23 are made clean here (the first read cleans one too); not counted as removed
    await this.cleaner.sweep(batch);
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
    await this.scheduleCleanup(`${ERASE_FILES_PREFIX}${accountId}`, this.clock.now(), tx);
  }

  /** One upload-cleanup row per subject (CC4: a unique index on type and subject): a second call moves the same row, never a second row. */
  async scheduleCleanup(subjectId: string, runAt: Date, tx: Prisma.TransactionClient | PrismaService = this.db): Promise<void> {
    await tx.job.upsert({
      where: { type_subjectId: { type: "upload_cleanup", subjectId } },
      create: { id: this.ids.id(), type: "upload_cleanup", subjectId, runAt, status: "scheduled", attempts: 0 },
      update: { runAt, status: "scheduled", attempts: 0 },
    });
  }

  /** The handler for one erase-files job: objects first (idempotent), then each file's rows. Answers how many files it removed. */
  async eraseFilesOf(accountId: string, batch = 100): Promise<number> {
    const businessIds = (await this.db.business.findMany({ where: { accountId }, select: { id: true } })).map((b) => b.id);
    const owned: Prisma.StoredFileWhereInput = { OR: [{ ownerAccountId: accountId }, ...(businessIds.length ? [{ businessId: { in: businessIds } }] : [])] };
    let removed = 0;
    let after = "00000000-0000-0000-0000-000000000000";
    for (;;) {
      const files = await this.db.storedFile.findMany({ where: { AND: [owned, { id: { gt: after } }] }, take: batch, orderBy: { id: "asc" } });
      if (!files.length) return removed;
      after = files[files.length - 1].id;
      for (const f of files) {
        // RR3: a file a client wish still in its term names stays; the wish's own erase removes it when the term ends.
        if ((await this.db.wishFile.count({ where: { fileId: f.id, wish: { erasedAt: null } } })) > 0) continue;
        // HC1: a file a reveal that still plays shows stays; the reveal's own term end removes it (removeRevealFiles).
        if (await playingRevealNames(this.db, f.id, this.clock.now())) continue;
        await this.dropFile(f);
        removed++;
      }
    }
  }

  /** The objects first (safe to repeat), then every row that names the file and the file's own row. */
  private async dropFile(f: { id: string; objectKey: string; variants: Prisma.JsonValue }): Promise<void> {
    // every sized key the rules can name (all IMAGE_WIDTHS), not only those the row lists: a sizing job may have written one it has not saved yet
    const keys = [f.objectKey, stagingKeyOf(f.objectKey), ...new Set([...variantsOf(f as Parameters<typeof variantsOf>[0]).map((v) => v.key), ...IMAGE_WIDTHS.map((w) => sizedKeyOf(f.objectKey, w))])];
    for (const key of keys) await this.storage.delete(key);
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
    // a sizing job that wrote a copy after the first pass and before the row went finds the row on its own re-check, or this pass removes the copy
    for (const key of keys) await this.storage.delete(key);
  }

  /**
   * HC1: the term of an erased owner's reveal has ended: the Vault files it named go, unless another reveal still plays them or a
   * client wish still in its term names them. Only files of an erased owner are touched. Safe to repeat. Answers how many were removed.
   */
  async removeRevealFiles(clientWishId: string): Promise<number> {
    const now = this.clock.now();
    const rows = await this.db.$queryRaw<{ linkId: string; fileIds: unknown }[]>`
      SELECT a."linkId"::text AS "linkId", a."fileIds" FROM reveal_access a
        JOIN business b ON b.id = a."businessId" JOIN account o ON o.id = b."accountId"
       WHERE a."wishId" = ${clientWishId}::uuid AND o."erasedAt" IS NOT NULL`;
    let removed = 0;
    for (const r of rows) {
      const ids = Array.isArray(r.fileIds) ? r.fileIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];
      for (const id of ids) {
        if (await playingRevealNames(this.db, id, now)) continue;
        if ((await this.db.wishFile.count({ where: { fileId: id, wish: { erasedAt: null } } })) > 0) continue;
        const f = await this.db.storedFile.findUnique({ where: { id } });
        if (!f) continue;
        await this.dropFile(f);
        removed++;
      }
      await this.db.$executeRaw`UPDATE reveal_access SET "fileIds" = '[]'::jsonb WHERE "linkId" = ${r.linkId}::uuid AND "fileIds" <> '[]'::jsonb`;
    }
    return removed;
  }

  /** Makes widths 320, 768 and 1600 of a confirmed image, each under its own key, through the image-sizes port. */
  async makeImageSizes(fileId: string): Promise<{ made: number }> {
    const file = await this.db.storedFile.findFirst({ where: { id: fileId, status: { in: ["ready", "screening"] } } });
    if (!file || !isImage(file.contentType)) return { made: 0 };
    const have = new Set(variantsOf(file).map((v) => v.width));
    const variants: Variant[] = variantsOf(file);
    const written: string[] = [];
    // The file may be erased while this runs: what was written is then removed (the erase removes every key the rules name, too).
    const gone = async (): Promise<boolean> => {
      if (await this.db.storedFile.findUnique({ where: { id: file.id }, select: { id: true } })) return false;
      for (const k of written) await this.storage.delete(k);
      return true;
    };
    let source: Buffer | undefined; // read once for all the widths
    for (const width of IMAGE_WIDTHS) {
      if (have.has(width)) continue;
      const key = sizedKeyOf(file.objectKey, width);
      source ??= (await this.storage.readObject(file.objectKey, MAX_SOURCE_BYTES)) ?? undefined;
      if (!source) throw new Error("The picture to size is not in storage.");
      written.push(key);
      await this.sizes.resize({ sourceKey: file.objectKey, targetKey: key, width, contentType: file.contentType, source });
      if (await gone()) return { made: 0 };
      variants.push({ width, key });
    }
    const saved = await this.db.storedFile.updateMany({ where: { id: file.id }, data: { variants: variants.map((v) => ({ width: v.width, key: v.key })) } });
    if (saved.count === 0 && (await gone())) return { made: 0 };
    return { made: variants.length - have.size };
  }
}
