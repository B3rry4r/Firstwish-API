import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import type { IdGenerator } from "../../common/ports/ids.port";
import { ticketFileLimits } from "../price-book/entitlements.service";
import { ERASE_WISH_FILE_PREFIX } from "../wishes/wish-lifecycle.service";

type Tx = Prisma.TransactionClient;

/**
 * IC7, IE1: the buyer's files for a Concierge order. The limit is what one Signature wish holds (the price book's photos and voices for Signature) times the
 * order's count of wishes: never a number of its own, so nothing a buyer may give is impossible to use. They count against nothing else: not the buyer's
 * Vault, not the photo and voice limits of the buyer's own wishes.
 */
export async function orderFileLimits(db: Pick<Tx, "entitlements" | "conciergeOrder">, orderId: string): Promise<{ photos: number; voices: number }> {
  const [book, order] = await Promise.all([db.entitlements.findFirst({ orderBy: { id: "desc" } }), db.conciergeOrder.findUnique({ where: { id: orderId }, select: { count: true } })]);
  if (!book) throw new AppError(503, "price_book_missing", "The price book is not set up yet.");
  const one = ticketFileLimits(book, "signature");
  const n = Math.max(1, order?.count ?? 1);
  return { photos: one.photos * n, voices: one.voices * n };
}

export type OrderFileKind = "photo" | "voice";

/** The statuses of an order that still takes files: from its placing until it is delivered or cancelled. */
export const ORDER_TAKES_FILES = ["brief", "quoted", "paid", "given", "making"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The buyer's own order, locked, when it still takes files. Another buyer's order and an id that is no order are 404 (never told apart); an order
 * that was delivered or cancelled is 409 order_ended.
 */
export async function lockOwnOpenOrder(tx: Tx, accountId: string, orderId: string): Promise<void> {
  if (!UUID.test(orderId)) throw AppError.notFound("No such order.");
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM concierge_order WHERE id = ${orderId}::uuid AND "accountId" = ${accountId}::uuid FOR UPDATE`;
  if (!rows[0]) throw AppError.notFound("No such order.");
  if (!(ORDER_TAKES_FILES as readonly string[]).includes(rows[0].status)) throw AppError.conflict("order_ended", "This order is finished, so it takes no more files.");
}

/** The next file of this kind would go over the order's limit: 409 with words. The order's row is locked by the caller, so two tickets at once cannot both take the last place. */
export async function checkOrderRoom(tx: Tx, orderId: string, kind: OrderFileKind): Promise<void> {
  const [n] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM concierge_order_file o JOIN stored_file f ON f.id = o."fileId"
     WHERE o."orderId" = ${orderId}::uuid AND o.kind = ${kind} AND f.status NOT IN ('rejected', 'deleted')`;
  const lim = await orderFileLimits(tx, orderId);
  const max = kind === "photo" ? lim.photos : lim.voices;
  if ((n?.n ?? 0) >= max) {
    throw AppError.conflict("order_files_full", kind === "photo" ? `An order takes at most ${max} photos. Remove one to add another.` : `An order takes at most ${max} voice notes. Remove one to add another.`);
  }
}

/** The order's file rows, oldest first, with the file's own facts and whether the wish being made for the order uses it. */
export interface OrderFileRow {
  id: string;
  kind: OrderFileKind;
  contentType: string;
  bytes: number;
  seconds: number | null;
  status: string;
  inWish: boolean;
  createdAt: Date;
  wishId: string | null;
}

export async function orderFileRows(tx: Pick<Tx, "$queryRaw">, orderId: string, opts: { forStaff?: boolean } = {}): Promise<OrderFileRow[]> {
  // IE3/F4: from the moment the buyer's account is erased, the order's files are no one's to read (the erase job removes them after): the maker's list is empty
  const live = opts.forStaff ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM concierge_order c JOIN account a ON a.id = c."accountId" WHERE c.id = o."orderId" AND a."erasedAt" IS NOT NULL)` : Prisma.empty;
  const rows = await tx.$queryRaw<{ id: string; kind: string; contentType: string; bytes: bigint; seconds: number | null; status: string; createdAt: Date; wishId: string | null }[]>`
    SELECT o."fileId"::text AS id, o.kind, f."contentType", f.bytes, v.seconds, f.status::text AS status, o."createdAt",
           COALESCE((SELECT w."wishId"::text FROM wish_file w JOIN wish x ON x.id = w."wishId" WHERE w."fileId" = o."fileId" AND x."conciergeOrderId" = o."orderId" LIMIT 1),
                    (SELECT v2."wishId"::text FROM voice_note v2 WHERE v2.id = o."fileId" AND v2."wishId" IS NOT NULL LIMIT 1)) AS "wishId"
      FROM concierge_order_file o
      JOIN stored_file f ON f.id = o."fileId"
      LEFT JOIN voice_note v ON v.id = o."fileId"
     WHERE o."orderId" = ${orderId}::uuid AND f.status <> 'deleted' ${live}
     ORDER BY o."createdAt", o."fileId"`;
  return rows.map((r) => ({ id: r.id, kind: r.kind === "voice" ? "voice" : "photo", contentType: r.contentType, bytes: Number(r.bytes), seconds: r.seconds, status: r.status, inWish: r.wishId !== null, createdAt: r.createdAt, wishId: r.wishId }));
}

/**
 * The order's files go, in the caller's transaction: the link rows are removed and each file is marked deleted (nobody reads it from then on, no confirm can
 * finish it), then one upload-cleanup job per file removes its objects and rows (the job that clears an erased wish's files; storage is never called inside a
 * transaction). With `keepUsed` the files the wish made for the order uses stay with that wish (delivery); without it every file goes (cancel, refund).
 * Answers how many files it released. Safe to repeat.
 */
export async function releaseOrderFiles(tx: Tx, ids: IdGenerator, orderId: string, now: Date, opts: { keepUsed: boolean }): Promise<number> {
  const rows = await orderFileRows(tx, orderId);
  const keep = opts.keepUsed ? rows.filter((r) => r.inWish) : [];
  const gone = rows.filter((r) => !keep.includes(r));
  // the link rows of kept files go too: from now on they are the wish's files, not the order's
  await tx.$executeRaw`DELETE FROM concierge_order_file WHERE "orderId" = ${orderId}::uuid`;
  const stray = await tx.$queryRaw<{ id: string }[]>`
    SELECT f.id::text AS id FROM stored_file f WHERE f.id = ANY(${gone.map((g) => g.id)}::uuid[])`;
  for (const { id } of stray) {
    await tx.$executeRaw`UPDATE stored_file SET status = 'deleted', "updatedAt" = ${now} WHERE id = ${id}::uuid`;
    // the wish being made names it no more (a delivered wish keeps only what it used; a cancelled one is erased)
    await tx.wishFile.deleteMany({ where: { fileId: id } });
    const subjectId = `${ERASE_WISH_FILE_PREFIX}${id}`;
    await tx.job.upsert({
      where: { type_subjectId: { type: "upload_cleanup", subjectId } },
      create: { id: ids.id(), type: "upload_cleanup", subjectId, runAt: now, status: "scheduled", attempts: 0 },
      update: { runAt: now, status: "scheduled", attempts: 0 },
    });
  }
  return gone.length;
}
