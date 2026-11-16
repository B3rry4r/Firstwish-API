import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { decodeCursor, DEFAULT_LIMIT, encodeCursor, Page } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { normaliseDateOnly, toWireInstant } from "../../common/time/time";
import type { DayPick, PublishedWish, PublishRequest } from "../../contracts";
import { AuditActor, AuditService, requireReason } from "../audit/audit.service";
import { assertMayPublish } from "../moderation/ban-rules";
import { SavedWishesService } from "../saved-wishes/saved-wishes.service";
import { stateOf } from "../wishes/wish-state";
import { CHAPTER_KEYS } from "../wishes/wish-content";
import { WishesService } from "../wishes/wishes.service";
import { SignedUrlsService } from "../stored-files/signed-urls.service";
import { ShowingLink } from "./showing-link";
import { DAY_MS, lagosToday, PICK_DAYS, publicJoins, publicNow } from "./showing-sql";

type Tx = Prisma.TransactionClient;
type Obj = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVELS = ["public-link", "now-showing"] as const;
/** Staff list order: waiting requests first (oldest first), then what is listed (newest first). One ascending number per row. */
const BIG = 10_000_000_000_000;

interface ListRow {
  src: "request" | "listed";
  id: string;
  sortKey: number;
}

/** PublishRequest, PublishedWish (the public list and its staff side) and DayPick. */
@Injectable()
export class ShowingService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly wishes: WishesService,
    private readonly saved: SavedWishesService,
    private readonly link: ShowingLink,
    private readonly signed: SignedUrlsService,
  ) {}

  onModuleInit(): void {
    this.link.register(this);
  }

  // ---- the owner's side -------------------------------------------------------------------------------------------

  /** E-137: the owner asks to list a live wish. Nothing is public until a person approves. One waiting ask per wish (409). */
  async request(accountId: string, wishId: string, body: { consent?: boolean; everyoneAgrees?: boolean; level?: string; publicChapters?: string[]; wishId?: string }): Promise<Obj> {
    const fields: Record<string, string> = {};
    if (body.consent !== true) fields.consent = "Agree before you ask to show this wish.";
    if (body.everyoneAgrees === false) fields.everyoneAgrees = "Everyone in the wish must agree.";
    const level = body.level ?? "now-showing";
    if (!(LEVELS as readonly string[]).includes(level)) fields.level = "Must be public-link or now-showing.";
    const chapters = [...new Set(body.publicChapters ?? [])];
    if (chapters.some((c) => !(CHAPTER_KEYS as readonly string[]).includes(c))) fields.publicChapters = "Name chapters this wish has.";
    if (body.wishId !== undefined && body.wishId !== wishId) fields.wishId = "That is not this wish.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    if (!isUuidV7(wishId)) throw AppError.notFound("No such wish.");

    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const now = this.clock.now();
      await assertMayPublish(tx, accountId, now);
      const w = await this.ownedWish(tx, accountId, wishId);
      if (stateOf(w) !== "live") throw AppError.conflict("not_allowed", "Only a live wish can be shown.");
      if (w.passcodeHash) throw AppError.conflict("not_allowed", "A wish with a passcode cannot be shown.");
      if (await tx.publishedWish.findFirst({ where: { wishId }, select: { id: true } })) throw AppError.conflict("already_listed", "This wish is already shown.");
      if (await tx.publishRequest.findFirst({ where: { wishId, status: "waiting" }, select: { id: true } })) {
        throw AppError.conflict("already_waiting", "A request for this wish is already waiting.");
      }
      const screening = await this.screeningOf(tx, wishId);
      try {
        await tx.publishRequest.create({
          data: {
            id: this.ids.id(), wishId, level: level === "public-link" ? "public_link" : "now_showing", publicChapters: chapters,
            consentConfirmed: true, consent: true, screening, status: "waiting", createdAt: now,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw AppError.conflict("already_waiting", "A request for this wish is already waiting.");
        throw e;
      }
    });
    return this.withPublish(await this.wishes.get(accountId, wishId), wishId);
  }

  /** E-136: the owner takes their wish off Now showing, or withdraws a waiting ask. Removed at once, saves of it forgotten. */
  async withdraw(accountId: string, wishId: string, body: { wishId?: string }): Promise<Obj> {
    if (body.wishId !== undefined && body.wishId !== wishId) throw AppError.validation({ wishId: "That is not this wish." });
    if (!isUuidV7(wishId)) throw AppError.notFound("No such wish.");
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.ownedWish(tx, accountId, wishId);
      await tx.publishRequest.updateMany({ where: { wishId, status: "waiting" }, data: { status: "withdrawn" } });
      await this.dropForWishes(tx, [wishId]);
    });
    return this.withPublish(await this.wishes.get(accountId, wishId), wishId);
  }

  /** The state of a wish's asks for its owner's detail: the last request, with the decline reason. */
  async publishStateOf(wishIds: string[]): Promise<Map<string, { status: string; reason: string | null; decidedAt: string | null; listed: boolean }>> {
    const out = new Map<string, { status: string; reason: string | null; decidedAt: string | null; listed: boolean }>();
    if (!wishIds.length) return out;
    const rows = await this.db.$queryRaw<{ wishId: string; status: string; reason: string | null; decidedAt: Date | null; listed: boolean }[]>`
      SELECT DISTINCT ON (pr."wishId") pr."wishId"::text AS "wishId", pr.status::text AS status, d.reason, d."decidedAt",
             EXISTS (SELECT 1 FROM published_wish pw WHERE pw."wishId" = pr."wishId") AS listed
        FROM publish_request pr LEFT JOIN moderation_decision d ON d.subject = 'publish_request' AND d."subjectId" = pr.id
       WHERE pr."wishId" = ANY(${wishIds}::uuid[]) ORDER BY pr."wishId", pr.id DESC`;
    for (const r of rows) out.set(r.wishId, { status: r.status, reason: r.reason, decidedAt: r.decidedAt ? toWireInstant(r.decidedAt) : null, listed: r.listed });
    return out;
  }

  private async withPublish(wish: Obj, wishId: string): Promise<Obj> {
    return { ...wish, publish: (await this.publishStateOf([wishId])).get(wishId) ?? null };
  }

  // ---- staff: decide a request ----------------------------------------------------------------------------------------

  /** E-135: approve lists the wish; decline leaves a reason the owner can read. Two staff at once: one decision, the other 409. */
  async decide(id: string, body: { decision: "approve" | "decline"; reason: string }, actor: AuditActor): Promise<PublishRequest> {
    const reason = requireReason(body.reason);
    if (!UUID.test(id)) throw AppError.notFound("No such request.");
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM publish_request WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw AppError.notFound("No such request.");
      const req = await tx.publishRequest.findUniqueOrThrow({ where: { id } });
      if (req.status !== "waiting") throw AppError.conflict("not_allowed", "This request was already decided.");
      const now = this.clock.now();
      if (body.decision === "approve") await this.list(tx, req.wishId, req, now);
      await tx.publishRequest.update({
        where: { id }, data: { status: body.decision === "approve" ? "approved" : "refused", decision: body.decision, reviewedBy: actor.id },
      });
      await tx.$executeRaw`INSERT INTO moderation_decision (subject, "subjectId", reason, "decidedAt") VALUES ('publish_request', ${id}::uuid, ${reason}, ${now})`;
      await this.audit.write(tx, {
        actor, section: "/admin/showing", action: `showing.${body.decision}`, target: { type: "PublishRequest", id }, reason, changedFields: ["status", "decision", "reviewedBy"],
      });
      return this.requestWire(await tx.publishRequest.findUniqueOrThrow({ where: { id } }), reason);
    });
  }

  /** Writes the public row for a wish (only what a stranger may see: no address, no account id). */
  private async list(tx: Tx, wishId: string, req: { id: string; screening: string }, now: Date): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string; no: string | null; kind: string; occasion: string; styleSlug: string; name: string | null; status: string; erasedAt: Date | null; passcodeHash: string | null; accountName: string | null; accountErased: Date | null; slug: string | null }[]>`
      SELECT w.id::text AS id, w.no, w.kind, w.occasion, w."styleSlug", w.name, w.status::text AS status, w."erasedAt", w."passcodeHash",
             a.name AS "accountName", a."erasedAt" AS "accountErased",
             (SELECT slug FROM wish_link WHERE "wishId" = w.id AND active ORDER BY "createdAt" DESC LIMIT 1) AS slug
        FROM wish w JOIN account a ON a.id = w."accountId" WHERE w.id = ${wishId}::uuid FOR UPDATE OF w`;
    const w = rows[0];
    if (!w || w.erasedAt || w.accountErased || (w.status !== "live" && w.status !== "resting") || w.passcodeHash || !w.slug) {
      throw AppError.conflict("not_allowed", "This wish cannot be shown now.");
    }
    const banned = await tx.ban.findFirst({ where: { accountId: (await tx.wish.findUniqueOrThrow({ where: { id: wishId }, select: { accountId: true } })).accountId, OR: [{ until: null }, { until: { gt: now } }] }, select: { id: true } });
    if (banned) throw AppError.conflict("not_allowed", "This account cannot publish.");
    const from = (w.accountName ?? "").trim() || "Someone";
    const forName = (w.name ?? "").trim();
    try {
      await tx.publishedWish.create({
        data: {
          id: this.ids.id(), wishId, wish: wishId, no: w.no, at: now, date: now, listedAt: now, publishedAt: now, counts: { reactions: 0, saves: 0 },
          creator: { name: from }, forName, from, href: `/w/${w.slug}`, img: "", kind: w.kind, occasion: w.occasion, occasionName: w.occasion,
          pos: "", scope: "public", screen: { result: req.screening }, mine: {}, style: w.styleSlug, styleName: w.styleSlug,
          title: forName ? `A ${w.kind} wish for ${forName}` : `A ${w.kind} wish`, featured: false, own: false, name: from, decided: { at: toWireInstant(now) },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw AppError.conflict("not_allowed", "This wish is already shown.");
      throw e;
    }
  }

  // ---- listing, unlisting, saves ----------------------------------------------------------------------------------------

  /**
   * Takes wishes off Now showing: their saves are forgotten first, then the rows go, with their asks (a wish listed again needs
   * a new ask and a new approval), then their wish-of-the-day picks from today on. Runs in the caller's transaction. A ban, an unlist, an owner's withdrawal and the wish lifecycle (rests, taken down, removed, erased: SS1) call it.
   */
  async dropForWishes(tx: Tx, wishIds: string[]): Promise<number> {
    const ids = wishIds.filter((w) => UUID.test(w));
    if (!ids.length) return 0;
    await this.saved.forgetForWishes(tx, ids);
    const nos = (await tx.wish.findMany({ where: { id: { in: ids }, no: { not: null } }, select: { no: true } })).map((w) => w.no as string);
    if (nos.length) await tx.dayPick.deleteMany({ where: { wish: { in: nos }, date: { gte: new Date(`${lagosToday(this.clock.now())}T00:00:00.000Z`) } } });
    const del = await tx.publishedWish.deleteMany({ where: { wishId: { in: ids } } });
    await tx.publishRequest.deleteMany({ where: { wishId: { in: ids } } });
    return del.count;
  }

  /** The erase of an account: every wish of the account is dropped (rows, asks, saves, picks), so no name or title stays behind. */
  async dropForAccount(tx: Tx, accountId: string): Promise<number> {
    const ids = (await tx.wish.findMany({ where: { accountId }, select: { id: true } })).map((w) => w.id);
    return this.dropForWishes(tx, ids);
  }

  /** E-139: staff take a listed wish off Now showing at once. The wish itself stays as it is. Answers the staff list. */
  async unlist(no: string, body: { reason: string }, actor: AuditActor): Promise<Page<PublishedWish>> {
    const reason = requireReason(body.reason);
    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; wishId: string }[]>`
        SELECT pw.id::text AS id, pw."wishId"::text AS "wishId" FROM published_wish pw JOIN wish w ON w.id = pw."wishId" WHERE w.no = ${no} FOR UPDATE OF pw`;
      if (!rows[0]) throw AppError.notFound("That wish is not listed.");
      await this.dropForWishes(tx, [rows[0].wishId]);
      await this.audit.write(tx, {
        actor, section: "/admin/showing", action: "showing.unlist", target: { type: "PublishedWish", id: rows[0].id }, reason, changedFields: ["listedAt"],
      });
    });
    return this.adminList({});
  }

  /** E-140 (public): approved wishes that are live, opened, with an owner who is neither banned nor erased. Newest first. */
  async publicList(q: { cursor?: string; limit?: number }, viewer: string | null = null): Promise<Page<PublishedWish>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const now = this.clock.now();
    const at = Prisma.sql`COALESCE(pw."listedAt", to_timestamp(0))`;
    let after = Prisma.empty;
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (typeof c.key !== "number" || !isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = Prisma.sql`AND (${at}, pw.id) < (${new Date(c.key)}, ${c.id}::uuid)`;
    }
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT pw.id::text AS id, ${at} AS at FROM published_wish pw ${publicJoins()}
       WHERE ${publicNow(now)} ${after} ORDER BY ${at} DESC, pw.id DESC LIMIT ${limit + 1}`;
    const pageRows = rows.slice(0, limit);
    const items = await this.wireRows(pageRows.map((r) => r.id), "public", viewer);
    const last = pageRows[limit - 1] as ({ id: string; at: Date } | undefined);
    return { items, nextCursor: rows.length > limit && last ? encodeCursor({ key: last.at.getTime(), id: last.id }) : null };
  }

  /** E-138 (staff): the requests waiting (oldest first), then every wish listed. */
  async adminList(q: { cursor?: string; limit?: number }): Promise<Page<PublishedWish>> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    let after = Prisma.empty;
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (typeof c.key !== "number" || !UUID.test(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      after = Prisma.sql`WHERE (u."sortKey", u.id) > (${c.key}, ${c.id})`;
    }
    const rows = await this.db.$queryRaw<ListRow[]>`
      SELECT * FROM (
        SELECT 'request' AS src, pr.id::text AS id, (floor(extract(epoch FROM pr."createdAt") * 1000))::bigint AS "sortKey" FROM publish_request pr WHERE pr.status = 'waiting'
        UNION ALL
        SELECT 'listed', pw.id::text, (${BIG}::bigint + 5000000000000 - floor(extract(epoch FROM COALESCE(pw."listedAt", to_timestamp(0))) * 1000))::bigint FROM published_wish pw
      ) u ${after} ORDER BY u."sortKey", u.id LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const requests = page.filter((r) => r.src === "request").map((r) => r.id);
    const listed = page.filter((r) => r.src === "listed").map((r) => r.id);
    const [reqWire, listedWire] = [await this.requestRows(requests), await this.wireRows(listed, "staff")];
    const byId = new Map([...reqWire, ...listedWire].map((i) => [i.id, i]));
    const last = page[limit - 1];
    return { items: page.map((r) => byId.get(r.id)).filter((i): i is PublishedWish => !!i), nextCursor: rows.length > limit && last ? encodeCursor({ key: Number(last.sortKey), id: last.id }) : null };
  }

  /** Public rows are read through the live test; a staff list shows every listed row. */
  private async wireRows(ids: string[], who: "public" | "staff", viewer: string | null = null): Promise<PublishedWish[]> {
    if (!ids.length) return [];
    const rows = await this.db.publishedWish.findMany({ where: { id: { in: ids } } });
    const [reactions, saves] = await Promise.all([
      this.db.reaction.groupBy({ by: ["wish"], where: { wish: { in: ids }, reaction: { not: null } }, _count: true }),
      this.db.savedWish.groupBy({ by: ["wish"], where: { wish: { in: ids } }, _count: true }),
    ]);
    const rc = new Map(reactions.map((r) => [r.wish, r._count]));
    const sc = new Map(saves.map((r) => [r.wish, r._count]));
    const today = await this.todaysNo();
    const byId = new Map(rows.map((r) => [r.id, r]));
    // HP9: a signed-in viewer's own heart and save on each row; a visitor's mark is empty
    const marks = new Map<string, { reaction: NonNullable<PublishedWish["mine"]["reaction"]> | null; saved: boolean }>();
    if (viewer) {
      const [mine, kept] = await Promise.all([
        this.db.reaction.findMany({ where: { accountId: viewer, wish: { in: ids } }, select: { wish: true, reaction: true } }),
        this.db.savedWish.findMany({ where: { accountId: viewer, wish: { in: ids } }, select: { wish: true } }),
      ]);
      for (const id of ids) marks.set(id, { reaction: null, saved: false });
      for (const m of mine) if (m.wish) (marks.get(m.wish) as { reaction: NonNullable<PublishedWish["mine"]["reaction"]> | null }).reaction = m.reaction;
      for (const m of kept) if (m.wish) (marks.get(m.wish) as { saved: boolean }).saved = true;
    }
    const looks = await this.looksOf(rows.map((r) => r.wishId).filter((w): w is string => !!w));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => {
      const at = toWireInstant(r.listedAt ?? new Date(0));
      return {
        id: r.id, at, date: at, listedAt: at, publishedAt: at, counts: { reactions: rc.get(r.id) ?? 0, saves: sc.get(r.id) ?? 0 },
        creator: this.creatorOf(r.creator, r.from, looks.get(r.wishId ?? "")?.handle), forName: r.forName ?? "", from: r.from ?? "", href: r.href ?? "", img: looks.get(r.wishId ?? "")?.img ?? r.img ?? "", kind: r.kind ?? "",
        name: r.name ?? "", no: r.no, occasion: r.occasion ?? "", occasionName: r.occasionName ?? "", pos: looks.get(r.wishId ?? "")?.img ? (looks.get(r.wishId ?? "")?.pos ?? "") : r.pos ?? "", reason: "", scope: who === "staff" ? "listed" : "public",
        screen: who === "staff" ? ((r.screen as Obj | null) ?? {}) : {}, style: r.style ?? "", styleName: r.styleName ?? "", title: r.title ?? "", wish: r.wish ?? "",
        mine: marks.has(r.id) ? { reaction: marks.get(r.id)?.reaction ?? null, saved: marks.get(r.id)?.saved ?? false } : {}, decided: who === "staff" ? (r.decided as Obj | null) : null, featured: !!r.no && r.no === today, own: false,
      };
    });
  }

  /**
   * HP13: what a published row shows of its wish, read from the wish each time (so rows published before this change get it too, and a
   * signed picture never goes stale in a row): the creator's handle when the publisher has the creator side and a handle, and the
   * cover as a short-lived signed read url (img) with its focus (pos). A cover that did not pass screening gives none (img stays "").
   */
  private async looksOf(wishIds: string[]): Promise<Map<string, { handle: string | null; img: string; pos: string }>> {
    const out = new Map<string, { handle: string | null; img: string; pos: string }>();
    if (!wishIds.length) return out;
    const wishes = await this.db.wish.findMany({ where: { id: { in: wishIds } }, select: { id: true, content: true, account: { select: { handle: true, sides: true, erasedAt: true } } } });
    for (const w of wishes) {
      const a = w.account;
      const handle = a && !a.erasedAt && a.sides.includes("creator") && a.handle ? a.handle : null;
      const cover = (w.content && typeof w.content === "object" && !Array.isArray(w.content) ? (w.content as Obj).cover : null) as Obj | null;
      const fileId = [cover?.coverId, cover?.photoId].find((x): x is string => typeof x === "string");
      let img = "";
      if (fileId) {
        try {
          img = (await this.signed.signedRead({ fileId }, { type: "allowed" })).url;
        } catch (e) {
          if (!(e instanceof AppError) || e.getStatus() !== 404) throw e;
        }
      }
      out.set(w.id, { handle, img, pos: img ? "50% 50%" : "" });
    }
    return out;
  }

  /** The stored creator ({name}) with the handle the publisher holds now; a publisher with no creator side or handle stays {name}. */
  private creatorOf(stored: unknown, from: string | null, handle: string | null | undefined): PublishedWish["creator"] {
    const base = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as { name?: string; handle?: string }) : { name: from ?? "" };
    const name = base.name ?? from ?? "";
    const h = handle ?? base.handle;
    return h ? { handle: h, name } : { name };
  }

  private async requestRows(ids: string[]): Promise<PublishedWish[]> {
    if (!ids.length) return [];
    const rows = await this.db.$queryRaw<{ id: string; wishId: string; createdAt: Date; screening: string; level: string; chapters: string[]; no: string | null; kind: string; occasion: string; styleSlug: string; name: string | null; slug: string | null; accountName: string | null }[]>`
      SELECT pr.id::text AS id, pr."wishId"::text AS "wishId", pr."createdAt", pr.screening::text AS screening, pr.level::text AS level, pr."publicChapters" AS chapters,
             w.no, w.kind, w.occasion, w."styleSlug", w.name, a.name AS "accountName",
             (SELECT slug FROM wish_link WHERE "wishId" = w.id ORDER BY "createdAt" DESC LIMIT 1) AS slug
        FROM publish_request pr JOIN wish w ON w.id = pr."wishId" JOIN account a ON a.id = w."accountId" WHERE pr.id = ANY(${ids}::uuid[])`;
    return rows.map((r) => {
      const at = toWireInstant(r.createdAt);
      const from = (r.accountName ?? "").trim() || "Someone";
      return {
        id: r.id, at, date: at, listedAt: at, publishedAt: null, counts: { reactions: 0, saves: 0 }, creator: { name: from }, forName: r.name ?? "", from,
        href: r.slug ? `/w/${r.slug}` : "", img: "", kind: r.kind, name: from, no: r.no, occasion: r.occasion, occasionName: r.occasion, pos: "", reason: "",
        scope: "waiting", screen: { result: r.screening, level: r.level, publicChapters: r.chapters, wishId: r.wishId }, style: r.styleSlug, styleName: r.styleSlug,
        title: r.name ? `A ${r.kind} wish for ${r.name}` : `A ${r.kind} wish`, wish: r.wishId, mine: {}, decided: null, featured: false, own: false,
      };
    });
  }

  // ---- wish of the day ----------------------------------------------------------------------------------------------

  /** The Wish.no picked for today in Lagos, when that wish is still listed and public. */
  private async todaysNo(): Promise<string | null> {
    const now = this.clock.now();
    const date = new Date(`${lagosToday(now)}T00:00:00.000Z`);
    const rows = await this.db.$queryRaw<{ no: string }[]>`
      SELECT w.no FROM day_pick dp JOIN wish w ON w.no = dp.wish JOIN published_wish pw ON pw."wishId" = w.id ${publicJoinsAfterWish()}
       WHERE dp.date = ${date}::date AND ${publicNow(now)} LIMIT 1`;
    return rows[0]?.no ?? null;
  }

  /** E-49: staff pick the listed wish for a calendar date (Lagos), from today through the next 6 days. A date picked twice is replaced. */
  async pickDay(date: string, body: { wish: string; reason: string }, actor: AuditActor): Promise<DayPick> {
    const reason = requireReason(body.reason);
    const day = normaliseDateOnly(date);
    if (!day) throw AppError.validation({ date: "Must be a date as YYYY-MM-DD." });
    const today = lagosToday(this.clock.now());
    const last = new Date(new Date(`${today}T00:00:00.000Z`).getTime() + PICK_DAYS * DAY_MS).toISOString().slice(0, 10);
    if (day < today || day > last) throw AppError.conflict("not_allowed", "Pick a day from today to the next 6 days.");
    const no = (body.wish ?? "").trim();
    if (!no) throw AppError.validation({ wish: "Name a listed wish." });
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`day-pick:${day}`}))`;
      const now = this.clock.now();
      const rows = await tx.$queryRaw<{ id: string; wishId: string }[]>`
        SELECT pw.id::text AS id, w.id::text AS "wishId" FROM published_wish pw ${publicJoins()} WHERE w.no = ${no} AND ${publicNow(now)} LIMIT 1`;
      if (!rows[0]) throw AppError.conflict("not_allowed", "Only a wish that is listed can be picked.");
      const pick = { publishedId: rows[0].id, wishId: rows[0].wishId, reason, by: actor.id };
      const dateValue = new Date(`${day}T00:00:00.000Z`);
      await tx.dayPick.upsert({ where: { date: dateValue }, create: { id: this.ids.id(), date: dateValue, wish: no, pick }, update: { wish: no, pick } });
      await this.audit.write(tx, {
        actor, section: "/admin/showing", action: "showing.pick-day", target: { type: "DayPick", id: day }, reason, changedFields: ["wish", "pick"],
      });
      return { date: day, wish: no, reason, pick: { publishedId: rows[0].id, wishId: rows[0].wishId } };
    });
  }

  /** The number of requests waiting for a person (the Overview's count). */
  waitingCount(): Promise<number> {
    return this.db.publishRequest.count({ where: { status: "waiting" } });
  }

  // ---- helpers ----------------------------------------------------------------------------------------------------

  /** The owner's wish, locked; the owner is a query condition, so another account's wish is a 404. */
  private async ownedWish(tx: Tx, accountId: string, wishId: string): Promise<{ status: string; erasedAt: Date | null; passcodeHash: string | null }> {
    const rows = await tx.$queryRaw<{ status: string; erasedAt: Date | null; passcodeHash: string | null }[]>`
      SELECT status::text AS status, "erasedAt", "passcodeHash" FROM wish WHERE id = ${wishId}::uuid AND "accountId" = ${accountId}::uuid FOR UPDATE`;
    if (!rows[0]) throw AppError.notFound("No such wish.");
    return rows[0];
  }

  /** The automatic screening of the files a wish holds: reject when one was refused, review while one waits for a person, else pass. */
  private async screeningOf(tx: Tx, wishId: string): Promise<"pass" | "review" | "reject"> {
    const rows = await tx.$queryRaw<{ v: string }[]>`
      SELECT CASE
        WHEN COALESCE(bool_or(sf.status::text = 'rejected' OR sr."finalVerdict"::text = 'reject' OR sr.verdict::text = 'reject'), false) THEN 'reject'
        WHEN COALESCE(bool_or(sf.status::text = 'screening' OR (sr.verdict::text = 'review' AND sr."finalVerdict" IS NULL)), false) THEN 'review'
        ELSE 'pass' END AS v
        FROM wish_file wf JOIN stored_file sf ON sf.id = wf."fileId" LEFT JOIN screening_result sr ON sr."fileId" = sf.id
       WHERE wf."wishId" = ${wishId}::uuid`;
    return (rows[0]?.v ?? "pass") as "pass" | "review" | "reject";
  }

  private requestWire(r: Prisma.PublishRequestGetPayload<object>, reason: string): PublishRequest {
    return {
      id: r.id, wishId: r.wishId, level: r.level === "public_link" ? "public-link" : "now-showing", publicChapters: r.publicChapters, consent: r.consent ?? true,
      consentConfirmed: r.consentConfirmed, screening: r.screening, status: r.status, decision: (r.decision ?? "approve"), reason,
      reviewedBy: r.reviewedBy, createdAt: toWireInstant(r.createdAt), receiverNotifiedAt: r.receiverNotifiedAt ? toWireInstant(r.receiverNotifiedAt) : null,
      receiverRefusedAt: r.receiverRefusedAt ? toWireInstant(r.receiverRefusedAt) : null,
    };
  }
}

/** todaysNo joins from the day pick, so it needs the same joins as publicJoins without repeating wish. */
function publicJoinsAfterWish(): Prisma.Sql {
  return Prisma.sql`
    JOIN account a ON a.id = w."accountId"
    JOIN LATERAL (SELECT slug, active FROM wish_link WHERE "wishId" = w.id ORDER BY "createdAt" DESC, id DESC LIMIT 1) l ON true`;
}
