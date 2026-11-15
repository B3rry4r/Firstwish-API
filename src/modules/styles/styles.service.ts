import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Style as StyleRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { PostAdminStylesBySlugSwitchBody, PutAdminStylesBySlugLevelBody, StyleLevel, StyleRate } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import {
  canonSlug,
  Counts,
  isLevel,
  Level,
  LEVEL_NAME,
  quarterBounds,
  quarterOf,
  rateOf,
  recordOf,
  RecordEntry,
  StyleOut,
  styleToWire,
} from "./style-view";

const SECTION = "/admin/styles";
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notAllowed = (message: string) => new AppError(HttpStatus.CONFLICT, "not_allowed", message);
const cap = (l: Level) => LEVEL_NAME[l];

export interface ListQuery {
  cursor?: string;
  limit?: number;
  level?: string;
}

/** One quarter's preview-to-paid row (E-199): the StyleRate view with the figures it is worked out from. */
export type StyleRateOut = StyleRate & { styleSlug: string; name: string; level: string; previews: number; paid: number; rate: number | null };

/** X28: a ceiling far above the number of styles, so the levels read is never cut. */
const ALL_LEVELS_LIMIT = 5000;

@Injectable()
export class StylesService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ public reads

  /** E-198: the level of every style that is on, by slug, in ONE answer (X28: there are tens, not thousands; no paging). */
  async levels(_q: object = {}): Promise<Page<StyleLevel>> {
    const limit = ALL_LEVELS_LIMIT;
    const after: string | null = null;
    const rows = await this.db.style.findMany({
      where: { on: true, slug: after === null ? { not: null } : { gt: after } },
      orderBy: { slug: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: r.slug ?? "", id: r.id }));
    const slugs = page.items.map((r) => r.slug ?? "");
    const moves = slugs.length
      ? await this.db.styleLevel.findMany({ where: { styleSlug: { in: slugs } }, orderBy: [{ since: "desc" }, { id: "desc" }] })
      : [];
    const latest = new Map<string, (typeof moves)[number]>();
    for (const m of moves) if (!latest.has(m.styleSlug)) latest.set(m.styleSlug, m);
    const items = page.items.map((r): StyleLevel => {
      const slug = r.slug ?? "";
      const m = latest.get(slug);
      const level = isLevel(r.level) ? r.level : "starter";
      // Who moved it and why stay in the audit log and the staff list; the public read says only whether staff set it.
      return { slug, styleSlug: slug, level, since: toWireInstant(m?.since ?? r.addedAt ?? new Date(0)), by: m && m.by !== "seed" ? "staff" : "seed", reason: null };
    });
    return { items, nextCursor: page.nextCursor };
  }

  /** E-195: the styles that are on, in slug order. */
  async publicList(q: { cursor?: string; limit?: number }): Promise<Page<StyleOut>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = this.slugCursor(q.cursor);
    const rows = await this.db.style.findMany({
      where: { on: true, slug: after === null ? { not: null } : { gt: after } },
      orderBy: { slug: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: r.slug ?? "", id: r.id }));
    const counts = await this.countsFor(page.items.map((r) => r.slug ?? ""));
    return { items: page.items.map((r) => styleToWire(r, counts.get(r.slug ?? "") ?? zero(), false)), nextCursor: page.nextCursor };
  }

  /** E-196: one style that is on, by slug (or its id). A style that is off or unknown is 404. */
  async publicOne(idOrSlug: string): Promise<StyleOut> {
    const key = canonSlug(idOrSlug);
    const where: Prisma.StyleWhereInput = UUID.test(key) ? { id: key } : SLUG.test(key) ? { slug: key } : { id: "00000000-0000-0000-0000-000000000000" };
    const row = await this.db.style.findFirst({ where: { ...where, on: true } });
    if (!row) throw AppError.notFound("No style has this name.");
    const counts = await this.countsFor([row.slug ?? ""]);
    return styleToWire(row, counts.get(row.slug ?? "") ?? zero(), false);
  }

  // ------------------------------------------------------------------ staff

  /** E-193: every style, on or off, in slug order; filtered by level; this quarter's counts and rate. */
  async adminList(q: ListQuery): Promise<Page<StyleOut>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let level: Level | undefined;
    if (q.level !== undefined) {
      const l = q.level.trim().toLowerCase();
      if (!isLevel(l)) throw AppError.validation({ level: "Must be starter, standard or premium." });
      level = l;
    }
    const after = this.slugCursor(q.cursor);
    const rows = await this.db.style.findMany({
      where: { slug: after === null ? { not: null } : { gt: after }, ...(level ? { level } : {}) },
      orderBy: { slug: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: r.slug ?? "", id: r.id }));
    const counts = await this.countsFor(page.items.map((r) => r.slug ?? ""));
    return { items: page.items.map((r) => styleToWire(r, counts.get(r.slug ?? "") ?? zero(), true)), nextCursor: page.nextCursor };
  }

  /**
   * E-197: move a style to another level. Starter is Firstwish's own: a creator's style moves between Standard and Premium only.
   * Changes which tickets can pick it for new wishes only; a wish already made keeps its style and what it paid.
   */
  async moveLevel(slugIn: string, body: PutAdminStylesBySlugLevelBody, actor: AuditActor): Promise<StyleOut> {
    const reason = requireReason(body.reason);
    const level = body.level;
    const slug = this.knownSlug(slugIn);
    const row = await this.db.$transaction(async (tx) => {
      const style = await this.lock(tx, slug);
      const from = isLevel(style.level) ? style.level : "starter";
      if (from === level) throw notAllowed(`This style is already ${cap(level)}.`);
      if (!style.house && level === "starter") throw notAllowed("Starter is for Firstwish's own styles; a creator's style is Standard or Premium.");
      const now = this.clock.now();
      const get = await this.getLineFor(tx, level, style.get);
      const entry: RecordEntry = { at: toWireInstant(now), what: `Moved from ${cap(from)} to ${cap(level)}`, by: await this.staffName(tx, actor), reason };
      const updated = await tx.style.update({
        where: { id: style.id },
        data: { level, tier: LEVEL_NAME[level], get, record: [...recordOf(style), entry] as unknown as Prisma.InputJsonArray },
      });
      await tx.styleLevel.create({ data: { id: this.ids.id(), styleSlug: slug, slug, level, since: now, by: actor.id ?? "staff", reason } });
      await this.audit.write(tx, { actor, section: SECTION, action: "style.move-level", target: { type: "Style", id: style.id }, reason, changedFields: ["level"] });
      return updated;
    });
    return this.staffOne(row);
  }

  /** E-194: switch a style on or off. Off: no new wish can pick it; wishes already made in it keep playing. */
  async switchStyle(slugIn: string, body: PostAdminStylesBySlugSwitchBody, actor: AuditActor): Promise<StyleOut> {
    const reason = requireReason(body.reason);
    const slug = this.knownSlug(slugIn);
    const row = await this.db.$transaction(async (tx) => {
      const style = await this.lock(tx, slug);
      if ((style.on ?? false) === body.on) throw notAllowed(body.on ? "This style is already on." : "This style is already off.");
      const entry: RecordEntry = { at: toWireInstant(this.clock.now()), what: body.on ? "Switched on" : "Switched off", by: await this.staffName(tx, actor), reason };
      const updated = await tx.style.update({
        where: { id: style.id },
        data: { on: body.on, record: [...recordOf(style), entry] as unknown as Prisma.InputJsonArray },
      });
      await this.audit.write(tx, { actor, section: SECTION, action: body.on ? "style.switch-on" : "style.switch-off", target: { type: "Style", id: style.id }, reason, changedFields: ["on"] });
      return updated;
    });
    return this.staffOne(row);
  }

  /** E-199: preview-to-paid per style for a quarter ("2026-Q4"); the rate is null under the PROVISIONAL 200 previews. */
  async previewToPaid(q: { quarter: string; cursor?: string; limit?: number }): Promise<Page<StyleRateOut>> {
    const bounds = quarterBounds(q.quarter);
    if (!bounds) throw AppError.validation({ quarter: "Must be a quarter such as 2026-Q4." });
    const quarter = q.quarter.trim().toUpperCase();
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = this.slugCursor(q.cursor);
    const rows = await this.db.style.findMany({
      where: { slug: after === null ? { not: null } : { gt: after } },
      orderBy: { slug: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: r.slug ?? "", id: r.id }));
    const counts = await this.countsFor(page.items.map((r) => r.slug ?? ""), bounds);
    const items = page.items.map((r): StyleRateOut => {
      const c = counts.get(r.slug ?? "") ?? zero();
      return { quarter, styleSlug: r.slug ?? "", name: r.name ?? "", level: (r.level ?? "") as StyleRate["level"], previews: c.previews, paid: c.paid, rate: rateOf(c) };
    });
    return { items, nextCursor: page.nextCursor };
  }

  // ------------------------------------------------------------------ helpers

  /** Use counts are sums of events in the quarter (this quarter by default): 'style-previewed' and 'paid' (DEC-124). */
  private async countsFor(slugs: string[], bounds = quarterBounds(quarterOf(this.clock.now()))): Promise<Map<string, Counts>> {
    const out = new Map<string, Counts>();
    if (!slugs.length || !bounds) return out;
    const rows = await this.db.$queryRaw<{ slug: string; previews: bigint; paid: bigint }[]>`
      SELECT "styleSlug" AS slug,
             COUNT(*) FILTER (WHERE "name" = 'style-previewed'::"EventName") AS previews,
             COUNT(*) FILTER (WHERE "name" = 'paid'::"EventName") AS paid
      FROM "event"
      WHERE "styleSlug" = ANY(${slugs}::text[]) AND "at" >= ${bounds.start} AND "at" < ${bounds.end}
        AND "name" IN ('style-previewed'::"EventName", 'paid'::"EventName")
      GROUP BY "styleSlug"`;
    for (const r of rows) out.set(r.slug, { previews: Number(r.previews), paid: Number(r.paid) });
    return out;
  }

  private async staffOne(row: StyleRow): Promise<StyleOut> {
    const counts = await this.countsFor([row.slug ?? ""]);
    return styleToWire(row, counts.get(row.slug ?? "") ?? zero(), true);
  }

  /** A slug the registry could know, else 404 (never a 500): trimmed, lowercased, then matched exactly. */
  private knownSlug(s: string): string {
    const slug = canonSlug(s);
    if (!SLUG.test(slug)) throw AppError.notFound("No style has this name.");
    return slug;
  }

  private slugCursor(cursor: string | undefined): string | null {
    if (!cursor) return null;
    const key = decodeCursor(cursor).key;
    if (typeof key !== "string" || !SLUG.test(key)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
    return key;
  }

  /** The style's row, locked for this transaction (two staff moves at once run one after the other). */
  private async lock(tx: Prisma.TransactionClient, slug: string): Promise<StyleRow> {
    const ids = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "style" WHERE "slug" = ${slug} FOR UPDATE`;
    const id = ids[0]?.id;
    if (!id) throw AppError.notFound("No style has this name.");
    return tx.style.findUniqueOrThrow({ where: { id } });
  }

  /** The "what this level gets you" line is the same for every style at a level; take it from one already there. */
  private async getLineFor(tx: Prisma.TransactionClient, level: Level, current: string | null): Promise<string | null> {
    const other = await tx.style.findFirst({ where: { level, house: true, get: { not: null } }, select: { get: true }, orderBy: { slug: "asc" } });
    return other?.get ?? current;
  }

  private async staffName(tx: Prisma.TransactionClient, actor: AuditActor): Promise<string> {
    if (!actor.id) return "Staff";
    const s = await tx.staffAccount.findUnique({ where: { id: actor.id }, select: { name: true } });
    return s?.name ?? "Staff";
  }
}

const zero = (): Counts => ({ previews: 0, paid: 0 });
