import { Injectable } from "@nestjs/common";
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
import { parseOpening } from "./local-time";
import { CHAPTER_KEYS, checkContent, fileRefsOf, hasBody } from "./wish-content";
import { WishLifecycleService } from "./wish-lifecycle.service";
import { stateOf } from "./wish-state";

type Tx = Prisma.TransactionClient;
type Obj = Record<string, unknown>;

export const DEFAULT_ZONE = "Africa/Lagos";
/** The id of the one wish_number_sequence row. */
const SEQUENCE_ID = "00000000-0000-7000-8000-0000000000b6";
const TICKETS = ["moment", "keepsake", "signature", "premiere"] as const;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

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
  opensAt?: string | null;
  timeZone?: string;
  keep?: "month" | "half" | "year" | null;
  step?: number;
  passcode?: string | null;
}
export interface SealInput {
  version?: number;
  opensAt?: string;
  timeZone?: string;
}

const hashPasscode = (p: string): Promise<string> =>
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
  ) {}

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
    return this.wire(row, (await this.linksFor([id])).get(id));
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
      link: slug ? `/w/${slug}` : null, hasPasscode: r.passcodeHash !== null,
    };
  }

  // ---- the draft ----

  private slugOf(label: string, field: string): string {
    const v = label.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!SLUG.test(v)) throw AppError.validation({ [field]: "Use the kind's own name, letters, numbers and dashes." });
    return v;
  }

  private async styleSlug(db: Tx | PrismaService, raw: string): Promise<string> {
    const slug = raw.trim().toLowerCase();
    const found = slug ? await db.style.findUnique({ where: { slug }, select: { id: true } }) : null;
    if (!found) throw AppError.validation({ style: "That style is not offered." });
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

  async patch(accountId: string, id: string, input: PatchInput): Promise<number> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const kind = input.kind === undefined ? undefined : this.slugOf(input.kind, "kind");
    const occasion = input.occasion === undefined ? undefined : this.slugOf(input.occasion, "occasion");
    const name = input.name === undefined ? undefined : this.text(input.name, "name", 120);
    const zone = input.timeZone;
    if (zone !== undefined && !isTimeZone(zone)) throw AppError.validation({ timeZone: "Not a time zone, for example Africa/Lagos." });
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
      if (input.style !== undefined) data.styleSlug = await this.styleSlug(tx, input.style);
      if (input.keep !== undefined) data.keep = input.keep;
      if (input.step !== undefined) data.step = input.step;
      if (passHash !== undefined) data.passcodeHash = passHash;
      const tz = zone ?? cur.timeZone;
      if (zone !== undefined) data.timeZone = zone;
      if (input.opensAt !== undefined) {
        if (input.opensAt === null || input.opensAt.trim() === "") data.opensAt = null;
        else {
          const at = parseOpening(input.opensAt, tz);
          if (!at) throw AppError.validation({ opensAt: "Use a date and time, for example 2027-02-14T09:00." });
          data.opensAt = at;
        }
      }
      let content = (cur.content ?? {}) as Obj;
      if (input.content !== undefined) {
        if (!input.content || typeof input.content !== "object" || Array.isArray(input.content)) throw AppError.validation({ content: "Must be an object." });
        content = { ...content };
        for (const [k, v] of Object.entries(input.content)) {
          if (v === null) delete content[k];
          else content[k] = v;
        }
        checkContent(content);
        const refs = fileRefsOf(content);
        await this.checkFiles(tx, accountId, biz, refs);
        this.checkLimits(book, content, refs, cur);
        data.content = content as Prisma.InputJsonValue;
        await tx.wishFile.deleteMany({ where: { wishId: id, NOT: refs.map((r) => ({ fileId: r.fileId, role: r.role })) } });
        if (refs.length) {
          await tx.wishFile.createMany({
            data: refs.map((r) => ({ id: this.ids.id(), wishId: id, fileId: r.fileId, role: r.role })),
            skipDuplicates: true,
          });
        }
      }
      const done = await tx.wish.updateMany({ where: { id, version: input.version }, data });
      if (done.count !== 1) throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.");
      return input.version + 1;
    });
  }

  private passcode(p: string): string {
    if (p.length < 4 || p.length > 64) throw AppError.validation({ passcode: "Use 4 to 64 characters." });
    return p;
  }

  // ---- paid, seal ----

  /**
   * The ticket is fulfilled: what the payments bundle calls once a verified payment is good (until it merges, tests call it).
   * Only a draft takes it; a second call with the same ticket changes nothing.
   */
  async fulfilTicket(wishId: string, ticket: (typeof TICKETS)[number]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const w = await this.lifecycle.lock(tx, wishId);
      if (w.ticket === ticket) return;
      if (stateOf(w) !== "draft") throw AppError.conflict("wish_locked", "This wish is already sealed.");
      await tx.wish.update({ where: { id: wishId }, data: { ticket, version: { increment: 1 } } });
    });
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
    const biz = await this.business.find(accountId);
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      const locked = await this.lifecycle.lock(tx, id);
      const w = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (stateOf(locked) !== "draft") throw AppError.conflict("not_allowed", "Only a draft can be sealed.");
      if (input.version !== undefined && input.version !== w.version) {
        throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.", { version: String(w.version) });
      }
      if (!w.ticket) throw new AppError(402, "payment_required", "Pay for this wish first.");
      const missing: Record<string, string> = {};
      if (!w.name?.trim()) missing.name = "Who is it for?";
      if (!hasBody(w.content as Obj | null)) missing.content = "Write at least one part of the wish.";
      if (Object.keys(missing).length) throw AppError.validation(missing, "This wish is not ready to seal.");
      const now = this.clock.now();
      const zone = input.timeZone ?? w.timeZone;
      let opensAt: Date = w.opensAt ?? now;
      if (input.opensAt !== undefined) {
        const at = parseOpening(input.opensAt, zone);
        if (!at) throw AppError.validation({ opensAt: "Use a date and time, for example 2027-02-14T09:00." });
        opensAt = at;
      }
      if (opensAt.getTime() < now.getTime()) opensAt = now;
      const no = await this.issueNumber(tx);
      await this.issueSlug(tx, id, w.name ?? "");
      await this.lifecycle.move(tx, locked, "sealed", { cause: "owner.seal", data: { no, sealedAt: now, opensAt, timeZone: zone } });
      await this.jobs.schedule("open-wish", opensAt, id, tx);
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row, (await this.linksFor([id])).get(id));
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

  async erase(accountId: string, id: string): Promise<void> {
    const biz = await this.business.find(accountId);
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz);
      await this.lifecycle.move(tx, await this.lifecycle.lock(tx, id), "erased", { cause: "owner.erase" });
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
        if (to === "sealed") await this.jobs.schedule("open-wish", back.opensAt ?? this.clock.now(), id, tx);
        if (to === "live") await this.jobs.schedule("rest-wish", back.endsAt ?? this.clock.now(), id, tx);
        if (to === "resting") await this.jobs.schedule("erase-wish", back.eraseAfter ?? this.clock.now(), id, tx);
        await tx.wishLink.updateMany({ where: { wishId: id }, data: { active: true } });
      } else throw AppError.conflict("not_allowed", "This wish cannot be brought back.");
      return tx.wish.findUniqueOrThrow({ where: { id } });
    });
    return this.wire(row, (await this.linksFor([id])).get(id));
  }
}
