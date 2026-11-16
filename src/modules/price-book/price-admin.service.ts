import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { IdGenerator } from "../../common/ports/ids.port";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { JobsService } from "../jobs/jobs.service";
import { DEFAULT_RUN_DAY, dayWords, isRunDay, MONTHLY_RUN_KEY, nextRunDay } from "../payouts/run-day";
import { parseInstant } from "../../common/time/time";
import type {
  GetAdminPricesQuery,
  GetAdminPricesResponse,
  PostAdminPriceBookVersionsBody,
  PostAdminPriceBookVersionsByIdPublishBody,
  Price,
  PriceBookVersion,
  PutAdminPricesByKeyBody,
} from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { EntitlementsService, grantOf } from "./entitlements.service";
import { promotionLabel } from "./price-math";
import { BookLine, BookVersion, PriceBookService, safe } from "./price-book.service";
import { DEFAULT_LIMITS, LIMIT_LINES, type LimitLine, limitLineOf, readLimits } from "./book-limits";
import { limitLineView, PAYOUT_KEY, payoutLineOf, priceOf, PROMOTION_KEY, promotionLineOf, versionOf } from "./price-view";

const SECTION = "/admin/prices";
/** The payout threshold's status once the owner has set or confirmed it. */
const CONFIRMED = "CONFIRMED";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The payout threshold setting as the book holds it (R14). */
export interface PayoutThreshold {
  valueKobo: number;
  status: string;
  schedule: string;
  /** R14: the day of the month the payout run starts (1 to 28). */
  day: number;
}

