import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ClientWish, PostBusinessClientWishesBody } from "../../contracts";
import { lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { FileJobs } from "../stored-files/file-jobs";
import { blankRevealWords, CLIENT_WISH_PREFIX } from "../accounts/account-erasure.service";
import { JobContext, JobResult, JobsService } from "../jobs/jobs.service";
import { BusinessHandlers } from "../purchases/business-handlers";
import type { Tx } from "../purchases/grants";
import { utcToLocal } from "../wishes/local-time";
import { RoyaltiesService } from "../royalties/royalties.service";
import { WishesService } from "../wishes/wishes.service";
import type { PlanSealCall } from "../wishes/wishes.service";
import { clientWishWire, WITH_WISH } from "./client-wish-wire";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX = 80;
const OCCASIONS = ["Staff birthday", "Work anniversary"];

interface NewWish {
  client: string;
  kind: string;
  occasion: string;
  day: string;
  key?: string;
}

/**
 * A business's wishes for its clients (E-29 to E-32). A wish is made by the owner or a live login; it counts one wish against the
 * business in the SAME transaction that writes it (BusinessHandlers.draw: the month's allowance first, a pack after), so a wish
 * that cannot be counted is not made. Everything runs under the owner's account lock (AA1), which also lines up 20 requests at once.
 * A lapsed plan changes nothing already made: the rows stay and play to the end of their terms; a new wish then draws from the pack.
 */
@Injectable()
export class ClientWishesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly handlers: BusinessHandlers,
    private readonly jobs: JobsService,
    private readonly wishes: WishesService,
    private readonly royalties: RoyaltiesService,
    private readonly fileJobs: FileJobs,
  ) {}

  onModuleInit(): void {
    this.wishes.registerPlanSeal((tx, call) => this.sealOnPlan(tx, call));
    this.wishes.registerSealAccrual((tx, wish) => this.accrueAtSeal(tx, wish));
    this.jobs.registerSubject("erase-now", CLIENT_WISH_PREFIX, (c) => this.eraseWords(c));
  }

  /** RR3: the term of a client wish whose owner was erased has ended: its words go (the name and contact went with the erase). */
  private async eraseWords(c: JobContext): Promise<JobResult> {
    const id = c.subjectId.slice(CLIENT_WISH_PREFIX.length);
    if (!UUID.test(id)) return { skipped: true };
    // ZB3: the term is the linked wish's own (one truth); a row with no wish keeps its own end.
    const row = await this.prisma.clientWish.findUnique({ where: { id }, select: { endsAt: true, wishRef: { select: { endsAt: true } }, revealAccessByWish: { select: { endsAt: true } } } });
    if (!row) return { skipped: true };
    const ends = row.wishRef ? row.wishRef.endsAt : row.endsAt ?? row.revealAccessByWish[0]?.endsAt ?? null;
    if (ends && ends.getTime() > c.now.getTime()) return { skipped: true, again: ends };
    const r = await this.prisma.clientWish.updateMany({ where: { id, OR: [{ wish: { not: null } }, { client: { not: null } }, { from: { not: null } }] }, data: { wish: null, from: null, client: null } });
    // EA4: the reveal's words (name, note, credits) go with the rest at the end of the term.
    const w = await blankRevealWords(this.prisma, [id]);
    // HC1: the Vault files the reveal showed go with its words.
    const files = await this.fileJobs.removeRevealFiles(id);
    return r.count || w || files ? { changed: { erased: 1 } } : { skipped: true };
  }

  async list(businessId: string, cursor: string | undefined, limit: number): Promise<Page<ClientWish>> {
    let before = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      before = c.id;
    }
    const rows = await this.prisma.clientWish.findMany({ where: { businessId, id: { lt: before } }, orderBy: { id: "desc" }, take: limit + 1, include: WITH_WISH });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map(clientWishWire), nextCursor: page.nextCursor };
  }

  async get(businessId: string, id: string): Promise<ClientWish> {
    if (!UUID.test(id)) throw AppError.notFound();
    const r = await this.prisma.clientWish.findFirst({ where: { id, businessId }, include: WITH_WISH });
    if (!r) throw AppError.notFound();
    return clientWishWire(r);
  }

  private read(body: PostBusinessClientWishesBody): NewWish {
    const fields: ErrorFields = {};
    const client = (typeof body.client === "string" ? body.client : "").trim().replace(/\s+/g, " ");
    if (!client || client.length > NAME_MAX) fields.client = `Must be the client's name, 1 to ${NAME_MAX} characters.`;
    const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
    if (!SLUG.test(kind)) fields.kind = "Use the kind's own name, letters, numbers and dashes.";
    const occasion = typeof body.occasion === "string" ? body.occasion.trim() : "";
    if (!occasion || occasion.length > 60) fields.occasion = "Must be the occasion, up to 60 characters.";
    const day = typeof body.day === "string" ? body.day.trim() : "";
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) fields.day = "Must be a date like 2027-03-04.";
    if (Array.isArray(body.reveal) ? body.reveal.length > 0 : body.reveal !== undefined) fields.reveal = "A reveal is sent from a shoot in the Vault, not made here.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { client, kind, occasion, day };
  }

  /** E-30: make one wish for a client. 402 when the business has nothing left to count it against. */
  async create(accountId: string, businessId: string, body: PostBusinessClientWishesBody): Promise<ClientWish> {
    const w = this.read(body);
    return this.prisma.$transaction((tx) => this.make(tx, accountId, businessId, w));
  }

  /**
   * HD3: the caller's right to the business, read under the owner's lock (the one every login removal takes): the owner, or an invited or
   * active login. A login removed while the request waited gets 404 and nothing is drawn, so no wish lands on a removed login.
   */
  private async requireMember(tx: Tx, accountId: string, businessId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM business b WHERE b.id = ${businessId}::uuid AND b."accountId" = ${accountId}::uuid
      UNION ALL
      SELECT 1 AS ok FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE l."businessId" = ${businessId}::uuid AND a.contact IS NOT NULL AND a."erasedAt" IS NULL
         AND lower(trim(l.contact)) = lower(a.contact) AND l.status IN ('invited', 'active')
      LIMIT 1`;
    if (!rows.length) throw AppError.notFound();
  }

  /** The wish row and its draw, in the caller's transaction (the owner's account is locked first). */
  private async make(tx: Tx, accountId: string, businessId: string, w: NewWish): Promise<ClientWish> {
    await lockBusinessOwner(tx, businessId);
    await this.requireMember(tx, accountId, businessId);
    if (w.key) {
      const again = await tx.clientWish.findFirst({ where: { businessId, key: w.key }, include: WITH_WISH });
      if (again) return clientWishWire(again);
    }
    const from = await this.handlers.draw(tx, businessId);
    if (!from) throw await this.nothingLeft(tx, businessId);
    const next = await tx.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(max(no::int), 900) + 1 AS n FROM client_wish WHERE "businessId" = ${businessId}::uuid AND no ~ '^[0-9]{1,9}$'`;
    const no = String(next[0]?.n ?? 901).padStart(4, "0");
    const id = this.ids.id();
    const now = this.clock.now();
    // ZB3: no reveal, so an ordinary wish: a draft of the caller's that carries the business, its Signature ticket given by this same draw.
    const wishId = await this.wishes.createBusinessDraftIn(tx, { accountId, businessId, kind: w.kind, occasion: w.occasion, name: w.client });
    const row = await tx.clientWish.create({
      include: WITH_WISH,
      data: {
        id, businessId, wishId, createdAt: now, sentAt: now, client: w.client, kind: w.kind, occasion: w.occasion, day: new Date(`${w.day}T00:00:00Z`), from, no,
        key: w.key ?? `cw-${no}`, wish: "", shoot: "", hearts: [] as Prisma.InputJsonArray, madeOwn: false,
      },
    });
    return clientWishWire(row);
  }

  /**
   * ZB3, the maker's path: sealing a draft on the plan draws one wish from the business, marks the wish as the business's, gives it
   * its Signature ticket and writes the client-wish record (client = the wish's name, kind, occasion and the open day), in the seal's
   * own transaction. The seal then gives the record the wish's number. 402 as E-30 when nothing is left.
   */
  private async sealOnPlan(tx: Tx, call: PlanSealCall): Promise<void> {
    const { wish, businessId } = call;
    await lockBusinessOwner(tx, businessId);
    await this.requireMember(tx, wish.accountId, businessId);
    const from = await this.handlers.draw(tx, businessId);
    if (!from) throw await this.nothingLeft(tx, businessId);
    await tx.wish.update({ where: { id: wish.id }, data: { businessId } });
    await this.wishes.fulfilTicketIn(tx, wish.id, "signature");
    const now = this.clock.now();
    const day = utcToLocal(call.opensAt, call.zone).slice(0, 10);
    await tx.clientWish.create({
      data: {
        id: this.ids.id(), businessId, wishId: wish.id, createdAt: now, sentAt: now, client: (wish.name ?? "").trim(), kind: wish.kind, occasion: wish.occasion,
        day: new Date(`${day}T00:00:00Z`), from, key: `wish:${wish.id}`, wish: "", shoot: "", hearts: [] as Prisma.InputJsonArray, madeOwn: false,
      },
    });
    // ZZ5: the style is final at the seal; the creator of a Premium style earns on this draw, in this transaction.
    await this.royalties.accrueForDraw(tx, { businessId, from, wishId: wish.id, styleSlug: wish.styleSlug });
  }

  /**
   * GB1: the ordinary seal of a wish made from the sheet or a date (it carries the business and has its client-wish record): the same
   * accrual as the maker's seal, reading month or pack from the record. A wish with no record, or one that earned already, earns nothing here.
   */
  private async accrueAtSeal(tx: Tx, wish: { id: string; businessId: string | null; styleSlug: string }): Promise<void> {
    if (!wish.businessId) return;
    const rec = await tx.clientWish.findUnique({ where: { wishId: wish.id }, select: { from: true } });
    if (rec?.from !== "month" && rec?.from !== "pack") return;
    await lockBusinessOwner(tx, wish.businessId);
    await this.royalties.accrueForDraw(tx, { businessId: wish.businessId, from: rec.from, wishId: wish.id, styleSlug: wish.styleSlug });
  }

  /** 402 naming what to buy: a wish pack always; a plan too when there is none or it has lapsed. */
  private async nothingLeft(tx: Tx, businessId: string): Promise<AppError> {
    const u = await this.handlers.read(tx, businessId);
    if (u?.live) return new AppError(402, "no_wishes", "You have used this month's wishes. Buy a wish pack to make more, or wait for next month.");
    return new AppError(402, "no_wishes", "You have no wishes left. Buy a wish pack or a Pro plan to make more.");
  }

  /**
   * E-32: approve a person's date (a staff birthday or work anniversary): the date is approved and one wish is made for it, counted
   * like any other. `:id` is the person; the key names the date (`<person>:b|s:<year>`). The same key twice answers the first wish.
   */
  async approveDate(accountId: string, businessId: string, personId: string, body: { client: string; day: string; key: string; occasion: unknown }): Promise<ClientWish> {
    if (!UUID.test(personId)) throw AppError.notFound();
    const occasion = typeof body.occasion === "string" ? body.occasion : "";
    const fields: ErrorFields = {};
    if (!OCCASIONS.includes(occasion)) fields.occasion = "Must be Staff birthday or Work anniversary.";
    if (typeof body.key !== "string" || !new RegExp(`^${personId}:[bs]:\\d{4}$`, "i").test(body.key)) fields.key = "Must name this person's date.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const w = { ...this.read({ client: body.client, day: body.day, kind: "teams", occasion }), key: body.key.toLowerCase() };
    return this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const person = await tx.person.findFirst({ where: { id: personId, businessId }, select: { id: true } });
      if (!person) throw AppError.notFound();
      const made = await this.make(tx, accountId, businessId, w);
      await tx.$executeRaw`INSERT INTO approved_date (id, "businessId", key) VALUES (${this.ids.id()}::uuid, ${businessId}::uuid, ${w.key}) ON CONFLICT ("businessId", key) DO NOTHING`;
      return made;
    });
  }
}
