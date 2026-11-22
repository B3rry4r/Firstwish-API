import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Style as StyleRow } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { AllList, GetAdminStylesPreviewToPaidQuery, GetAdminStylesQuery, PostAdminStylesBySlugSwitchBody, PutAdminStylesBySlugLevelBody, StyleLevel, StyleRate } from "../../contracts";
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
import { ApprovedStyleDocuments } from "./approved-document";

const SECTION = "/admin/styles";
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notAllowed = (message: string) => new AppError(HttpStatus.CONFLICT, "not_allowed", message);
const cap = (l: Level) => LEVEL_NAME[l];

/** The slug of a creator's Studio style in the catalogue: `studio-` and its id (a slug has no colon; wishes that name `studio:<id>` mean this). */
export const studioSlug = (id: string): string => `studio-${id}`;

/** What the catalogue needs to know of a Studio style (read from its document by the Studio module). */
export interface StudioEntry {
  id: string;
  name: string;
  handle: string;
  creatorName: string;
  /** WW6: Style.creator is {creatorId, templateCreatorId?}; the royalties read exactly that. */
  creatorId: string;
  templateCreatorId?: string;
  line: string;
  kinds: unknown[];
  mood: unknown[];
  pace: string;
  orientation: string;
  dimension: string;
  moves: string;
  light: boolean;
}

function studioFields(e: StudioEntry) {
  return {
    name: e.name, by: e.handle, creator: { creatorId: e.creatorId, ...(e.templateCreatorId ? { templateCreatorId: e.templateCreatorId } : {}) } as Prisma.InputJsonObject, line: e.line, feel: e.line,
    kinds: e.kinds as Prisma.InputJsonArray, mood: e.mood as Prisma.InputJsonArray, pace: e.pace, orientation: e.orientation,
    dimension: e.dimension, moves: e.moves, light: e.light,
  };
}