interface DraftLine {
  sku: string;
  listKobo?: number;
  promoKobo?: number;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Staff changes to the book. Every change takes the book's lock, makes a NEW version from the newest published one and
 * writes one audit row in the same transaction; published versions are never changed (a payment keeps the version it was
 * priced at). Two changes at once run one after the other; a version number taken twice is a 409, never a mixed version.
 */
@Injectable()
export class PriceAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly book: PriceBookService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly ids: IdGenerator,
    private readonly jobs: JobsService,
  ) {}

  /* ---------------- the payout threshold (a setting line of the book) ---------------- */

  async payoutThreshold(db: PrismaService | Prisma.TransactionClient = this.db): Promise<PayoutThreshold> {
    const row = await this.thresholdRow(db, false);
    return row.threshold;
  }

  private async thresholdRow(db: PrismaService | Prisma.TransactionClient, forUpdate: boolean) {
    const rows = forUpdate
      ? await db.$queryRaw<{ id: string; choice: Prisma.JsonValue }[]>`
          SELECT id, choice FROM settings WHERE key = to_jsonb(${PAYOUT_KEY}::text) ORDER BY id LIMIT 1 FOR UPDATE`
      : await db.$queryRaw<{ id: string; choice: Prisma.JsonValue }[]>`
          SELECT id, choice FROM settings WHERE key = to_jsonb(${PAYOUT_KEY}::text) ORDER BY id LIMIT 1`;
    if (!rows.length) throw new AppError(503, "price_book_missing", "The payout threshold is not set up yet.");
    const c = (rows[0].choice ?? {}) as Prisma.JsonObject;
    return {
      id: rows[0].id,
      choice: c,
      threshold: {
        valueKobo: typeof c.value === "number" ? c.value : 0,
        status: typeof c.status === "string" ? c.status : "PROVISIONAL",
        schedule: typeof c.schedule === "string" ? c.schedule : "",
        day: isRunDay(c.day) ? c.day : DEFAULT_RUN_DAY,
      },
    };
  }

  /* ---------------- E-123 ---------------- */

  async list(q: GetAdminPricesQuery): Promise<GetAdminPricesResponse> {
    const at = this.book.now();
    const book = await this.book.versionAt(at);
    const previous = book.version > 1 ? await this.book.load(book.version - 1).catch(() => null) : null;
    const ent = await this.entitlements.row();
    const reasons = await this.lastReasons();
    const deliveryHours = (await readLimits(this.db)).conciergeDeliveryHours;
    const items: Price[] = book.lines.map((l) => {
      const before = previous?.lines.find((p) => p.sku === l.sku);
      const changed = !!before && (before.listKobo !== l.listKobo || before.promoKobo !== l.promoKobo);
      return priceOf(l, { at, book, grant: grantOf(ent, l.sku), changed, reason: reasons.get(l.sku) ?? "", deliveryHours });
    });
    const promo = PriceBookService.promotionAt(book, at) ?? book.lines.find((l) => l.promotion)?.promotion ?? null;
    if (promo) items.push(promotionLineOf(promo, book, reasons.get(PROMOTION_KEY) ?? "", reasons.has(PROMOTION_KEY)));
    const t = await this.payoutThreshold();
    items.push(payoutLineOf(t.valueKobo, t.status, t.schedule, book, reasons.get(PAYOUT_KEY) ?? "", reasons.has(PAYOUT_KEY), t.day));
    const limits = await readLimits(this.db);
    for (const def of LIMIT_LINES) items.push(limitLineView(def, limits[def.field], book, reasons.get(def.key) ?? "", reasons.has(def.key)));
    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = q.cursor ? String(decodeCursor(q.cursor).key) : null;
    const rest = after === null ? items : items.filter((i) => i.key > after);
    return toPage(rest.slice(0, limit + 1), limit, (i) => ({ key: i.key, id: i.key }));
  }

  /** The reason of the newest audit row for each line key. */
  private async lastReasons(): Promise<Map<string, string>> {
    const rows = await this.db.auditEntry.findMany({
      where: { section: SECTION, subjectType: "price" },
      orderBy: { id: "desc" },
      select: { subjectId: true, reason: true },
      take: 500,
    });
    const out = new Map<string, string>();
    for (const r of rows) if (!out.has(r.subjectId)) out.set(r.subjectId, r.reason ?? "");
    return out;
  }

  /* ---------------- E-124 ---------------- */

  async change(key: string, body: PutAdminPricesByKeyBody, actor: AuditActor, ownerCaller = false): Promise<Price> {
    const reason = requireReason(body.reason);
    if (body.sku !== key) throw AppError.validation({ sku: "Must be the line named in the path." });
    if (key === PAYOUT_KEY) return this.changeThreshold(body, reason, actor, ownerCaller);
    const limit = limitLineOf(key);
    if (limit) return this.changeLimit(limit, body, reason, actor);
    if (body.value !== undefined) throw AppError.validation({ value: "Only a limit line takes value." });
    const endsAt = body.promotionEndsAt === undefined ? undefined : parseInstant(body.promotionEndsAt);
    if (endsAt === null) throw AppError.validation({ promotionEndsAt: "Must be an ISO-8601 time." });
    if (key === PROMOTION_KEY && (body.priceKobo !== undefined || body.listKobo !== undefined)) {
      throw AppError.validation({ priceKobo: "The offer's end takes promotionEndsAt only." });
    }
    for (const f of ["priceKobo", "listKobo"] as const) {
      const v = body[f];
      if (v !== undefined && (!Number.isSafeInteger(v) || v <= 0)) throw AppError.validation({ [f]: "Must be a whole number of kobo above 0." });
    }
    try {
      return await this.db.$transaction(async (tx) => {
        await this.book.lock(tx);
        const now = this.book.now();
        const base = await this.book.latestPublished(tx);
        const lines = base.lines.map((l) => ({ ...l }));
        const changed: string[] = [];
        let target: BookLine | undefined;
        if (key !== PROMOTION_KEY) {
          target = lines.find((l) => l.sku === key);
          if (!target) throw AppError.notFound("No such line in the price book.");
        }
        if (endsAt !== undefined) {
          if (await this.moveEnd(tx, lines, endsAt, now)) changed.push("promotionEndsAt");
        }
        if (target) {
          const before = { list: target.listKobo, promo: target.promoKobo };
          if (body.listKobo !== undefined) target.listKobo = BigInt(body.listKobo);
          if (body.priceKobo !== undefined) {
            // The price now: the promoted price while the offer runs on this line, else the list price (Z4: only what is named).
            if (PriceBookService.promoOn(target, now)) {
              target.promoKobo = BigInt(body.priceKobo);
            } else target.listKobo = BigInt(body.priceKobo);
          }
          if (PriceBookService.promoOn(target, now) && (target.promoKobo as bigint) > target.listKobo) {
            throw AppError.validation({ [body.priceKobo !== undefined ? "priceKobo" : "listKobo"]: "The price now cannot be above the list price." });
          }
          if (target.listKobo !== before.list) changed.push("listKobo");
          if (target.promoKobo !== before.promo) changed.push("priceKobo");
        }
        // Z3: a change that changes nothing makes no version and no audit row.
        if (!changed.length) throw AppError.conflict("not_allowed", "That is the price now.");
        const v = await this.publishLines(tx, lines, now, actor, `Price change: ${key}`, now);
        await this.audit.write(tx, {
          actor,
          section: SECTION,
          action: "price.change",
          target: { type: "price", id: key },
          reason,
          changedFields: changed,
        });
        if (key === PROMOTION_KEY) {
          const p = lines.find((l) => l.promotion)?.promotion;
          return promotionLineOf(p!, v, reason, true);
        }
        const line = v.lines.find((l) => l.sku === key) as BookLine;
        return priceOf(line, { at: now, book: v, grant: grantOf(await this.entitlements.row(tx), key), changed: true, reason, deliveryHours: (await readLimits(tx)).conciergeDeliveryHours });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict("price_book_busy", "Another price change landed first. Load the prices again.");
      throw e;
    }
  }

  /**
   * Moves the promotion's end: a new promotion row (old versions keep theirs), only sooner (X17, T-26). Answers false when
   * the end named is the end it already has (nothing to change).
   */
  private async moveEnd(tx: Prisma.TransactionClient, lines: BookLine[], endsAt: Date, now: Date): Promise<boolean> {
    const current = lines.find((l) => l.promotion)?.promotion;
    if (!current) throw AppError.validation({ promotionEndsAt: "There is no offer to change." });
    if (endsAt.getTime() <= now.getTime()) throw AppError.validation({ promotionEndsAt: "Must be in the future." });
    if (endsAt.getTime() > current.endsAt.getTime()) throw AppError.validation({ promotionEndsAt: "The offer is never extended; it can only end sooner." });
    if (endsAt.getTime() === current.endsAt.getTime()) return false;
    const next = await tx.promotion.create({
      data: { id: this.ids.id(), label: promotionLabel(current.percentOff, endsAt), percentOff: current.percentOff, endsAt, appliesTo: current.appliesTo },
    });
    for (const l of lines) if (l.promotion?.id === current.id) l.promotion = next;
    return true;
  }

  /** Writes a new published version holding these lines; its number is one past every version (drafts included). */
  private async publishLines(
    tx: Prisma.TransactionClient,
    lines: BookLine[],
    effectiveFrom: Date,
    actor: AuditActor,
    note: string,
    now: Date,
  ): Promise<BookVersion> {
    const max = await tx.priceBookVersion.aggregate({ _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    await tx.priceBookVersion.create({
      data: { id: this.ids.id(), version, effectiveFrom, createdBy: actor.id ?? "system", note, createdAt: now, prices: snapshotJson(lines) },
    });
    await this.writeLines(tx, lines, version);
    return this.book.load(version, tx);
  }

  private async writeLines(tx: Prisma.TransactionClient, lines: BookLine[], version: number): Promise<void> {
    await tx.price.createMany({
      data: lines.map((l) => ({
        id: this.ids.id(),
        sku: l.sku,
        name: l.name,
        listKobo: l.listKobo,
        promoKobo: l.promoKobo,
        discountable: l.discountable,
        vatIncluded: l.vatIncluded,
        version,
      })),
    });
  }

  private async changeThreshold(body: PutAdminPricesByKeyBody, reason: string, actor: AuditActor, ownerCaller: boolean): Promise<Price> {
    if (body.listKobo !== undefined || body.promotionEndsAt !== undefined || (body.priceKobo === undefined && body.payoutDay === undefined)) {
      throw AppError.validation({ priceKobo: "The payout threshold takes priceKobo and payoutDay only." });
    }
    if (body.priceKobo !== undefined && (!Number.isSafeInteger(body.priceKobo) || body.priceKobo <= 0)) throw AppError.validation({ priceKobo: "Must be a whole number of kobo above 0." });
    if (body.payoutDay !== undefined && !isRunDay(body.payoutDay)) throw AppError.validation({ payoutDay: "Must be a whole day of the month from 1 to 28." });
    return this.db.$transaction(async (tx) => {
      const row = await this.thresholdRow(tx, true);
      // R14, X19: the PROVISIONAL mark stays until the owner confirms the figure; a change by the owner role clears it,
      // a change by finance does not.
      const status = ownerCaller ? CONFIRMED : row.threshold.status;
      const value = body.priceKobo ?? row.threshold.valueKobo;
      const day = body.payoutDay ?? row.threshold.day;
      if (value === row.threshold.valueKobo && day === row.threshold.day && status === row.threshold.status) {
        throw AppError.conflict("not_allowed", "That is the price now.");
      }
      const schedule = day === row.threshold.day ? row.threshold.schedule : dayWords(day);
      const choice = { ...row.choice, value, day, schedule, status };
      await tx.settings.update({ where: { id: row.id }, data: { choice } });
      // the monthly run's job moves to the new day (when the system has put one on the table)
      if (day !== row.threshold.day) {
        const job = await tx.job.findUnique({ where: { type_subjectId: { type: "payout_run", subjectId: MONTHLY_RUN_KEY } } });
        if (job && job.status === "scheduled") await this.jobs.schedule("payout-run", nextRunDay(this.book.now(), day), MONTHLY_RUN_KEY, tx);
      }
      await this.audit.write(tx, {
        actor,
        section: SECTION,
        action: "price.change",
        target: { type: "price", id: PAYOUT_KEY },
        reason,
        changedFields: [...(body.priceKobo !== undefined ? ["priceKobo"] : []), ...(body.payoutDay !== undefined ? ["payoutDay"] : [])],
      });
      const book = await this.book.versionAt(this.book.now(), tx);
      return payoutLineOf(value, status, schedule, book, reason, true, day);
    });
  }

  /**
   * HX1: a limit the book serves (a file size, the Concierge delivery hours, the unopened days) is changed here by the roles that change
   * prices. It writes the lifecycle row the read serves and the code acts on, a new book version and one audit row, in one transaction.
   */
  private async changeLimit(def: LimitLine, body: PutAdminPricesByKeyBody, reason: string, actor: AuditActor): Promise<Price> {
    const v = body.value;
    if (body.listKobo !== undefined || body.priceKobo !== undefined || body.promotionEndsAt !== undefined || body.payoutDay !== undefined || v === undefined) {
      throw AppError.validation({ value: `${def.key} takes value only.` });
    }
    if (!Number.isSafeInteger(v) || v < def.min || v > def.max) throw AppError.validation({ value: `Must be a whole number of ${def.unit} from ${def.min} to ${def.max}.` });
    try {
      return await this.db.$transaction(async (tx) => {
        await this.book.lock(tx);
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM lifecycle_config ORDER BY id DESC LIMIT 1 FOR UPDATE`;
        const before = (await readLimits(tx))[def.field];
        if (before === v) throw AppError.conflict("not_allowed", "That is the value now.");
        if (rows.length) await tx.lifecycleConfig.update({ where: { id: rows[0].id }, data: { [def.field]: v } });
        else await tx.lifecycleConfig.create({ data: { id: this.ids.id(), ...DEFAULT_LIMITS, [def.field]: v } });
        const now = this.book.now();
        const base = await this.book.latestPublished(tx);
        const published = await this.publishLines(tx, base.lines.map((l) => ({ ...l })), now, actor, `Limit change: ${def.key}`, now);
        await this.audit.write(tx, { actor, section: SECTION, action: "price.change", target: { type: "price", id: def.key }, reason, changedFields: ["value"], values: { key: def.key, old: before, new: v } });
        return limitLineView(def, v, published, reason, true);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict("price_book_busy", "Another price change landed first. Load the prices again.");
      throw e;
    }
  }

  /* ---------------- the book's versions (who, when) ---------------- */

  /** The price book's versions, newest first, each with who made it and when; a draft says so in its name. Owner, ops and finance read it. */
  async versions(q: { cursor?: string; limit?: number }): Promise<Page<PriceBookVersion>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = q.cursor ? Number(decodeCursor(q.cursor).key) : null;
    const rows = await this.db.priceBookVersion.findMany({ where: after === null || !Number.isFinite(after) ? {} : { version: { lt: after } }, orderBy: { version: "desc" }, take: limit + 1 });
    const live = new Set((await this.db.price.findMany({ where: { version: { in: rows.map((r) => r.version) } }, select: { version: true }, distinct: ["version"] })).map((p) => p.version));
    const asked = await this.db.auditEntry.findMany({ where: { section: SECTION, subjectType: "price-book-version", subjectId: { in: rows.map((r) => r.id) } }, orderBy: { id: "asc" }, select: { subjectId: true, reason: true } });
    const reasonOf = new Map<string, string>();
    for (const a of asked) if (!reasonOf.has(a.subjectId)) reasonOf.set(a.subjectId, a.reason ?? "");
    return toPage(rows.map((r) => versionOf(r, live.has(r.version), reasonOf.get(r.id) ?? "")), limit, (v) => ({ key: v.version, id: v.key }));
  }

  /* ---------------- E-126 ---------------- */

  async draft(body: PostAdminPriceBookVersionsBody, actor: AuditActor): Promise<PriceBookVersion> {
    const reason = requireReason(body.reason);
    const effectiveFrom = parseInstant(body.effectiveFrom);
    if (!effectiveFrom) throw AppError.validation({ effectiveFrom: "Must be an ISO-8601 time." });
    // Z1: a change takes effect when it is published; a draft dated ahead would silently hold back every later change.
    if (effectiveFrom.getTime() > this.book.now().getTime()) throw AppError.validation({ effectiveFrom: "Cannot be in the future. A change takes effect when it is published." });
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 500) throw AppError.validation({ note: "Must be 500 characters or fewer." });
    try {
      return await this.db.$transaction(async (tx) => {
        await this.book.lock(tx);
        const base = await this.book.latestPublished(tx);
        const lines = draftLines(body.prices, base);
        const max = await tx.priceBookVersion.aggregate({ _max: { version: true } });
        const row = await tx.priceBookVersion.create({
          data: {
            id: this.ids.id(),
            version: (max._max.version ?? 0) + 1,
            effectiveFrom,
            createdBy: actor.id ?? "system",
            note,
            createdAt: this.book.now(),
            prices: lines as unknown as Prisma.InputJsonValue,
          },
        });
        await this.audit.write(tx, {
          actor,
          section: SECTION,
          action: "price-book.draft",
          target: { type: "price-book-version", id: row.id },
          reason,
          changedFields: ["prices", "effectiveFrom", "note"],
        });
        return versionOf(row, false, reason);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict("price_book_busy", "Another price change landed first. Try again.");
      throw e;
    }
  }

  /* ---------------- E-127 ---------------- */

  async publish(id: string, body: PostAdminPriceBookVersionsByIdPublishBody, actor: AuditActor): Promise<PriceBookVersion> {
    const reason = requireReason(body.reason);
    if (!UUID.test(id)) throw AppError.notFound("No such price-book version.");
    try {
      return await this.db.$transaction(async (tx) => {
        await this.book.lock(tx);
        const row = await tx.priceBookVersion.findUnique({ where: { id } });
        if (!row) throw AppError.notFound("No such price-book version.");
        if (row.version !== body.version) throw AppError.conflict("version_mismatch", "That draft has a different version number. Load it again.");
        if ((await tx.price.count({ where: { version: row.version } })) > 0) throw AppError.conflict("already_published", "That version is already published.");
        const base = await this.book.latestPublished(tx);
        if (row.version < base.version) throw AppError.conflict("stale_draft", "A newer version was published after this draft. Make a new draft.");
        const lines = base.lines.map((l) => ({ ...l }));
        const proposed = Array.isArray(row.prices) ? (row.prices as unknown as DraftLine[]) : [];
        for (const p of proposed) {
          const l = lines.find((x) => x.sku === p.sku);
          if (!l) throw AppError.conflict("stale_draft", `The draft names ${p.sku}, which is no longer in the book.`);
          if (p.listKobo !== undefined) l.listKobo = BigInt(p.listKobo);
          if (p.promoKobo !== undefined && l.discountable) l.promoKobo = BigInt(p.promoKobo);
          if (l.promoKobo !== null && l.promoKobo > l.listKobo) {
            throw AppError.validation({ prices: `${p.sku}: the promoted price cannot be above the list price.` });
          }
        }
        const now = this.book.now();
        const effectiveFrom = now;
        await this.writeLines(tx, lines, row.version);
        const updated = await tx.priceBookVersion.update({ where: { id }, data: { effectiveFrom, prices: snapshotJson(lines) } });
        await this.audit.write(tx, {
          actor,
          section: SECTION,
          action: "price-book.publish",
          target: { type: "price-book-version", id },
          reason,
          changedFields: ["prices", "effectiveFrom"],
        });
        return versionOf(updated, true, reason);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict("price_book_busy", "Another price change landed first. Try again.");
      throw e;
    }
  }
}

/** A published version's record: each line's figures and the promotion that covers it in this version. */
function snapshotJson(lines: BookLine[]): Prisma.InputJsonValue {
  return lines.map((l) => ({
    sku: l.sku,
    listKobo: safe(l.listKobo),
    promoKobo: l.promoKobo === null ? null : safe(l.promoKobo),
    promotionId: l.promotion?.id ?? null,
  }));
}

/** Checks a draft's proposed lines against the book: known skus, once each, whole kobo above 0. */
function draftLines(prices: unknown[], base: BookVersion): DraftLine[] {
  const fields: Record<string, string> = {};
  if (!Array.isArray(prices) || prices.length === 0) throw AppError.validation({ prices: "Name at least one line." });
  const seen = new Set<string>();
  const out: DraftLine[] = [];
  prices.forEach((raw, i) => {
    const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const line = typeof p.sku === "string" ? base.lines.find((l) => l.sku === p.sku) : undefined;
    if (!line) fields[`prices[${i}].sku`] = "Not a line in the price book.";
    else if (seen.has(line.sku)) fields[`prices[${i}].sku`] = "Named twice.";
    const d: DraftLine = { sku: String(p.sku) };
    for (const f of ["listKobo", "promoKobo"] as const) {
      if (p[f] === undefined) continue;
      const v = p[f];
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) fields[`prices[${i}].${f}`] = "Must be a whole number of kobo above 0.";
      else d[f] = v;
    }
    if (line && d.promoKobo !== undefined && !line.discountable) fields[`prices[${i}].promoKobo`] = "This line is never discounted.";
    if (d.listKobo === undefined && d.promoKobo === undefined) fields[`prices[${i}]`] = "Give listKobo or promoKobo.";
    if (line) {
      const list = d.listKobo !== undefined ? BigInt(d.listKobo) : line.listKobo;
      const promo = d.promoKobo !== undefined ? BigInt(d.promoKobo) : line.promoKobo;
      if (promo !== null && promo > list && !fields[`prices[${i}].promoKobo`]) fields[`prices[${i}].promoKobo`] = "Cannot be above the list price.";
      seen.add(line.sku);
    }
    out.push(d);
  });
  if (Object.keys(fields).length) throw AppError.validation(fields);
  return out;
}
