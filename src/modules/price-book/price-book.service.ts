import { Injectable } from "@nestjs/common";
import { Prisma, type Promotion as PromotionRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";

export type Db = PrismaService | Prisma.TransactionClient;

/** One line of a published version, with the promotion that covers it in that version (or none). */
export interface BookLine {
  id: string;
  sku: string;
  name: string;
  listKobo: bigint;
  promoKobo: bigint | null;
  discountable: boolean;
  vatIncluded: boolean;
  version: number;
  promotion: PromotionRow | null;
}

export interface BookVersion {
  id: string;
  version: number;
  effectiveFrom: Date;
  lines: BookLine[];
}

/** A published version's own record of which promotion covers each line, kept in price_book_version.prices. */
export interface SnapshotEntry {
  sku: string;
  promotionId: string | null;
}

export interface QuoteInput {
  sku: string;
  /** How many of this line; a whole number from 1 to 1000. Default 1. */
  qty?: number;
}

export interface QuoteLine {
  sku: string;
  name: string;
  qty: number;
  /** The list price of one. */
  listKobo: number;
  /** The price charged for one at the quote's moment. */
  unitKobo: number;
  /** unitKobo times qty. */
  totalKobo: number;
  discounted: boolean;
}

export interface Quote {
  /** The price-book version the quote used; a payment keeps it. */
  version: number;
  versionId: string;
  at: Date;
  lines: QuoteLine[];
  /** The sum of the lines' totals, to the kobo. */
  totalKobo: number;
  listTotalKobo: number;
}

const BOOK_LOCK = 4_004_001;

/**
 * The only source of every price. Reads the version in force at a moment (the server's clock decides, never the caller's),
 * says what a line costs then, and prices a basket for every other bundle: `quote(lines, at)`.
 */
@Injectable()
export class PriceBookService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  now(): Date {
    return this.clock.now();
  }

  /** Holds the price book for this transaction: every writer takes it, so two changes run one after the other. */
  async lock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOK_LOCK})`;
  }

  /** The published version in force at `at` (the highest published version whose effectiveFrom has come). */
  async versionAt(at: Date, db: Db = this.db): Promise<BookVersion> {
    const rows = await db.$queryRaw<{ version: number }[]>`
      SELECT v.version FROM price_book_version v
      WHERE v."effectiveFrom" <= ${at} AND EXISTS (SELECT 1 FROM price p WHERE p.version = v.version)
      ORDER BY v.version DESC LIMIT 1`;
    if (!rows.length) throw new AppError(503, "price_book_missing", "The price book is not set up yet.");
    return this.load(rows[0].version, db);
  }

  /** The newest published version, whatever its effectiveFrom (the base every change starts from). */
  async latestPublished(db: Db = this.db): Promise<BookVersion> {
    const rows = await db.$queryRaw<{ version: number }[]>`
      SELECT v.version FROM price_book_version v
      WHERE EXISTS (SELECT 1 FROM price p WHERE p.version = v.version)
      ORDER BY v.version DESC LIMIT 1`;
    if (!rows.length) throw new AppError(503, "price_book_missing", "The price book is not set up yet.");
    return this.load(rows[0].version, db);
  }

  /** A published version by its number; 404 when there is none. */
  async load(version: number, db: Db = this.db): Promise<BookVersion> {
    const v = await db.priceBookVersion.findUnique({ where: { version } });
    if (!v) throw AppError.notFound("No such price-book version.");
    const prices = await db.price.findMany({ where: { version }, orderBy: { sku: "asc" } });
    if (!prices.length) throw AppError.notFound("That price-book version is not published.");
    const promotions = await db.promotion.findMany({ orderBy: { id: "asc" } });
    const byId = new Map(promotions.map((p) => [p.id, p]));
    const snapshot = new Map(snapshotOf(v.prices).map((e) => [e.sku, e.promotionId]));
    const lines = prices.map((p): BookLine => {
      let promotion: PromotionRow | null;
      if (snapshot.has(p.sku)) {
        const id = snapshot.get(p.sku);
        promotion = id ? (byId.get(id) ?? null) : null;
      } else {
        // A version written before snapshots (the seed): the first promotion that names the line.
        promotion = promotions.find((x) => x.appliesTo.includes(p.sku)) ?? null;
      }
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        listKobo: p.listKobo,
        promoKobo: p.promoKobo,
        discountable: p.discountable,
        vatIncluded: p.vatIncluded,
        version: p.version,
        promotion,
      };
    });
    return { id: v.id, version: v.version, effectiveFrom: v.effectiveFrom, lines };
  }

  /** Whether the line's promotion is on at `at`: the line is discountable, has a promoted price, is named by the promotion and the end has not come. */
  static promoOn(line: BookLine, at: Date): boolean {
    const p = line.promotion;
    return line.discountable && line.promoKobo !== null && p !== null && p.appliesTo.includes(line.sku) && at.getTime() < p.endsAt.getTime();
  }

  /** What one of the line costs at `at`. */
  static chargedAt(line: BookLine, at: Date): bigint {
    return PriceBookService.promoOn(line, at) ? (line.promoKobo as bigint) : line.listKobo;
  }

  /** The promotion running at `at` in this version (the one covering its discountable lines), or null once it has ended. */
  static promotionAt(book: BookVersion, at: Date): PromotionRow | null {
    const line = book.lines.find((l) => PriceBookService.promoOn(l, at));
    return line?.promotion ?? null;
  }

  /**
   * Prices a basket: kobo per line and the total, from the version in force at `at` (or the version named, for a payment
   * checked again later). The price never comes from the caller. An unknown line or a bad quantity is 422.
   */
  async quote(lines: QuoteInput[], at: Date, opts: { version?: number; db?: Db } = {}): Promise<Quote> {
    const db = opts.db ?? this.db;
    if (!Array.isArray(lines) || lines.length === 0) throw AppError.validation({ lines: "Name at least one line." });
    const book = opts.version === undefined ? await this.versionAt(at, db) : await this.load(opts.version, db);
    const bySku = new Map(book.lines.map((l) => [l.sku, l]));
    const fields: Record<string, string> = {};
    lines.forEach((l, i) => {
      if (typeof l?.sku !== "string" || !bySku.has(l.sku)) fields[`lines[${i}].sku`] = "Not a line in the price book.";
      const q = l?.qty ?? 1;
      if (!Number.isSafeInteger(q) || q < 1 || q > 1000) fields[`lines[${i}].qty`] = "Must be a whole number from 1 to 1000.";
    });
    if (Object.keys(fields).length) throw AppError.validation(fields);
    let total = 0n;
    let listTotal = 0n;
    const out = lines.map((l): QuoteLine => {
      const line = bySku.get(l.sku) as BookLine;
      const qty = BigInt(l.qty ?? 1);
      const unit = PriceBookService.chargedAt(line, at);
      const lineTotal = unit * qty;
      total += lineTotal;
      listTotal += line.listKobo * qty;
      return {
        sku: line.sku,
        name: line.name,
        qty: Number(qty),
        listKobo: safe(line.listKobo),
        unitKobo: safe(unit),
        totalKobo: safe(lineTotal),
        discounted: unit !== line.listKobo,
      };
    });
    return { version: book.version, versionId: book.id, at, lines: out, totalKobo: safe(total), listTotalKobo: safe(listTotal) };
  }
}

/** Reads a version's snapshot entries; anything else stored there (a draft's proposed lines, the seed's null) gives none. */
export function snapshotOf(json: Prisma.JsonValue | null): SnapshotEntry[] {
  if (!Array.isArray(json)) return [];
  const out: SnapshotEntry[] = [];
  for (const e of json) {
    if (e && typeof e === "object" && !Array.isArray(e) && typeof e.sku === "string" && "promotionId" in e) {
      const id = e.promotionId;
      out.push({ sku: e.sku, promotionId: typeof id === "string" ? id : null });
    }
  }
  return out;
}

export function safe(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("amount past the safe integer range");
  return Number(v);
}