@Injectable()
export class StylesService {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly approved: ApprovedStyleDocuments,
  ) {}

  // ------------------------------------------------------------------ public reads

  /** E-198: the level of every style that is on, by slug, in ONE answer (X28: there are tens, not thousands; no paging). */
  async levels(): Promise<AllList<StyleLevel>> {
    const rows = await this.db.style.findMany({ where: { on: true, slug: { not: null } }, orderBy: { slug: "asc" } });
    const slugs = rows.map((r) => r.slug ?? "");
    const moves = slugs.length
      ? await this.db.styleLevel.findMany({ where: { styleSlug: { in: slugs } }, orderBy: [{ since: "desc" }, { id: "desc" }] })
      : [];
    const latest = new Map<string, (typeof moves)[number]>();
    for (const m of moves) if (!latest.has(m.styleSlug)) latest.set(m.styleSlug, m);
    const items = rows.map((r): StyleLevel => {
      const slug = r.slug ?? "";
      const m = latest.get(slug);
      const level = isLevel(r.level) ? r.level : "starter";
      // Who moved it and why stay in the audit log and the staff list; the public read says only whether staff set it.
      return { slug, styleSlug: slug, level, since: toWireInstant(m?.since ?? r.addedAt ?? new Date(0)), by: m && m.by !== "seed" ? "staff" : "seed", reason: null };
    });
    return { items, nextCursor: null };
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
    const shows = await this.showcases(page.items.map((r) => r.slug ?? ""));
    return { items: page.items.map((r) => styleToWire(r, counts.get(r.slug ?? "") ?? zero(), false, shows.get(r.slug ?? "") ?? null)), nextCursor: page.nextCursor };
  }

  /**
   * E-285 (IF6): the styles that are on and are credited to one creator (the creator row's id: the creator's account, never a handle kept as text on the style), by slug, paged as the catalogue is. A creator's style
   * is in the catalogue (and so in this list) from the day staff accept it; a style staff switch off leaves it.
   */
  async publicListByCreator(creatorId: string, q: { cursor?: string; limit?: number }): Promise<Page<StyleOut>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = this.slugCursor(q.cursor);
    const found = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM style
       WHERE "on" AND slug IS NOT NULL AND (creator->>'creatorId' = ${creatorId} OR id IN (SELECT "styleId" FROM style_submission WHERE "creatorId" = ${creatorId}::uuid AND status = 'live')) AND (${after}::text IS NULL OR slug > ${after}::text)
       ORDER BY slug ASC LIMIT ${limit + 1}`;
    const rows = await this.db.style.findMany({ where: { id: { in: found.map((f) => f.id) } }, orderBy: { slug: "asc" } });
    const page = toPage(rows, limit, (r) => ({ key: r.slug ?? "", id: r.id }));
    const counts = await this.countsFor(page.items.map((r) => r.slug ?? ""));
    const shows = await this.showcases(page.items.map((r) => r.slug ?? ""));
    return { items: page.items.map((r) => styleToWire(r, counts.get(r.slug ?? "") ?? zero(), false, shows.get(r.slug ?? "") ?? null)), nextCursor: page.nextCursor };
  }

  /** E-196 (HX4): a style whose creator's account is erased names no one: its `creator` carries no creatorId (the byline is already empty). */
  private async creatorUnlessErased(c: StyleOut["creator"]): Promise<StyleOut["creator"]> {
    const ref = c as { creatorId?: string } | null;
    if (!ref?.creatorId || !UUID.test(ref.creatorId)) return c;
    const who = await this.db.creator.findUnique({ where: { id: ref.creatorId }, select: { account: { select: { erasedAt: true } } } });
    if (who?.account && !who.account.erasedAt) return c;
    const { creatorId: _gone, ...rest } = ref;
    return (Object.keys(rest).length ? rest : null) as StyleOut["creator"];
  }

  /** E-196: one style that is on, by slug (or its id), with its approved Studio document where it has one (II1). A style that is off or unknown is 404. */
  async publicOne(idOrSlug: string): Promise<StyleOut> {
    const key = canonSlug(idOrSlug);
    const where: Prisma.StyleWhereInput = UUID.test(key) ? { id: key } : SLUG.test(key) ? { slug: key } : { id: "00000000-0000-0000-0000-000000000000" };
    const row = await this.db.style.findFirst({ where: { ...where, on: true } });
    if (!row) throw AppError.notFound("No style has this name.");
    const counts = await this.countsFor([row.slug ?? ""]);
    // II1: a style that is on and was approved gives its approved document (the maker's preview and the style's page play it); a house style gives null
    const document = await this.approved.of(row.id);
    const wire = styleToWire(row, counts.get(row.slug ?? "") ?? zero(), false, (await this.showcases([row.slug ?? ""])).get(row.slug ?? "") ?? null);
    return { ...wire, creator: await this.creatorUnlessErased(wire.creator), document };
  }

  // ------------------------------------------------------------------ the Studio's entry (B15: a creator's style joins the catalogue here)

  /**
   * A creator's Studio style has a catalogue row from the moment it is sent in, so a submission can point at it (the registry's
   * StyleSubmission.styleId is a Style id). The row has the studio style's own id and the slug `studio-<id>`, is off and is not
   * listed anywhere until staff accept it. Called inside the submit transaction; saying it twice changes nothing.
   */
  async holdStudioStyle(tx: Prisma.TransactionClient, e: StudioEntry): Promise<string> {
    const now = this.clock.now();
    const fields = studioFields(e);
    const record: RecordEntry = { at: toWireInstant(now), what: "Sent in for review", by: e.creatorName, reason: "" };
    await tx.style.upsert({
      where: { id: e.id },
      create: {
        id: e.id, slug: studioSlug(e.id), ...fields, on: false, house: false, level: "standard", tier: LEVEL_NAME.standard, addedAt: null,
        record: [record] as unknown as Prisma.InputJsonArray, previews: 0, paid: 0, packaged: false,
      },
      update: { ...fields },
    });
    return e.id;
  }

  /** Staff accepted it: the style is on, at the level staff chose (Standard unless they say Premium, T-59), with a record entry. */
  async enterStudioStyle(tx: Prisma.TransactionClient, e: StudioEntry, level: "standard" | "premium", staffName: string, staffId: string, reason: string): Promise<void> {
    const now = this.clock.now();
    await this.holdStudioStyle(tx, e);
    const row = await tx.style.findUniqueOrThrow({ where: { id: e.id } });
    const entry: RecordEntry = { at: toWireInstant(now), what: `Accepted as ${cap(level)}`, by: staffName, reason };
    await tx.style.update({
      where: { id: e.id },
      data: {
        on: true, level, tier: LEVEL_NAME[level], addedAt: now, get: await this.getLineFor(tx, level, row.get),
        record: [...recordOf(row), entry] as unknown as Prisma.InputJsonArray,
      },
    });
    const slug = studioSlug(e.id);
    await tx.styleLevel.create({ data: { id: this.ids.id(), styleSlug: slug, slug, level, since: now, by: staffId, reason } });
  }

  /** The creator took their style down: it is off, and a wish already made in it keeps playing (T-62). */
  async withdrawStudioStyle(tx: Prisma.TransactionClient, id: string, creatorName: string): Promise<void> {
    const row = await tx.style.findUnique({ where: { id } });
    if (!row) return;
    const entry: RecordEntry = { at: toWireInstant(this.clock.now()), what: "Withdrawn by its creator", by: creatorName, reason: "" };
    await tx.style.update({ where: { id }, data: { on: false, record: [...recordOf(row), entry] as unknown as Prisma.InputJsonArray } });
  }

  // ------------------------------------------------------------------ staff

  /** E-193: every style, on or off, in slug order; filtered by level; this quarter's counts and rate. */
  async adminList(q: GetAdminStylesQuery): Promise<Page<StyleOut>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const level = q.level;
    const after = this.slugCursor(q.cursor);
    const rows = await this.db.style.findMany({
      where: { slug: after === null ? { not: null } : { gt: after }, ...(level ? { level } : {}) },
      orderBy: { slug: "asc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: r.slug ?? "", id: r.id }));
    const counts = await this.countsFor(page.items.map((r) => r.slug ?? ""));
    const shows = await this.showcases(page.items.map((r) => r.slug ?? ""));
    return { items: page.items.map((r) => styleToWire(r, counts.get(r.slug ?? "") ?? zero(), true, shows.get(r.slug ?? "") ?? null)), nextCursor: page.nextCursor };
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
      // HS3: a style that is off has its house wish unlisted (its link off); on again, the link is back
      await tx.$executeRaw`
        UPDATE wish_link SET active = ${body.on} WHERE "wishId" IN (SELECT w.id FROM wish w JOIN account a ON a.id = w."accountId" WHERE a.handle = 'firstwish' AND w."styleSlug" = ${slug} AND w.content->>'house' = 'true')`;
      await this.audit.write(tx, { actor, section: SECTION, action: body.on ? "style.switch-on" : "style.switch-off", target: { type: "Style", id: style.id }, reason, changedFields: ["on"] });
      return updated;
    });
    return this.staffOne(row);
  }

  /** E-199: preview-to-paid per style for a quarter ("2026-Q4"); the rate is null under the PROVISIONAL 200 previews. */
  async previewToPaid(q: GetAdminStylesPreviewToPaidQuery): Promise<Page<StyleRate>> {
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
    const items = page.items.map((r): StyleRate => {
      const c = counts.get(r.slug ?? "") ?? zero();
      return { quarter, styleSlug: r.slug ?? "", name: r.name ?? "", level: isLevel(r.level) ? r.level : "starter", previews: c.previews, paid: c.paid, rate: rateOf(c) };
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
    return styleToWire(row, counts.get(row.slug ?? "") ?? zero(), true, (await this.showcases([row.slug ?? ""])).get(row.slug ?? "") ?? null);
  }

  /** HS3: the link of each style's house wish (the house creator's live wish that plays it, its link on); a style with none has no entry. */
  private async showcases(slugs: string[]): Promise<Map<string, string>> {
    if (!slugs.length) return new Map();
    const rows = await this.db.$queryRaw<{ style: string; slug: string }[]>`
      SELECT w."styleSlug" AS style, l.slug FROM wish w JOIN wish_link l ON l."wishId" = w.id AND l.active JOIN account a ON a.id = w."accountId"
       WHERE a.handle = 'firstwish' AND w.status = 'live' AND w.content->>'house' = 'true' AND w."styleSlug" = ANY(${slugs})`;
    return new Map(rows.map((r) => [r.style, r.slug]));
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
