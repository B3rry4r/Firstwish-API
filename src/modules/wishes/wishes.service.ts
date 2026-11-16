import { Injectable } from "@nestjs/common";
import { ReceiverActivityService } from "../public-wishes/receiver-activity.service";
import { Prisma, Wish } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { SLUG_ALPHABET } from "../../common/ports/ids.port";
import { isTimeZone, toWireInstant } from "../../common/time/time";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import type { Entitlements as EntitlementsRow } from "@prisma/client";
import { JobsService } from "../jobs/jobs.service";
import { BusinessOf } from "../people/business-of";
import { PassDrawService } from "../purchases/pass-draws";
import { ProAccess } from "../pro-business/pro-access";
import { ShowingLink } from "../showing/showing-link";
import { localToUtc, parseOpening, utcToLocal } from "./local-time";
import { CHAPTER_KEYS, DEFAULT_CONTENT_MAX_BYTES, FileRef, hasBody, readContent } from "./wish-content";
import { UNOPENED_DAYS, WishLifecycleService } from "./wish-lifecycle.service";
import { stateOf } from "./wish-state";

type Tx = Prisma.TransactionClient;
type Obj = Record<string, unknown>;

export const DEFAULT_ZONE = "Africa/Lagos";
/** The id of the one wish_number_sequence row. */
const SEQUENCE_ID = "00000000-0000-7000-8000-0000000000b6";
const TICKETS = ["moment", "keepsake", "signature", "premiere"] as const;
export type Ticket = (typeof TICKETS)[number];
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** The longest wait between sealing and the open time (EE5, PROVISIONAL). */
const MAX_YEARS_AHEAD = 5;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface DraftInput {
  kind: string;
  occasion: string;
  name: string;
  style: string;
  from: string;
  studio?: string;
}
export interface PatchInput {
  version: number;
  kind?: string;
  occasion?: string;
  name?: string;
  style?: string;
  content?: Obj;
  makerNote?: Obj;
  opensAt?: string | null;
  timeZone?: string;
  keep?: "month" | "half" | "year" | null;
  step?: number;
  passcode?: string | null;
}
export interface SealInput {
  version: number;
  /** GG5: draw one wish from the Pass in place of a ticket payment. */
  usePass?: boolean;
  /** ZB3: a business's seal on its plan: draws one wish from the business in this transaction (the maker's path). */
  usePlan?: boolean;
  /** The header x-business-id (RR2), read only with usePlan. */
  businessHeader?: string;
  opensAt?: unknown;
  openNow?: boolean;
  timeZone?: string;
}

/** What the plan seal is told: the wish being sealed, the business it is drawn from and the open time the seal fixed. */
export interface PlanSealCall {
  wish: Wish;
  businessId: string;
  opensAt: Date;
  zone: string;
}
/** Draws one wish from the business and writes the client-wish record (registered by the business module: wishes never import it). */
export type PlanSealFn = (tx: Tx, call: PlanSealCall) => Promise<void>;

