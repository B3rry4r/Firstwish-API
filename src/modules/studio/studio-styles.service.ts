import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type StudioStyle as StudioStyleRow } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, type Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { StudioStyle } from "../../contracts";
import { FileJobs } from "../stored-files/file-jobs";
import { StylesService } from "../styles/styles.service";
import { CreatorStateService, type Plan } from "./creator-state.service";
import { namedFileProblems } from "./named-files";
import { cleanDoc, EDITABLE, isObj, json, metaOf, obj, type Obj, type ReviewView, toWire, UUID } from "./studio-doc";

type Tx = Prisma.TransactionClient;
type Wire = StudioStyle & { version: number };

const notFound = () => AppError.notFound("No style has this id.");
const locked = () => AppError.conflict("style_locked", "This style is with Firstwish or live. Take it back first to change it.");

/** A creator's own style drafts (StudioStyle, the document): saved whole on the server, versioned so two tabs never overwrite each other. */
@Injectable()
export class StudioStylesService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly state: CreatorStateService,
    private readonly styles: StylesService,
    private readonly files: FileJobs,
  ) {}

  // ------------------------------------------------------------------ reads

  private async reviewsOf(db: PrismaService | Tx, ids: string[]): Promise<Map<string, ReviewView>> {
    const out = new Map<string, ReviewView>();
    if (!ids.length) return out;
    const rows = await db.styleSubmission.findMany({ where: { styleId: { in: ids } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    for (const r of rows) {
      if (out.has(r.styleId)) continue;
      out.set(r.styleId, { id: r.id, status: r.status, version: r.version, at: toWireInstant(r.createdAt), note: r.note, checks: Array.isArray(r.checks) ? r.checks : [] });
    }
    return out;
  }

  private async levelsOf(db: PrismaService | Tx, rows: StudioStyleRow[]): Promise<Map<string, string>> {
    const live = rows.filter((r) => r.status === "live").map((r) => r.id);
    const out = new Map<string, string>();
    if (!live.length) return out;
    for (const s of await db.style.findMany({ where: { id: { in: live } }, select: { id: true, level: true } })) if (s.level) out.set(s.id, s.level);
    return out;
  }

  /** Rows on the wire, with each one's level (live ones) and latest review. */
  async wire(db: PrismaService | Tx, rows: StudioStyleRow[]): Promise<Wire[]> {
    const [levels, reviews] = await Promise.all([this.levelsOf(db, rows), this.reviewsOf(db, rows.map((r) => r.id))]);
    return rows.map((r) => toWire(r, levels.get(r.id) ?? null, reviews.get(r.id) ?? null));
  }

  /** E-187: the caller's own styles, newest first. */
  async list(accountId: string, q: { cursor?: string; limit?: number }): Promise<Page<Wire>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let after: string | null = null;
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!UUID.test(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = c.id;
    }
    const rows = await this.db.studioStyle.findMany({
      where: { accountId, ...(after ? { id: { lt: after } } : {}) },
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    const page = toPage(rows, limit, (r) => ({ key: "", id: r.id }));
    return { items: await this.wire(this.db, page.items), nextCursor: page.nextCursor };
  }

  /** E-190: one of the caller's own styles; another creator's is 404. */
  async one(accountId: string, id: string): Promise<Wire> {
    if (!UUID.test(id)) throw notFound();
    const row = await this.db.studioStyle.findFirst({ where: { id, accountId } });
    if (!row) throw notFound();
    return (await this.wire(this.db, [row]))[0];
  }

  // ------------------------------------------------------------------ writes

  /** The style's row, locked for this transaction; null when there is none. */
  private async lockRow(tx: Tx, id: string): Promise<StudioStyleRow | null> {
    if (!UUID.test(id)) return null;
    const hit = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM studio_style WHERE id = ${id}::uuid FOR UPDATE`;
    return hit[0] ? tx.studioStyle.findUnique({ where: { id } }) : null;
  }

  /** Locks the caller's own style: another creator's is 404, as if it were not there. */
  async lockOwn(tx: Tx, accountId: string, id: string): Promise<StudioStyleRow> {
    const row = await this.lockRow(tx, id);
    if (!row || row.accountId !== accountId) throw notFound();
    return row;
  }

  /** The name a style carries as its byline: the creator profile's name, else the handle. */
  async bylineOf(tx: Tx, accountId: string): Promise<string> {
    const c = await tx.creator.findUnique({ where: { accountId }, select: { name: true } });
    if (c?.name) return c.name;
    const a = await tx.account.findUnique({ where: { id: accountId }, select: { handle: true, name: true } });
    return a?.handle ? `@${a.handle}` : (a?.name ?? "");
  }

  /** T-21: a plan allows so many drafts at once (the entitlements say how many). A draft is a style not with Firstwish and not live. */
  private async assertRoomForDraft(tx: Tx, accountId: string, plan: Plan, except?: string): Promise<void> {
    const limit = (await this.state.rules(tx)).drafts(plan);
    if (limit === null) return;
    const count = await tx.studioStyle.count({ where: { accountId, status: { in: [...EDITABLE] }, ...(except ? { id: { not: except } } : {}) } });
    if (count >= limit) {
      throw new AppError(HttpStatus.PAYMENT_REQUIRED, "draft_limit", `Your plan holds ${limit} draft${limit === 1 ? "" : "s"} at a time. Send one in, delete it or move to the Creator plan.`);
    }
  }

  /**
   * T-23 and T-67: what a new draft was made from. Firstwish's own templates are free. A catalogue style that is Premium needs a
   * paid plan (402), and one made by another creator only opens as a template if that creator allowed it (403). The server writes
   * `from` from what it found, never from the client's words.
   */
  private async resolveFrom(tx: Tx, accountId: string, plan: Plan, raw: unknown): Promise<Obj | null> {
    if (raw === undefined || raw === null) return null;
    const ref = isObj(raw) ? raw.id : raw;
    if (typeof ref !== "string" || !ref.trim()) throw AppError.validation({ "style.from": "Say which style this was made from." });
    const key = ref.trim();
    if (UUID.test(key)) {
      const t = await tx.template.findUnique({ where: { id: key } });
      if (t) return { id: t.id, name: t.name ?? "", handle: t.handle ?? "", house: t.house ?? true };
    }
    const style = await tx.style.findFirst({ where: UUID.test(key) ? { id: key } : { slug: key.toLowerCase() } });
    if (!style || !style.on) {
      const house = await tx.template.findFirst({ where: { base: key } });
      if (house) return { id: house.id, name: house.name ?? "", handle: house.handle ?? "", house: house.house ?? true };
      throw AppError.validation({ "style.from": "No template or style has this name." });
    }
    if (style.level === "premium" && plan !== "creator") {
      throw new AppError(HttpStatus.PAYMENT_REQUIRED, "plan_needed", "Opening a Premium style as a template needs the Creator plan.");
    }
    if (!style.house) {
      const owner = await tx.studioStyle.findUnique({ where: { id: style.id } });
      const own = owner?.accountId === accountId;
      if (!own && metaOf(obj(owner?.document)).template !== true) {
        throw new AppError(HttpStatus.FORBIDDEN, "template_not_allowed", "Its creator has not made this style open as a template.");
      }
    }
    return { id: style.id, name: style.name ?? "", handle: style.by ?? "", house: style.house ?? false };
  }

  /** II5: a document names only this style's own files that are ready (422 in words naming each place, nothing saved). */
  async assertFilesNamed(tx: Tx, accountId: string, styleId: string, doc: Obj, sendIn = false): Promise<void> {
    const fields = await namedFileProblems(tx, accountId, styleId, doc, sendIn);
    if (Object.keys(fields).length) throw AppError.validation(fields);
  }

  private async insert(tx: Tx, accountId: string, id: string, plan: Plan, body: unknown): Promise<StudioStyleRow> {
    await this.assertRoomForDraft(tx, accountId, plan);
    const doc = cleanDoc(body);
    await this.assertFilesNamed(tx, accountId, id, doc);
    const from = await this.resolveFrom(tx, accountId, plan, isObj(body) ? body.from : undefined);
    const now = toWireInstant(this.clock.now());
    const document = { ...doc, version: 1, at: now, byline: await this.bylineOf(tx, accountId), on: false, template: false, useExtra: false, from };
    return tx.studioStyle.create({ data: { id, accountId, status: "draft", document: json(document) } });
  }

  /** Unique violations are 409, never 500: the same id sent twice at once. */
  private async guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw AppError.conflict("stale_version", "This style was saved somewhere else a moment ago. Open it again.");
      throw e;
    }
  }

  /** E-188: a new draft. The id is the server's. */
  async create(accountId: string, body: { style?: unknown }): Promise<Wire> {
    if (body.style === undefined) throw AppError.validation({ style: "Send the style." });
    return this.guarded(() =>
      this.db.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const plan = await this.state.planOf(tx, accountId);
        const row = await this.insert(tx, accountId, this.ids.id(), plan, body.style);
        return (await this.wire(tx, [row]))[0];
      }),
    );
  }

  /**
   * E-191: save the whole document by id (or switch it on or off). The save carries the version it read: a stale one is 409, so
   * two tabs never overwrite each other. A style with Firstwish or live cannot be changed: take it back first.
   */
  async save(accountId: string, id: string, body: { on?: boolean; style?: unknown }): Promise<Wire> {
    if (!UUID.test(id)) throw notFound();
    if (body.style === undefined && body.on === undefined) throw AppError.validation({ style: "Send the style or on." });
    if (isObj(body.style) && body.style.id !== undefined && body.style.id !== id) throw AppError.validation({ "style.id": "The id must be the one in the address." });
    return this.guarded(() =>
      this.db.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const row = await this.lockRow(tx, id);
        if (row && row.accountId !== accountId) throw notFound();
        if (!row) {
          if (body.style === undefined) throw notFound();
          if (isObj(body.style) && body.style.version !== undefined && body.style.version !== 0) throw AppError.conflict("stale_version", "This style does not exist yet; send it without a version.");
          const plan = await this.state.planOf(tx, accountId);
          const made = await this.insert(tx, accountId, id, plan, body.style);
          if (body.on !== undefined) return this.applyOn(tx, made, body.on);
          return (await this.wire(tx, [made]))[0];
        }
        if (!EDITABLE.includes(row.status ?? "")) throw locked();
        if (body.style === undefined) return this.applyOn(tx, row, body.on as boolean);
        const doc = obj(row.document);
        const meta = metaOf(doc);
        const sent = isObj(body.style) ? body.style.version : undefined;
        if (typeof sent !== "number" || !Number.isInteger(sent)) throw AppError.validation({ "style.version": "Send the version you read." });
        if (sent !== meta.version) throw AppError.conflict("stale_version", "This style was saved somewhere else since you opened it. Open it again.");
        const next = cleanDoc(body.style);
        await this.assertFilesNamed(tx, accountId, id, next);
        const document = { ...next, version: meta.version + 1, at: toWireInstant(this.clock.now()), byline: meta.byline || (await this.bylineOf(tx, accountId)), on: body.on ?? meta.on, template: meta.template, useExtra: meta.useExtra, from: meta.from };
        const saved = await tx.studioStyle.update({ where: { id }, data: { document: json(document) } });
        return (await this.wire(tx, [saved]))[0];
      }),
    );
  }

  private async applyOn(tx: Tx, row: StudioStyleRow, on: boolean): Promise<Wire> {
    const doc = obj(row.document);
    const meta = metaOf(doc);
    const saved = await tx.studioStyle.update({ where: { id: row.id }, data: { document: json({ ...doc, on, version: meta.version + 1, at: toWireInstant(this.clock.now()) }) } });
    return (await this.wire(tx, [saved]))[0];
  }

  /**
   * E-189: delete a draft (HX3): its files go with it, bytes included, and an upload still waiting for its confirm is refused from then
   * on. A style with Firstwish or live is not deleted: wishes may already be made in it (T-62).
   */
  async remove(accountId: string, id: string): Promise<true> {
    if (!UUID.test(id)) throw notFound();
    const retired = await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const row = await this.lockOwn(tx, accountId, id);
      if (!EDITABLE.includes(row.status ?? "")) throw locked();
      const ids = await this.files.retireStyleFiles(tx, id);
      await tx.studioStyle.delete({ where: { id } });
      return ids;
    });
    await this.files.dropRetired(retired);
    return true;
  }

  /**
   * E-192: take a style back. In review it goes back to a draft (the waiting submission is closed and the review given back); live it
   * comes off the catalogue and wishes already made in it keep playing (T-62). With `on` it instead sets whether a live style may be
   * opened as a template by other creators (T-23).
   */
  async withdraw(accountId: string, id: string, body: { on?: boolean }): Promise<Wire & { submission: unknown }> {
    if (!UUID.test(id)) throw notFound();
    return this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const row = await this.lockOwn(tx, accountId, id);
      const doc = obj(row.document);
      const meta = metaOf(doc);
      const now = this.clock.now();
      if (body.on !== undefined) {
        if (row.status !== "live") throw AppError.conflict("not_allowed", "Only a live style can be opened as a template.");
        const saved = await tx.studioStyle.update({ where: { id }, data: { document: json({ ...doc, template: body.on, version: meta.version + 1, at: toWireInstant(now) }) } });
        return this.withSubmission(tx, (await this.wire(tx, [saved]))[0]);
      }
      let status: "draft";
      if (row.status === "review") {
        const waiting = await tx.styleSubmission.findFirst({ where: { styleId: id, status: "review" }, orderBy: { id: "desc" } });
        if (waiting) {
          await tx.styleSubmission.update({ where: { id: waiting.id }, data: { status: "returned", decision: "return", note: "Taken back by its creator." } });
          const snap = await tx.styleSubmissionSnapshot.findUnique({ where: { submissionId: waiting.id }, select: { used: true } });
          if (snap) await this.state.giveReviewBack(tx, accountId, snap.used as "plan" | "extra");
          await tx.$executeRaw`DELETE FROM job WHERE type = 'style-level-review'::"JobType" AND "subjectId" = ${`check:${waiting.id}`} AND status = 'scheduled'`;
        }
        status = "draft";
      } else if (row.status === "live") {
        await this.styles.withdrawStudioStyle(tx, id, meta.byline);
        status = "draft";
      } else throw AppError.conflict("not_allowed", "There is nothing to take back: this style is still a draft.");
      const saved = await tx.studioStyle.update({
        where: { id },
        data: { status, liveAt: null, submittedAt: null, document: json({ ...doc, version: meta.version + 1, at: toWireInstant(now) }) },
      });
      return this.withSubmission(tx, (await this.wire(tx, [saved]))[0]);
    });
  }

  private async withSubmission(tx: Tx, w: Wire): Promise<Wire & { submission: unknown }> {
    const r = await tx.styleSubmission.findFirst({ where: { styleId: w.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return { ...w, submission: r ? this.submissionWire(r) : null };
  }

  /** A submission row as the registry's StyleSubmission. */
  submissionWire(r: Prisma.StyleSubmissionGetPayload<object>, open = 0): unknown {
    return {
      id: r.id, styleId: r.styleId, creatorId: r.creatorId, version: r.version, checks: Array.isArray(r.checks) ? r.checks : [],
      status: r.status, level: r.level ?? null, reviewedBy: r.reviewedBy ?? null, note: r.note ?? null, createdAt: toWireInstant(r.createdAt),
      decision: r.decision ?? null, reason: r.note ?? "", open,
    };
  }
}