export const hashPasscode = (p: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(p, salt, 32, (err, key) => (err ? reject(err) : resolve(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`)));
  });

/**
 * The wish, owner's side: a draft that lives on the server from its first keystroke, the seal that fixes its number, link and
 * open time, and the owner's list and detail. The server decides the state (WishLifecycleService); the phone's clock is
 * never read. An owner check is a query condition: the wish is the caller's own, or one of the caller's business.
 */
@Injectable()
export class WishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly lifecycle: WishLifecycleService,
    private readonly entitlements: EntitlementsService,
    private readonly jobs: JobsService,
    private readonly business: BusinessOf,
    private readonly activity: ReceiverActivityService,
    private readonly passDraws: PassDrawService,
    private readonly showing: ShowingLink,
    private readonly access: ProAccess,
  ) {}

  private planSeal: PlanSealFn | null = null;

  /** The business module hands over the draw and the client-wish write for a seal on the plan (ZB3). */
  registerPlanSeal(fn: PlanSealFn): void {
    this.planSeal = fn;
  }

  /**
   * ZB3: a draft owned by `accountId` that carries the business, for a client wish made with no reveal. Runs in the caller's
   * transaction (the caller holds the owner's lock). It answers the wish id; the draw gives its Signature ticket in the same
   * transaction (fulfilTicketIn). The words are the client's name and the business's name; the maker writes the rest.
   */
  async createBusinessDraftIn(tx: Tx, a: { accountId: string; businessId: string; kind: string; occasion: string; name: string }): Promise<string> {
    const kind = this.slugOf(a.kind, "kind");
    const occasion = this.slugOf(a.occasion, "occasion");
    const style = await tx.style.findFirst({ where: { on: true }, orderBy: [{ house: { sort: "desc", nulls: "last" } }, { id: "asc" }], select: { slug: true } });
    if (!style?.slug) throw AppError.conflict("no_style", "No style is on, so a wish cannot be started.");
    const biz = await tx.business.findUnique({ where: { id: a.businessId }, select: { name: true, business: true } });
    const from = (biz?.name ?? biz?.business ?? "").trim();
    const id = this.ids.id();
    await tx.wish.create({
      data: {
        id, accountId: a.accountId, businessId: a.businessId, status: "draft", kind, occasion, styleSlug: style.slug, timeZone: DEFAULT_ZONE,
        name: this.text(a.name, "name", 120), content: { cover: { from } }, version: 0,
      },
    });
    await this.fulfilTicketIn(tx, id, "signature");
    return id;
  }

  // ---- reads ----

  private async ownerWhere(accountId: string): Promise<Prisma.WishWhereInput> {
    const biz = await this.business.find(accountId);
    return biz ? { OR: [{ accountId }, { businessId: biz }] } : { accountId };
  }

  async list(accountId: string, q: { cursor?: string; limit?: number }): Promise<Page<Obj>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const pos = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.prisma.wish.findMany({
      where: { AND: [await this.ownerWhere(accountId), { erasedAt: null }, ...(pos ? [{ id: { lt: String(pos.id) } }] : [])] },
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    const links = await this.linksFor(rows.map((r) => r.id));
    return toPage(rows.map((r) => this.wire(r, links.get(r.id))), limit, (r) => ({ key: String(r.id), id: String(r.id) }));
  }

  async get(accountId: string, id: string): Promise<Obj> {
    const row = await this.owned(this.prisma, accountId, id, await this.business.find(accountId));
    // LL5: what the receivers did (opens, plays, reactions, favourites, shares), counted from rows; only for a wish the caller owns.
    const activity = (await this.activity.summary([row.id])).get(row.id);
    // QQ3: where the owner's asks to be shown stand (the last one, its decline reason, whether it is listed).
    const publish = (await this.showing.showing.publishStateOf([row.id])).get(row.id) ?? null;
    return { ...this.wire(row, (await this.linksFor([id])).get(id)), activity, publish };
  }

  async link(accountId: string, id: string): Promise<{ link: string; slug: string }> {
    const row = await this.owned(this.prisma, accountId, id, await this.business.find(accountId));
    const slug = (await this.linksFor([row.id])).get(row.id);
    if (!slug || !row.no || stateOf(row) === "taken_down" || stateOf(row) === "erased") throw AppError.notFound("This wish has no link.");
    return { link: `/w/${slug}`, slug };
  }

  /** The wish when it is the caller's own or the caller's business's. `biz` is read before any transaction (a pool connection is never held while waiting for another). */
  private async owned(db: PrismaService | Tx, accountId: string, id: string, biz: string | null): Promise<Wish> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const row = await db.wish.findFirst({ where: { AND: [{ id }, biz ? { OR: [{ accountId }, { businessId: biz }] } : { accountId }] } });
    if (!row) throw AppError.notFound("No such wish.");
    return row;
  }

  private async linksFor(ids: string[]): Promise<Map<string, string>> {
    const rows = ids.length ? await this.prisma.wishLink.findMany({ where: { wishId: { in: ids }, active: true } }) : [];
    return new Map(rows.map((r) => [r.wishId, r.slug]));
  }

  wire(r: Wish, slug?: string): Obj {
    const t = (d: Date | null): string | null => (d ? toWireInstant(d) : null);
    return {
      id: r.id, accountId: r.accountId, businessId: r.businessId, status: r.status, state: stateOf(r), ticket: r.ticket,
      kind: r.kind, occasion: r.occasion, style: r.styleSlug, name: r.name, no: r.no, content: r.content ?? {}, keep: r.keep,
      step: r.step, opensAt: t(r.opensAt), timeZone: r.timeZone, sealedAt: t(r.sealedAt), openedAt: t(r.openedAt), endsAt: t(r.endsAt),
      restingSince: t(r.restingSince), keptUntil: t(r.keptUntil), eraseAfter: t(r.eraseAfter), erasedAt: t(r.erasedAt),
      removedAt: t(r.removedAt), createdAt: toWireInstant(r.createdAt), updatedAt: toWireInstant(r.updatedAt), version: r.version,
      link: slug ? `/w/${slug}` : null, hasPasscode: r.passcodeHash !== null, weddingDate: t(r.weddingDate),
      openable: this.openable(r),
    };
  }

  /** EE7: sealed (or live) with the open time passed, and not yet opened, or opened and still within its term. */
  private openable(r: Wish): boolean {
    const now = this.clock.now().getTime();
    const state = stateOf(r);
    if ((state !== "sealed" && state !== "live") || !r.opensAt || r.opensAt.getTime() > now) return false;
    return r.openedAt === null || (r.endsAt !== null && r.endsAt.getTime() > now);
  }

  // ---- the draft ----

  private slugOf(label: string, field: string): string {
    const v = label.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!SLUG.test(v)) throw AppError.validation({ [field]: "Use the kind's own name, letters, numbers and dashes." });
    return v;
  }

  private async styleSlug(db: Tx | PrismaService, raw: string, current?: string): Promise<string> {
    const slug = raw.trim().toLowerCase();
    // A draft saved again with its own current style is accepted even after that style went off: only a CHANGE to an off style is refused.
    if (current !== undefined && slug === current) return slug;
    const found = slug ? await db.style.findUnique({ where: { slug }, select: { id: true, on: true } }) : null;
    // SA5: only a style that is on can be picked (a held, returned or withdrawn Studio style is off); a wish already made keeps its own.
    if (!found || found.on !== true) throw AppError.validation({ style: "That style is not offered." });
    return slug;
  }

  private text(v: string, field: string, max: number): string {
    const t = v.trim();
    if (t.length > max) throw AppError.validation({ [field]: `Most ${max} characters.` });
    return t;
  }

  async create(accountId: string, input: DraftInput): Promise<Obj> {
    const kind = this.slugOf(input.kind, "kind");
    const occasion = this.slugOf(input.occasion, "occasion");
    const name = this.text(input.name, "name", 120);
    const from = this.text(input.from, "from", 120);
    const studio = this.text(input.studio ?? "", "studio", 120);
    const id = this.ids.id();
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const styleSlug = await this.styleSlug(tx, input.style);
      const content: Obj = { cover: { from } };
      if (studio) content.studio = studio;
      return tx.wish.create({
        data: { id, accountId, status: "draft", kind, occasion, styleSlug, timeZone: DEFAULT_ZONE, name, content: content as Prisma.InputJsonValue, version: 0 },
      });
    });
    return this.wire(row);
  }

  /** What the ticket allows. A wish with no paid ticket is on Starter (the moment line). */
  private limitsOf(book: EntitlementsRow, ticket: string | null, adds: unknown): { photos: number; voices: number; chapters: number | null; ticket: string } {
    const slug = ticket && (TICKETS as readonly string[]).includes(ticket) ? ticket : "moment";
    const g = grantOf(book, `ticket.${slug}`);
    if (!g) throw new Error(`price book: no entitlement for ticket.${slug}`);
    const more = (Array.isArray(adds) ? adds : []).filter((a) => typeof a === "string" && /five[\s-]+(more[\s-]+)?photos|extra\.five-photos/i.test(a)).length;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      photos: (num(g.photos) ?? 0) + 5 * more,
      voices: num(g.voices) ?? num(g.friendMessagesMax) ?? 12,
      chapters: num(g.chapters),
      ticket: slug,
    };
  }

  private checkLimits(book: EntitlementsRow, content: Obj, refs: { role: string }[], w: Wish): void {
    const lim = this.limitsOf(book, w.ticket, w.adds);
    const fields: Record<string, string> = {};
    const photos = refs.filter((r) => r.role === "photo").length;
    if (photos > lim.photos) fields.photos = `Over the limit: ${lim.photos} photos on the ${lim.ticket} ticket.`;
    const items = (content.voices as { items?: unknown } | undefined)?.items;
    const voices = Math.max(refs.filter((r) => r.role === "voice").length, Array.isArray(items) ? items.length : 0);
    if (voices > lim.voices) fields.voices = `Over the limit: ${lim.voices} voices on the ${lim.ticket} ticket.`;
    const chapters = CHAPTER_KEYS.filter((k) => content[k] != null).length;
    if (lim.chapters !== null && chapters > lim.chapters) fields.chapters = `Over the limit: ${lim.chapters} chapters on the ${lim.ticket} ticket.`;
    if (Object.keys(fields).length) throw AppError.validation(fields, "Over the limit for this ticket.");
  }

  /** A file the content names must be the caller's own and confirmed (uploaded, screening or ready), else 422. */
  private async checkFiles(tx: Tx, accountId: string, biz: string | null, refs: { fileId: string }[]): Promise<void> {
    if (!refs.length) return;
    const ids = [...new Set(refs.map((r) => r.fileId))];
    const ok = await tx.storedFile.findMany({
      where: {
        id: { in: ids }, status: { in: ["uploaded", "screening", "ready"] },
        OR: [{ ownerAccountId: accountId }, ...(biz ? [{ businessId: biz }] : [])],
      },
      select: { id: true },
    });
    const have = new Set(ok.map((f) => f.id));
    const missing = ids.filter((i) => !have.has(i));
    if (missing.length) throw AppError.validation({ content: `Not your own confirmed file: ${missing.slice(0, 3).join(", ")}.` });
  }

  /** The content size limit: the lifecycle config's wishContentMaxBytes (CC3). */
  private async contentMax(tx: Tx): Promise<number> {
    const cfg = await tx.lifecycleConfig.findFirst({ orderBy: { id: "desc" }, select: { wishContentMaxBytes: true } });
    return cfg?.wishContentMaxBytes ?? DEFAULT_CONTENT_MAX_BYTES;
  }

  /**
   * Checks a whole content document (closed shape, size, the caller's own files, the ticket's limits) and rewrites the wish's
   * wish_file rows to exactly the files it names. Answers the document to store.
   */
  private async applyContent(tx: Tx, accountId: string, biz: string | null, book: EntitlementsRow, cur: Wish, content: Obj): Promise<Prisma.InputJsonValue> {
    const { refs } = readContent(content, await this.contentMax(tx));
    await this.checkFiles(tx, accountId, biz, refs);
    this.checkLimits(book, content, refs, cur);
    await this.syncFiles(tx, cur.id, refs);
    return content as Prisma.InputJsonValue;
  }

  private async syncFiles(tx: Tx, wishId: string, refs: FileRef[]): Promise<void> {
    await tx.wishFile.deleteMany({ where: { wishId, NOT: refs.map((r) => ({ fileId: r.fileId, role: r.role })) } });
    if (refs.length) {
      await tx.wishFile.createMany({ data: refs.map((r) => ({ id: this.ids.id(), wishId, fileId: r.fileId, role: r.role })), skipDuplicates: true });
    }
  }

  /** A time zone change moves the instant: the wall-clock time stays, in the new zone (EE5). */
  private moveZone(at: Date, from: string, to: string): Date {
    if (from === to) return at;
    return localToUtc(utcToLocal(at, from), to) ?? at;
  }

  async patch(accountId: string, id: string, input: PatchInput): Promise<{ version: number; updatedAt: string }> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const kind = input.kind === undefined ? undefined : this.slugOf(input.kind, "kind");
    const occasion = input.occasion === undefined ? undefined : this.slugOf(input.occasion, "occasion");
    const name = input.name === undefined ? undefined : this.text(input.name, "name", 120);
    const zone = input.timeZone;
    if (zone !== undefined && !isTimeZone(zone)) throw AppError.validation({ timeZone: "Not a time zone, for example Africa/Lagos." });
    const wedding = this.weddingOf(input.makerNote);
    const passHash = typeof input.passcode === "string" ? await hashPasscode(this.passcode(input.passcode)) : input.passcode;
    const biz = await this.business.find(accountId);
    const book = await this.entitlements.row();
    return this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      await this.lifecycle.lock(tx, id);
      const cur = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (stateOf(cur) !== "draft") throw AppError.conflict("wish_locked", "This wish is sealed, so its words can no longer be changed.");
      if (cur.version !== input.version) {
        throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.", { version: String(cur.version) });
      }
      const data: Prisma.WishUncheckedUpdateInput = { version: { increment: 1 } };
      if (kind !== undefined) data.kind = kind;
      if (occasion !== undefined) data.occasion = occasion;
      if (name !== undefined) data.name = name;
      if (input.style !== undefined) data.styleSlug = await this.styleSlug(tx, input.style, cur.styleSlug);
      if (input.keep !== undefined) data.keep = input.keep;
      if (input.step !== undefined) data.step = input.step;
      if (passHash !== undefined) data.passcodeHash = passHash;
      if (wedding !== undefined) data.weddingDate = wedding.date;
      if (input.makerNote !== undefined) data.makerNote = { ...((cur.makerNote ?? {}) as Obj), ...input.makerNote } as Prisma.InputJsonValue;
      const tz = zone ?? cur.timeZone;
      if (zone !== undefined) data.timeZone = zone;
      if (input.opensAt !== undefined) {
        if (input.opensAt === null || input.opensAt.trim() === "") data.opensAt = null;
        else {
          const at = parseOpening(input.opensAt, tz);
          if (!at) throw AppError.validation({ opensAt: "Use a date and time, for example 2027-02-14T09:00." });
          data.opensAt = at;
        }
      } else if (cur.opensAt && tz !== cur.timeZone) data.opensAt = this.moveZone(cur.opensAt, cur.timeZone, tz);
      if (input.content !== undefined) {
        if (!input.content || typeof input.content !== "object" || Array.isArray(input.content)) throw AppError.validation({ content: "Must be an object." });
        const content = { ...((cur.content ?? {}) as Obj) };
        for (const [k, v] of Object.entries(input.content)) {
          if (v === null) delete content[k];
          else content[k] = v;
        }
        data.content = await this.applyContent(tx, accountId, biz, book, cur, content);
      }
      const done = await tx.wish.updateMany({ where: { id, version: input.version }, data });
      if (done.count !== 1) throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.");
      const saved = await tx.wish.findUniqueOrThrow({ where: { id }, select: { version: true, updatedAt: true } });
      return { version: saved.version, updatedAt: toWireInstant(saved.updatedAt) };
    });
  }

  /** makerNote.wedding: a date (yyyy-mm-dd) or null. Answers undefined when the note does not say. */
  private weddingOf(note: Obj | undefined): { date: Date | null } | undefined {
    if (!note || !("wedding" in note)) return undefined;
    if (JSON.stringify(note).length > 8192) throw AppError.validation({ makerNote: "Too large." });
    const v = note.wedding;
    if (v === null || v === "") return { date: null };
    const d = typeof v === "string" && DATE_ONLY.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw AppError.validation({ makerNote: "The wedding day reads like 2027-06-12." });
    return { date: d };
  }

  /**
   * E-226 add photos to a draft: `files` are the caller's own confirmed photo files (ids from the upload route); they are appended to
   * content.story.photos under the ticket's photo limit. A sealed wish is refused (409), like every other change to its words.
   */
  async addPhotos(accountId: string, id: string, files: unknown[]): Promise<Obj> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const ids = files.map((f) => (typeof f === "string" ? f : (f as { fileId?: unknown } | null)?.fileId));
    if (!ids.length || ids.length > 50 || !ids.every(isUuidV7)) throw AppError.validation({ files: "Send 1 to 50 file ids from your own uploads." });
    const biz = await this.business.find(accountId);
    const book = await this.entitlements.row();
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      await this.lifecycle.lock(tx, id);
      const cur = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (stateOf(cur) !== "draft") throw AppError.conflict("wish_locked", "This wish is sealed, so its photos can no longer be changed.");
      const content = { ...((cur.content ?? {}) as Obj) };
      const story = { ...((content.story ?? {}) as Obj) };
      const photos = Array.isArray(story.photos) ? [...(story.photos as Obj[])] : [];
      const have = new Set(photos.map((p) => p.photoId));
      for (const fileId of ids) {
        if (have.has(fileId)) continue;
        photos.push({ photoId: fileId });
        have.add(fileId);
      }
      content.story = { ...story, photos };
      const stored = await this.applyContent(tx, accountId, biz, book, cur, content);
      await tx.wish.update({ where: { id }, data: { content: stored, version: { increment: 1 } } });
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row, (await this.linksFor([id])).get(id));
  }

  private passcode(p: string): string {
    if (p.length < 4 || p.length > 64) throw AppError.validation({ passcode: "Use 4 to 64 characters." });
    return p;
  }

  // ---- paid, seal ----

  /**
   * GG2: gives a draft its ticket inside the caller's transaction. It is the one way a wish gets its ticket: the ticket handler of a
   * paid line (purchases) and the Pass upgrade both call it. Only a draft takes it; a second call with the same ticket changes nothing.
   */
  async fulfilTicketIn(tx: Tx, wishId: string, ticket: Ticket): Promise<void> {
    const w = await this.lifecycle.lock(tx, wishId);
    if (w.ticket === ticket) return;
    if (stateOf(w) !== "draft") throw AppError.conflict("wish_locked", "This wish is already sealed.");
    await tx.wish.update({ where: { id: wishId }, data: { ticket, version: { increment: 1 } } });
  }

  /** fulfilTicketIn in a transaction of its own. */
  async fulfilTicket(wishId: string, ticket: Ticket): Promise<void> {
    await this.prisma.$transaction((tx) => this.fulfilTicketIn(tx, wishId, ticket));
  }

  /**
   * GG3: a draft becomes a Signature wish by drawing one of the Pass's upgrades. No money moves. The wish is the caller's own; a draft
   * with no ticket, a Moment or a Keepsake may take it. The draw is one conditional statement on the Pass, so 20 upgrades at once with
   * 1 left give exactly one. A paid upgrade is not sold (the app and the documents give it no price).
   */
  async passUpgrade(accountId: string, id: string): Promise<Obj> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const biz = await this.business.find(accountId);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const own = await this.owned(tx, accountId, id, biz);
      if (own.accountId !== accountId) throw AppError.notFound("No such wish.");
      const locked = await this.lifecycle.lock(tx, id);
      if (stateOf(locked) !== "draft") throw AppError.conflict("not_allowed", "Only a draft can take a Pass upgrade.");
      const w = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (w.ticket === "signature" || w.ticket === "premiere") throw AppError.conflict("already_signature", "This wish is already a Signature wish or better.");
      if ((await this.passDraws.drawFor(tx, accountId, id, "upgrade")) === "none") throw AppError.conflict("no_pass_upgrade", "Your Pass has no upgrade left.");
      await this.fulfilTicketIn(tx, id, "signature");
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row, (await this.linksFor([id])).get(id));
  }

  /**
   * GG5: what the seal does about payment, in the sealing transaction. Without usePass the wish must hold a ticket (and a Signature
   * that only a Pass upgrade made needs its Pass wish: an upgrade alone never seals for free). With usePass it draws one Pass wish
   * (a wish with no ticket becomes a Keepsake); a wish that already holds a paid ticket needs no Pass wish and is refused (422).
   * 20 at once with 1 left: one seals (the account lock queues them and the draw is one conditional statement).
   */
  private async payForSeal(tx: Tx, accountId: string, w: Wish, usePass: boolean | undefined): Promise<void> {
    const draws = await tx.passDraw.findMany({ where: { wishId: w.id }, select: { kind: true } });
    const upgraded = draws.some((d) => d.kind === "upgrade");
    const drawn = draws.some((d) => d.kind === "wish");
    if (!usePass) {
      if (!w.ticket) throw new AppError(402, "payment_required", "Pay for this wish first.");
      if (upgraded && !drawn && (await tx.purchaseGrant.count({ where: { wishId: w.id, kind: "ticket", revokedAt: null, refusedReason: null } })) === 0) {
        throw new AppError(402, "payment_required", "Pay for this wish first, or seal it with your Pass.");
      }
      return;
    }
    if (w.accountId !== accountId) throw AppError.validation({ usePass: "Only the person who owns this wish can use their Pass on it." });
    if (drawn) return;
    if (w.ticket && !(w.ticket === "signature" && upgraded)) throw AppError.validation({ usePass: "This wish already has a ticket, so it needs no Pass wish." });
    if ((await this.passDraws.drawFor(tx, accountId, w.id, "wish")) === "none") {
      throw new AppError(402, "payment_required", "Your Pass has no wish left. Pay for this wish instead.");
    }
    if (!w.ticket) await this.fulfilTicketIn(tx, w.id, "keepsake");
  }

  /** The next wish number, in order, no gaps: one statement on the one sequence row, inside the sealing transaction. */
  async issueNumber(tx: Tx): Promise<string> {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      INSERT INTO wish_number_sequence (id, next, "updatedAt") VALUES (${SEQUENCE_ID}::uuid, 2, ${this.clock.now()})
      ON CONFLICT (id) DO UPDATE SET next = wish_number_sequence.next + 1, "updatedAt" = EXCLUDED."updatedAt"
      RETURNING next - 1 AS n`;
    return String(rows[0].n).padStart(4, "0");
  }

  private async issueSlug(tx: Tx, wishId: string, label: string): Promise<string> {
    const readable = label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
    for (let i = 0; i < 8; i++) {
      const bytes = randomBytes(10);
      let rand = "";
      for (const b of bytes) rand += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
      const slug = readable ? `${readable}-${rand}` : rand;
      const n = await tx.$executeRaw`
        INSERT INTO wish_link (id, slug, "wishId", active, "createdAt", tries)
        VALUES (${this.ids.id()}::uuid, ${slug}, ${wishId}::uuid, true, ${this.clock.now()}, 0) ON CONFLICT (slug) DO NOTHING`;
      if (n === 1) return slug;
    }
    throw new Error("could not issue a wish link");
  }

  async seal(accountId: string, id: string, input: SealInput): Promise<Obj> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    if (input.timeZone !== undefined && !isTimeZone(input.timeZone)) throw AppError.validation({ timeZone: "Not a time zone, for example Africa/Lagos." });
    if (input.usePlan && input.usePass) throw AppError.validation({ usePlan: "Use the plan or the Pass, not both.", usePass: "Use the plan or the Pass, not both." });
    // ZB3: the plan is the caller's business (owner or live login, RR2 header); a person with no business gets 403.
    const plan = input.usePlan ? await this.access.find(accountId, input.businessHeader) : null;
    if (input.usePlan && !plan) throw AppError.forbidden("You are not part of a business.");
    const biz = plan ? plan.businessId : await this.business.find(accountId);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      const locked = await this.lifecycle.lock(tx, id);
      const w = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (stateOf(locked) !== "draft") throw AppError.conflict("not_allowed", "Only a draft can be sealed.");
      if (input.version !== w.version) {
        throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.", { version: String(w.version) });
      }
      if (plan && w.ticket) throw AppError.conflict("already_ticketed", "This wish already has a ticket, so nothing is drawn from the plan for it.");
      if (!w.ticket && !input.usePass && !plan) throw new AppError(402, "payment_required", "Pay for this wish first.");
      const missing: Record<string, string> = {};
      if (!w.name?.trim()) missing.name = "Who is it for?";
      if (!hasBody(w.content as Obj | null)) missing.content = "Write at least one part of the wish.";
      if (Object.keys(missing).length) throw AppError.validation(missing, "This wish is not ready to seal.");
      const now = this.clock.now();
      const zone = input.timeZone ?? w.timeZone;
      const opensAt = this.openTime(input, w, zone, now);
      if (plan) {
        if (!this.planSeal) throw new Error("the plan seal is not registered");
        await this.planSeal(tx, { wish: w, businessId: plan.businessId, opensAt, zone });
      } else await this.payForSeal(tx, accountId, w, input.usePass);
      const no = await this.issueNumber(tx);
      // ZB3: a client wish shares its wish's number once the wish has one.
      await tx.clientWish.updateMany({ where: { wishId: id }, data: { no } });
      await this.issueSlug(tx, id, w.name ?? "");
      await this.lifecycle.move(tx, locked, "sealed", { cause: "owner.seal", data: { no, sealedAt: now, opensAt, timeZone: zone } });
      await this.scheduleOpening(tx, id, opensAt);
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row, (await this.linksFor([id])).get(id));
  }

  /** The open job at the open time, and the rest job for a wish nobody opens (EE9). */
  private async scheduleOpening(tx: Tx, id: string, opensAt: Date): Promise<void> {
    await this.jobs.schedule("open-wish", opensAt, id, tx);
    await this.jobs.schedule("rest-wish", new Date(opensAt.getTime() + UNOPENED_DAYS * DAY), id, tx);
  }

  /**
   * EE5: the open time a seal fixes, in UTC. openNow: true opens at once; otherwise it needs a time at least a minute ahead and
   * at most 5 years ahead (422 for a past, missing or too far time). A new zone keeps the wall-clock time of the stored instant.
   * Nothing but the body's own opensAt, openNow and timeZone moves it: no header and no other field is read.
   */
  private openTime(input: SealInput, w: Wish, zone: string, now: Date): Date {
    const given = input.opensAt;
    if (given !== undefined && given !== null && typeof given !== "string") throw AppError.validation({ opensAt: "Use a date and time, for example 2027-02-14T09:00." });
    const nowWord = typeof given === "string" && given.trim().toLowerCase() === "now";
    if (input.openNow === true || nowWord) return now;
    let at: Date | null = w.opensAt;
    if (typeof given === "string") {
      at = parseOpening(given, zone);
      if (!at) throw AppError.validation({ opensAt: "Use a date and time, for example 2027-02-14T09:00." });
    } else if (at) at = this.moveZone(at, w.timeZone, zone);
    if (!at) throw AppError.validation({ opensAt: "Choose when it opens, or open it now." });
    if (at.getTime() < now.getTime() + MINUTE) throw AppError.validation({ opensAt: "The open time must be at least a minute from now." });
    const limit = new Date(now);
    limit.setUTCFullYear(limit.getUTCFullYear() + MAX_YEARS_AHEAD);
    if (at.getTime() > limit.getTime()) throw AppError.validation({ opensAt: `The open time can be at most ${MAX_YEARS_AHEAD} years from now.` });
    return at;
  }

  // ---- the owner's other moves ----

  async remove(accountId: string, id: string): Promise<Obj> {
    const biz = await this.business.find(accountId);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      await this.lifecycle.move(tx, await this.lifecycle.lock(tx, id), "taken_down", { cause: "owner.remove" });
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row);
  }

  /** Erases a sealed, live or resting wish. A draft is never erased (EE6): its owner removes it. */
  async erase(accountId: string, id: string): Promise<void> {
    const biz = await this.business.find(accountId);
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      const w = await this.lifecycle.lock(tx, id);
      if (stateOf(w) === "draft") throw AppError.conflict("not_allowed", "A draft is removed, not erased. Remove it instead.");
      await this.lifecycle.move(tx, w, "erased", { cause: "owner.erase" });
    });
  }

  /** A resting wish within its window comes back live; a wish the owner removed comes back to the state it left. */
  async restore(accountId: string, id: string): Promise<Obj> {
    const biz = await this.business.find(accountId);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      const w = await this.lifecycle.lock(tx, id);
      const state = stateOf(w);
      if (state === "resting") await this.lifecycle.restoreResting(tx, w, "owner.restore");
      else if (state === "taken_down") {
        const last = await tx.wishTransition.findFirst({ where: { wishId: id, to: "taken_down" }, orderBy: { id: "desc" } });
        if (last?.cause !== "owner.remove") throw AppError.forbidden("Only the team can bring this wish back.");
        const to = await this.lifecycle.stateBeforeTakeDown(tx, id);
        await this.lifecycle.move(tx, w, to, { cause: "owner.restore" });
        const back = await tx.wish.findUniqueOrThrow({ where: { id } });
        if (to === "sealed") await this.scheduleOpening(tx, id, back.opensAt ?? this.clock.now());
        if (to === "live") await this.jobs.schedule("rest-wish", back.endsAt ?? this.clock.now(), id, tx);
        if (to === "resting") await this.jobs.schedule("erase-wish", back.eraseAfter ?? this.clock.now(), id, tx);
        await tx.wishLink.updateMany({ where: { wishId: id }, data: { active: true } });
      } else throw AppError.conflict("not_allowed", "This wish cannot be brought back.");
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row, (await this.linksFor([id])).get(id));
  }
}
