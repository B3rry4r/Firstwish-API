import { Injectable } from "@nestjs/common";
import { ReceiverActivityService } from "../public-wishes/receiver-activity.service";
import { Prisma, Wish } from "@prisma/client";
import { randomBytes, scrypt } from "node:crypto";
import { lockAccount, lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { decodeCursor, DEFAULT_LIMIT, Page, toPage } from "../../common/pagination/cursor";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { SLUG_ALPHABET } from "../../common/ports/ids.port";
import { isTimeZone, toWireInstant } from "../../common/time/time";
import { EntitlementsService, grantOf, ticketFileLimits } from "../price-book/entitlements.service";
import type { Entitlements as EntitlementsRow } from "@prisma/client";
import { JobsService } from "../jobs/jobs.service";
import { BusinessOf } from "../people/business-of";
import { waitingTicketPayment, waitingView } from "../payments/ticket-waiting";
import { PassDrawService } from "../purchases/pass-draws";
import { ProAccess } from "../pro-business/pro-access";
import { ShowingLink } from "../showing/showing-link";
import { localToUtc, parseOpening, utcToLocal } from "./local-time";
import { cutSecret, normalAnswer, SECRET_LENGTH_WORDS, SECRET_WORDS, secretOpening, withoutSecrets } from "./opening-secret";
import { CHAPTER_KEYS, DEFAULT_CONTENT_MAX_BYTES, FileRef, hasBody, readContent } from "./wish-content";
import { readLimits } from "../price-book/book-limits";
import type { Principal } from "../../common/auth/principal";
import { WishLifecycleService } from "./wish-lifecycle.service";
import { stateOf } from "./wish-state";
import { SHOWN_TO_BUYER } from "./wish-shown";
import { WishPictures } from "./wish-pictures";
import { approvedSubmissionOf } from "../styles/approved-document";
import { kindHasOccasion, LAST_STEP } from "./kind-occasions";
import { isLevel } from "../styles/style-view";
import { addsFor } from "../wish-extras/wish-adds";
import { clipLimitsOf, clipRefusal, clipSlots, fillClipLengths, heldClipSkus, readHeldClips } from "../wish-extras/wish-clips";
import { ClipLengthPort } from "../../common/ports/clip-length.port";
import { allowedLevel, firstStyleFor, heldAdds, REFUND_WORDS, levelRank, offeredForWish, styleTakingRefusal } from "./style-rule";
import { PriceBookService } from "../price-book/price-book.service";
import { videoRefunded } from "../wish-extras/wish-extras";
import { VideoRenderer } from "../render-jobs/video-renderer";
import { assessExtra, readWish, unsoldLines } from "../purchases/wish-rules";
import { DEFAULT_KIND, DEFAULT_OCCASION, isBareStart, START_KEY } from "./wish-start";

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
  /** HM3: kind, occasion and style are answers; a start that carries one counts it, one that does not begins on the default. */
  kind?: string;
  occasion?: string;
  name: string;
  style?: string;
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
/** GB1: called at the ordinary seal of a wish that carries a business: the creator's share of its draw (registered by the business module). */
export type SealAccrualFn = (tx: Tx, wish: Wish) => Promise<void>;

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
/** The most characters a maker's note may hold, incoming and stored (the stored note is the merge of every save). */
const MAKER_NOTE_MAX = 8192;

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
    private readonly pictures: WishPictures,
    private readonly priceBook: PriceBookService,
    private readonly video: VideoRenderer,
    private readonly clipLength: ClipLengthPort,
  ) {}

  private planSeal: PlanSealFn | null = null;

  /** The business module hands over the draw and the client-wish write for a seal on the plan (ZB3). */
  registerPlanSeal(fn: PlanSealFn): void {
    this.planSeal = fn;
  }

  private sealAccrual: SealAccrualFn | null = null;

  /** GB1: the business module hands over the accrual an ordinary seal of a business's wish calls. */
  registerSealAccrual(fn: SealAccrualFn): void {
    this.sealAccrual = fn;
  }

  /**
   * ZB3: a draft owned by `accountId` that carries the business, for a client wish made with no reveal. Runs in the caller's
   * transaction (the caller holds the owner's lock). It answers the wish id; the draw gives its Signature ticket in the same
   * transaction (fulfilTicketIn). The words are the client's name and the business's name; the maker writes the rest.
   */
  async createBusinessDraftIn(tx: Tx, a: { accountId: string; businessId: string; kind: string; occasion: string; name: string }): Promise<string> {
    const kind = this.slugOf(a.kind, "kind");
    const occasion = this.slugOf(a.occasion, "occasion");
    const style = await this.pickStyle(tx, await this.entitlements.row(tx), kind, "signature", occasion);
    const biz = await tx.business.findUnique({ where: { id: a.businessId }, select: { name: true, business: true } });
    const from = (biz?.name ?? biz?.business ?? "").trim();
    const id = this.ids.id();
    await tx.wish.create({
      data: {
        id, accountId: a.accountId, businessId: a.businessId, status: "draft", kind, occasion, styleSlug: style.slug, styleTakenLevel: style.level, styleSubmissionId: style.slug ? await approvedSubmissionOf(tx, style.slug) : null, timeZone: DEFAULT_ZONE,
        name: this.text(a.name, "name", 120), content: { cover: { from } }, version: 0,
      },
    });
    await this.fulfilTicketIn(tx, id, "signature");
    return id;
  }

  /**
   * HZ2: a draft the order's maker makes in the buyer's name. It is the buyer's (their account, and their business for a business's order) and tied
   * to the order; the buyer sees nothing of it until the order is delivered. Runs in the caller's transaction.
   */
  async createForOrderIn(tx: Tx, a: { orderId: string; accountId: string; businessId: string | null; kind: string; occasion: string; name: string }): Promise<string> {
    const kind = this.slugOf(a.kind, "kind");
    const occasion = this.slugOf(a.occasion, "occasion");
    if (!kindHasOccasion(kind, occasion)) throw AppError.validation({ occasion: `The ${kind} kind has no occasion called ${occasion}.` });
    const style = await this.pickStyle(tx, await this.entitlements.row(tx), kind, "signature", occasion);
    const id = this.ids.id();
    await tx.wish.create({
      data: {
        id, accountId: a.accountId, businessId: a.businessId, conciergeOrderId: a.orderId, status: "draft", kind, occasion, styleSlug: style.slug, styleTakenLevel: style.level, styleSubmissionId: style.slug ? await approvedSubmissionOf(tx, style.slug) : null, timeZone: DEFAULT_ZONE,
        name: this.text(a.name, "name", 120), content: {}, version: 0,
        // IE1: a wish made for an order is a Signature wish from its start; the order paid for it (no ticket payment, no ledger line of its own)
        ticket: "signature",
      },
    });
    return id;
  }

  /**
   * HZ2: whose wish this is for a signed-in caller. A user is themselves. A maker (or the owner) is the buyer of the order the wish is tied to,
   * only while that order is with this maker and the wish has not been delivered; in any other case the wish is 404 for them.
   */
  async actingAccount(p: Principal | undefined, id: string): Promise<{ accountId: string; viaOrder: boolean }> {
    if (p?.kind === "user") return { accountId: p.accountId, viaOrder: false };
    if (p?.kind !== "staff") throw AppError.unauthorized();
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const rows = await this.prisma.$queryRaw<{ accountId: string; makerId: string | null }[]>`
      SELECT w."accountId"::text AS "accountId", o."makerId"::text AS "makerId"
        FROM wish w JOIN concierge_order o ON o.id = w."conciergeOrderId"
       WHERE w.id = ${id}::uuid AND o.status IN ('given', 'making') AND w."erasedAt" IS NULL AND w."removedAt" IS NULL
         AND NOT EXISTS (SELECT 1 FROM concierge_order_wish d WHERE d."wishId" = w.id)`;
    const r = rows[0];
    if (!r || (!p.roles.includes("owner") && r.makerId !== p.staffId)) throw AppError.notFound("No such wish.");
    return { accountId: r.accountId, viaOrder: true };
  }

  // ---- reads ----

  private async ownerWhere(accountId: string): Promise<Prisma.WishWhereInput> {
    const biz = await this.business.find(accountId);
    return { AND: [biz ? { OR: [{ accountId }, { businessId: biz }] } : { accountId }, SHOWN_TO_BUYER] };
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
    const shown = rows.slice(0, limit).map((r) => r.id);
    const book = await this.entitlements.row();
    const [pics, videos] = await Promise.all([this.pictures.forWishes(shown), this.pictures.videoStates(shown, (id) => videoRefunded(this.prisma, book, rows.find((r) => r.id === id) as Wish))]);
    // the list carries `publish` as the detail does (where the owner's ask to be shown stands; null when none was made)
    const publishes = await this.showing.showing.publishStateOf(shown);
    const holds = await addsFor(this.prisma, book, rows.slice(0, limit)); // IL2: one query for the page
    const one = (r: Wish): Obj => ({ ...this.wire(r, links.get(r.id)), pictures: pics.get(r.id) ?? [], video: videos.get(r.id) ?? "none", styleLevel: allowedLevel(book, r.ticket, r.adds), publish: publishes.get(r.id) ?? null, adds: holds.get(r.id) ?? [], limits: this.limitsRead(book, r, holds.get(r.id) ?? []) });
    return toPage(rows.map(one), limit, (r) => ({ key: String(r.id), id: String(r.id) }));
  }

  async get(accountId: string, id: string, viaOrder = false): Promise<Obj> {
    const row = await this.owned(this.prisma, accountId, id, await this.business.find(accountId), viaOrder);
    // LL5: what the receivers did (opens, plays, reactions, favourites, shares), counted from rows; only for a wish the caller owns.
    const activity = (await this.activity.summary([row.id])).get(row.id);
    // QQ3: where the owner's asks to be shown stand (the last one, its decline reason, whether it is listed).
    const publish = (await this.showing.showing.publishStateOf([row.id])).get(row.id) ?? null;
    const pictures = (await this.pictures.forWishes([row.id])).get(row.id) ?? [];
    const book = await this.entitlements.row();
    const video = (await this.pictures.videoStates([row.id], () => videoRefunded(this.prisma, book, row))).get(row.id) ?? "none";
    const styleLevel = allowedLevel(book, row.ticket, (await heldAdds(this.prisma, row.id, row.adds)).adds);
    const allowedStyles = await this.allowedStyles(styleLevel, row.kind, row.occasion);
    // ID1: the ticket payment of this wish that waits to be paid (which ticket, its reference, when it lapses), null when none waits
    const waiting = !viaOrder ? await waitingTicketPayment(this.prisma, accountId, row.id, this.clock.now()) : null;
    const extrasOpen = viaOrder ? {} : await this.extrasOpenFor(row.id, book);
    // IL2: what the wish holds and where each came from (its ticket or a purchase), with the state of a refund; the owner's read only
    const adds = (await addsFor(this.prisma, book, [row])).get(row.id) ?? [];
    return { ...this.wire(row, (await this.linksFor([id])).get(id)), activity, publish, pictures, video, styleLevel, allowedStyles, extrasOpen, adds, limits: this.limitsRead(book, row, adds), ticketPayment: waiting ? waitingView(waiting) : null };
  }

  /**
   * Per extra the wish's ticket takes: whether it can still be bought for this wish now (until the wish opens, not held twice, under a Keepsake's ceiling): the
   * same rule the payment's start and settle use (purchases/wish-rules assessExtra), so no screen guesses. Empty before a ticket is chosen.
   */
  private async extrasOpenFor(wishId: string, book: EntitlementsRow): Promise<Record<string, boolean>> {
    const w = await readWish(this.prisma, wishId);
    const takes = w?.ticket ? grantOf(book, `ticket.${w.ticket}`)?.takes : null;
    if (!w || !Array.isArray(takes)) return {};
    const lines = new Map((await this.priceBook.versionAt(this.clock.now())).lines.map((l) => [l.sku, l.listKobo]));
    const out: Record<string, boolean> = {};
    for (const sku of takes) if (typeof sku === "string") out[sku] = assessExtra(w, w.accountId, sku, book, (x) => lines.get(x) ?? 0n, unsoldLines(book, this.video.configured())) === null;
    return out;
  }

  /** HQ5, IJ4: the slugs of the styles a save would accept: on, offered for the wish's kind, and at a level a ticket taking up to `level` may use (any level when no ticket is chosen yet). */
  private async allowedStyles(level: ReturnType<typeof allowedLevel>, kind: string, occasion: string | null): Promise<string[]> {
    const rows = await this.prisma.style.findMany({ where: { on: true }, select: { slug: true, level: true, kinds: true, occasions: true }, orderBy: { slug: "asc" } });
    return rows.filter((r) => !!r.slug && offeredForWish(r.kinds, r.occasions, kind, occasion) && (level === null || levelRank(isLevel(r.level) ? r.level : "starter") <= levelRank(level))).map((r) => r.slug as string);
  }

  async link(accountId: string, id: string): Promise<{ link: string; slug: string }> {
    const row = await this.owned(this.prisma, accountId, id, await this.business.find(accountId));
    const slug = (await this.linksFor([row.id])).get(row.id);
    if (!slug || !row.no || stateOf(row) === "taken_down" || stateOf(row) === "erased") throw AppError.notFound("This wish has no link.");
    return { link: `/w/${slug}`, slug };
  }

  /** The wish when it is the caller's own or the caller's business's. `biz` is read before any transaction (a pool connection is never held while waiting for another). */
  private async owned(db: PrismaService | Tx, accountId: string, id: string, biz: string | null, viaOrder = false): Promise<Wish> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const row = await db.wish.findFirst({ where: { AND: [{ id }, biz ? { OR: [{ accountId }, { businessId: biz }] } : { accountId }, ...(viaOrder ? [] : [SHOWN_TO_BUYER])] } });
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
      kind: r.kind, occasion: r.occasion, style: r.styleSlug, name: r.name, no: r.no, content: withoutSecrets(r.content ?? {}), keep: r.keep,
      step: r.step, opensAt: t(r.opensAt), timeZone: r.timeZone, sealedAt: t(r.sealedAt), openedAt: t(r.openedAt), endsAt: t(r.endsAt),
      restingSince: t(r.restingSince), keptUntil: t(r.keptUntil), eraseAfter: t(r.eraseAfter), erasedAt: t(r.erasedAt),
      removedAt: t(r.removedAt), restorableUntil: t(r.restorableUntil), createdAt: toWireInstant(r.createdAt), updatedAt: toWireInstant(r.updatedAt), version: r.version,
      link: slug ? `/w/${slug}` : null, hasPasscode: r.passcodeHash !== null, weddingDate: t(r.weddingDate),
      openable: this.openable(r),
      // HM1: the maker's own note, as the contract types it (null until one is saved); only the owner's routes build this wire
      makerNote: r.makerNote ?? null,
      // HP3, HP5: the owner's list and single reads fill these in; every other owner answer says no pictures and no video here
      // IL2: `adds` is filled in by those two reads only; on every other answer it is absent (the truth is not read there), never an empty list
      pictures: [],
      video: "none",
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
    // L1: the contract's kind and occasion are strings (no null): null or any other type is a 422 on the field, never a 500
    if (typeof label !== "string") throw AppError.validation({ [field]: "Must be text." });
    const v = label.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!SLUG.test(v)) throw AppError.validation({ [field]: "Use the kind's own name, letters, numbers and dashes." });
    return v;
  }

  private async styleSlug(db: Tx | PrismaService, raw: string, current?: string): Promise<string> {
    const slug = raw.trim().toLowerCase();
    // A draft saved again with its own current style is accepted even after that style went off: only a CHANGE to an off style is refused.
    if (current !== undefined && slug === current) return slug;
    const found = slug ? await db.style.findUnique({ where: { slug }, select: { id: true, on: true, name: true } }) : null;
    // SA5: only a style that is on can be picked (a held, returned or withdrawn Studio style is off); a wish already made keeps its own.
    if (!found) throw AppError.validation({ style: "That style is not offered." });
    // IJ2: a style that is off is refused in the style rule's own words, a house style and a creator's alike
    if (found.on !== true) {
      const said = styleTakingRefusal(null, null, "", { name: found.name, level: null, kinds: null, on: found.on }, { checkKind: false }) as string;
      throw AppError.validation({ style: said });
    }
    return slug;
  }

  private text(v: string, field: string, max: number): string {
    const t = v.trim();
    if (t.length > max) throw AppError.validation({ [field]: `Most ${max} characters.` });
    return t;
  }

  /**
   * E-222 (HM3, revised by HO1 and HO2). Starting a wish is safe to repeat, all under the account lock (so ten at once are one start):
   *  1. an Idempotency-Key seen before answers the draft it answered (200) while that wish is still a live draft; once it is
   *     removed, sealed or erased the key is spent: 409 key_spent (HO2), never a wish handed back as if just started;
   *  2. else a bare start (no kind, occasion or style) hands back a draft made by a bare start and never written since (200),
   *     byte for byte unchanged (isBareStart: version 0 and no makerNote; every write bumps the version and a start that carries
   *     a kind, occasion or style records `makerNote.chosen`). A start never changes a draft that exists (HO1);
   *  3. else a new draft is made (201); a start that carries a kind, occasion or style always makes one.
   * `fresh` tells the controller which status to send.
   */
  async create(accountId: string, input: DraftInput, key?: string): Promise<{ wish: Obj; fresh: boolean }> {
    if (key !== undefined && !START_KEY.test(key)) throw AppError.validation({ "Idempotency-Key": "Must be 8 to 100 letters, digits or . _ : -" });
    const sent = (v: string | undefined): string | undefined => (v === undefined || v.trim() === "" ? undefined : v);
    const kindIn = sent(input.kind);
    const occasionIn = sent(input.occasion);
    const styleIn = sent(input.style);
    const kind = this.slugOf(kindIn ?? DEFAULT_KIND, "kind");
    const occasion = this.slugOf(occasionIn ?? DEFAULT_OCCASION, "occasion");
    const name = this.text(input.name, "name", 120);
    const from = this.text(input.from, "from", 120);
    const studio = this.text(input.studio ?? "", "studio", 120);
    const chosen: Obj = {};
    if (kindIn) chosen.kind = true;
    if (occasionIn) chosen.occasion = true;
    if (styleIn) chosen.style = true;
    const answered = Object.keys(chosen).length > 0;
    const id = this.ids.id();
    const book = await this.entitlements.row(); // read before the transaction: a pool connection is never held while waiting for another
    const out = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const remember = async (wishId: string): Promise<void> => {
        if (key === undefined) return;
        await tx.wishStart.upsert({ where: { accountId_key: { accountId, key } }, create: { id: this.ids.id(), accountId, key, wishId }, update: { wishId } });
      };
      if (key !== undefined) {
        const seen = await tx.wishStart.findUnique({ where: { accountId_key: { accountId, key } } });
        const was = seen ? await tx.wish.findFirst({ where: { AND: [{ id: seen.wishId }, SHOWN_TO_BUYER] } }) : null;
        if (was) {
          if (was.status === "draft" && !was.erasedAt && !was.removedAt) return { row: was, fresh: false };
          throw AppError.conflict("key_spent", "This start was already used and that wish is gone. Start a new wish.");
        }
      }
      if (!answered) {
        const mine = await tx.wish.findMany({ where: { AND: [{ accountId, businessId: null, status: "draft", erasedAt: null, removedAt: null }, SHOWN_TO_BUYER] }, orderBy: { id: "desc" }, take: 20 });
        const open = mine.find(isBareStart);
        if (open) {
          await remember(open.id);
          return { row: open, fresh: false };
        }
      }
      // IJ2: a style named at the start is judged like one named later (a new wish has no ticket yet: kind and switch only)
      // IJ4: with none named the server picks one that is on, offered for the kind and at the starter level; a kind with none starts with no style
      const picked = styleIn ? null : await this.pickStyle(tx, book, kind, null, occasion);
      const styleSlug = styleIn ? await this.styleSlug(tx, styleIn) : (picked as { slug: string }).slug;
      const styleTakenLevel = styleIn ? await this.checkStyleTaking(tx, book, { kind, occasion, ticket: null, adds: [] }, styleSlug) : (picked as { level: string | null }).level;
      const content: Obj = { cover: { from } };
      if (studio) content.studio = studio;
      const row = await tx.wish.create({
        data: {
          id, accountId, status: "draft", kind, occasion, styleSlug, styleTakenLevel, styleSubmissionId: styleSlug ? await approvedSubmissionOf(tx, styleSlug) : null, timeZone: DEFAULT_ZONE, name, content: content as Prisma.InputJsonValue, version: 0,
          ...(answered ? { makerNote: { chosen } as Prisma.InputJsonValue } : {}),
        },
      });
      await remember(row.id);
      return { row, fresh: true };
    });
    return { wish: this.wire(out.row, out.fresh ? undefined : (await this.linksFor([out.row.id])).get(out.row.id)), fresh: out.fresh };
  }

  /**
   * IJ4: the style the server picks for a wish it starts (a new wish, a business draft, a Concierge wish): the first style that is on (the house's own first),
   * offered for the wish's kind and allowed by its ticket (the starter level where there is no ticket yet). A kind with no such style gets slug "" and no
   * level: the wish starts with no style, and sealing it is refused until a style is chosen (the maker's style step is required).
   */
  private async pickStyle(db: Tx, book: EntitlementsRow, kind: string, ticket: string | null, occasion?: string | null, adds: unknown = []): Promise<{ slug: string; level: string | null }> {
    const rows = await db.style.findMany({ where: { on: true }, orderBy: [{ house: { sort: "desc", nulls: "last" } }, { id: "asc" }], select: { slug: true, level: true, kinds: true, occasions: true } });
    if (rows.length === 0) throw AppError.conflict("no_style", "No style is on, so a wish cannot be started.");
    const allowed = ticket ? allowedLevel(book, ticket, adds) : "starter";
    const hit = firstStyleFor(rows, kind, allowed, occasion);
    return hit?.slug ? { slug: hit.slug, level: isLevel(hit.level) ? hit.level : "starter" } : { slug: "", level: null };
  }

  /**
   * HQ5, IJ2: the style a wish is about to take against its kind and the highest level its ticket allows (price book `styleLevel`, a premium-style extra lifts it):
   * 422 on `style`, with words. Returns the style's level, which the wish keeps (`styleTakenLevel`). A wish made on an order is a Signature wish (IE1).
   * At the seal (`atSeal`) only the level is judged, by the level the wish took the style at: the style's kind and switch were judged when it took it.
   */
  private async checkStyleTaking(db: Tx | PrismaService, book: EntitlementsRow, w: { id?: string; kind: string; occasion?: string | null; ticket: string | null; adds: unknown; styleTakenLevel?: string | null }, slug: string, atSeal = false, keepsOff = false): Promise<string> {
    const held = await heldAdds(db, w.id, w.adds); // IJ3a
    const allowed = allowedLevel(book, w.ticket, held.adds);
    const style = await db.style.findUnique({ where: { slug }, select: { name: true, level: true, kinds: true, occasions: true, on: true } });
    if (!style) return "starter";
    const words = styleTakingRefusal(allowed, w.ticket, w.kind, style, atSeal ? { level: w.styleTakenLevel, checkOn: false, checkKind: false } : keepsOff ? { level: w.styleTakenLevel, checkOn: false, occasion: w.occasion } : { occasion: w.occasion });
    if (words) {
      const said = held.refunding ? `${words} ${REFUND_WORDS}` : words;
      throw AppError.validation({ style: said }, said);
    }
    return isLevel(style.level) ? style.level : "starter";
  }

  /** What the ticket allows. A wish with no paid ticket is on Starter (the moment line). A wish made for a Concierge order is a Signature wish (IE1). */
  private limitsOf(book: EntitlementsRow, ticket: string | null, adds: unknown, forOrder = false): { photos: number; voices: number; chapters: number | null; ticket: string } {
    const slug = forOrder ? "signature" : ticket && (TICKETS as readonly string[]).includes(ticket) ? ticket : "moment";
    const g = grantOf(book, `ticket.${slug}`);
    if (!g) throw new Error(`price book: no entitlement for ticket.${slug}`);
    const more = (Array.isArray(adds) ? adds : []).filter((a) => typeof a === "string" && /five[\s-]+(more[\s-]+)?photos|extra\.five-photos/i.test(a)).length;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const own = ticketFileLimits(book, slug);
    return {
      photos: own.photos + 5 * more,
      voices: own.voices,
      chapters: num(g.chapters),
      ticket: slug,
    };
  }

  /** IL1a: what the owner's read says the wish may hold: photos, voices, and the clips (how many, and the length each place takes), from the book, so the web needs no number of its own. */
  private limitsRead(book: EntitlementsRow, w: Wish, holds: readonly { sku: string; held: boolean }[]): Obj {
    const lim = this.limitsOf(book, w.ticket, w.adds, w.conciergeOrderId !== null);
    const slots = clipSlots(book, lim.ticket, holds.filter((h) => h.held).map((h) => h.sku));
    return { photos: lim.photos, voices: lim.voices, clips: clipLimitsOf(slots) };
  }

  /** IL1a: a wish holding more clips, or a longer clip, than the ticket it ends with (and the extras it holds) gives is not sealed: the words say what to remove. */
  private async checkClips(tx: Tx, book: EntitlementsRow, w: { id: string; ticket: string | null; adds: unknown }): Promise<void> {
    const clips = await readHeldClips(tx, w.id);
    if (clips.length === 0) return;
    const words = clipRefusal(clipSlots(book, w.ticket, await heldClipSkus(tx, book, w)), clips, w.ticket);
    if (words) throw AppError.validation({ clips: words }, words);
  }

  private checkLimits(book: EntitlementsRow, content: Obj, refs: { role: string }[], w: Wish): void {
    const lim = this.limitsOf(book, w.ticket, w.adds, w.conciergeOrderId !== null);
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
    return withoutSecrets(content) as Prisma.InputJsonValue; // IK1c: the code and the answer are never kept in the document
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

  async patch(accountId: string, id: string, input: PatchInput, viaOrder = false): Promise<{ version: number; updatedAt: string }> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const kind = input.kind === undefined ? undefined : this.slugOf(input.kind, "kind");
    const occasion = input.occasion === undefined ? undefined : this.slugOf(input.occasion, "occasion");
    const name = input.name === undefined ? undefined : this.text(input.name, "name", 120);
    // HP2: a step is a whole number from 0 to the last step the maker has
    if (input.step !== undefined && (!Number.isInteger(input.step) || input.step < 0 || input.step > LAST_STEP)) {
      throw AppError.validation({ step: `Must be a whole number from 0 to ${LAST_STEP}.` });
    }
    const zone = input.timeZone;
    if (zone !== undefined && !isTimeZone(zone)) throw AppError.validation({ timeZone: "Not a time zone, for example Africa/Lagos." });
    const wedding = this.weddingOf(input.makerNote);
    // IK2a: outer spaces are cut (the passcode() step); a question's answer is also kept in one unicode form and lower case, a passcode keeps its case (both are made here, the opening decides inside)
    const given = typeof input.passcode === "string" ? this.passcode(input.passcode) : null;
    const hashed = given === null ? null : { exact: await hashPasscode(given), answer: normalAnswer(given) === given ? null : await hashPasscode(normalAnswer(given)) };
    const biz = await this.business.find(accountId);
    const book = await this.entitlements.row();
    return this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz, viaOrder);
      await this.lifecycle.lock(tx, id);
      const cur = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (stateOf(cur) !== "draft") throw AppError.conflict("wish_locked", "This wish is sealed, so its words can no longer be changed.");
      if (cur.version !== input.version) {
        throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.", { version: String(cur.version) });
      }
      // HP2: an occasion must be one the (new or current) kind has; the kind may be changed in the same save
      if (occasion !== undefined && !kindHasOccasion(kind ?? cur.kind, occasion)) {
        throw AppError.validation({ occasion: `The ${kind ?? cur.kind} kind has no occasion called ${occasion}.` });
      }
      // L2: a new kind sent alone must still fit the occasion the draft holds; the person sends both to change both
      if (kind !== undefined && occasion === undefined && kind !== cur.kind && !kindHasOccasion(kind, cur.occasion)) {
        throw AppError.validation({ occasion: `The ${kind} kind has no occasion called ${cur.occasion}. Send the kind and an occasion it has.` });
      }
      const data: Prisma.WishUncheckedUpdateInput = { version: { increment: 1 } };
      if (kind !== undefined) data.kind = kind;
      if (occasion !== undefined) data.occasion = occasion;
      if (name !== undefined) data.name = name;
      if (input.style !== undefined) {
        data.styleSlug = await this.styleSlug(tx, input.style, cur.styleSlug);
        // HQ5: once a ticket is chosen, a style above what it allows is refused with words
        if (data.styleSlug !== cur.styleSlug) {
          data.styleTakenLevel = await this.checkStyleTaking(tx, book, { id, kind: kind ?? cur.kind, occasion: occasion ?? cur.occasion, ticket: cur.ticket, adds: cur.adds }, data.styleSlug);
          data.styleSubmissionId = await approvedSubmissionOf(tx, data.styleSlug); // II3: a new style is taken at its current approved version
        }
      }
      // IJ4, IJ4a: a new kind or a new occasion with a style held: the style must be offered for the wish as it will stand, or be replaced in the same save (a held style that went off may stay)
      const kindMoved = kind !== undefined && kind !== cur.kind;
      const occasionMoved = occasion !== undefined && occasion !== cur.occasion;
      if ((kindMoved || occasionMoved) && cur.styleSlug && (data.styleSlug === undefined || data.styleSlug === cur.styleSlug)) {
        const to = { kind: kind ?? cur.kind, occasion: occasion ?? cur.occasion };
        try {
          await this.checkStyleTaking(tx, book, { id, ...to, ticket: cur.ticket, adds: cur.adds, styleTakenLevel: cur.styleTakenLevel }, cur.styleSlug, false, true);
        } catch (e) {
          if (e instanceof AppError && e.getStatus() === 422) {
            // IL4: the move sent no style (a style named, even the held one, is judged as before), so the server picks one by the one rule (`offeredForWish`, the ticket's level, the house's own first) as it does for a new draft;
            // only when no style fits the wish as it will stand is the save refused, in words
            const hit = input.style === undefined ? await this.pickStyle(tx, book, to.kind, cur.ticket, to.occasion, (await heldAdds(tx, id, cur.adds)).adds) : { slug: "", level: null }; // IJ3a: the pick reads what the wish holds, not its raw adds
            if (!hit.slug) {
              const words = `${e.message} Send a style made for the ${kindMoved ? `${to.kind} kind` : `${to.occasion} occasion`} in the same save.`;
              throw AppError.validation({ style: words }, words);
            }
            data.styleSlug = hit.slug;
            data.styleTakenLevel = hit.level;
            data.styleSubmissionId = await approvedSubmissionOf(tx, hit.slug);
          } else throw e;
        }
      }
      if (input.keep !== undefined) data.keep = input.keep;
      if (input.step !== undefined) data.step = input.step;
      if (wedding !== undefined) data.weddingDate = wedding.date;
      if (input.makerNote !== undefined) {
        // the stored note is the merge, so the limit is on the merged note (a long run of small saves cannot pile past it)
        const merged = { ...((cur.makerNote ?? {}) as Obj), ...input.makerNote };
        if (JSON.stringify(merged).length > MAKER_NOTE_MAX) throw AppError.validation({ makerNote: "Too large." });
        data.makerNote = merged as Prisma.InputJsonValue;
      }
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
      {
        // IK1b: a secret is kept for one opening only. A save that names an opening with no secret leaves none; one that changes the opening
        // keeps the old secret only if a new `passcode` comes in the same save, so the old secret never answers the new question.
        const named = input.content !== undefined && Object.prototype.hasOwnProperty.call(input.content, "opening");
        const was = secretOpening(cur.content);
        const nowKind = secretOpening(data.content ?? cur.content);
        if (input.passcode === null) data.passcodeHash = null;
        else if (hashed) data.passcodeHash = named && nowKind === null ? null : nowKind === "question" ? (hashed.answer ?? hashed.exact) : hashed.exact;
        else if (named && (nowKind === null || nowKind !== was)) data.passcodeHash = null;
      }
      const done = await tx.wish.updateMany({ where: { id, version: input.version }, data });
      if (done.count !== 1) throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.");
      const saved = await tx.wish.findUniqueOrThrow({ where: { id }, select: { version: true, updatedAt: true } });
      return { version: saved.version, updatedAt: toWireInstant(saved.updatedAt) };
    });
  }

  /** makerNote.wedding: a date (yyyy-mm-dd) or null. Answers undefined when the note does not say. */
  private weddingOf(note: Obj | undefined): { date: Date | null } | undefined {
    if (!note) return undefined;
    if (JSON.stringify(note).length > MAKER_NOTE_MAX) throw AppError.validation({ makerNote: "Too large." });
    if (!("wedding" in note)) return undefined;
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
  async addPhotos(accountId: string, id: string, files: unknown[], viaOrder = false): Promise<Obj> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    const ids = files.map((f) => (typeof f === "string" ? f : (f as { fileId?: unknown } | null)?.fileId));
    if (!ids.length || ids.length > 50 || !ids.every(isUuidV7)) throw AppError.validation({ files: "Send 1 to 50 file ids from your own uploads." });
    const biz = await this.business.find(accountId);
    const book = await this.entitlements.row();
    const row = await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz, viaOrder);
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

  /**
   * IC7: the maker adds files the buyer gave with the order to the wish being made for it, inside the caller's transaction (the caller has locked the order
   * and checked that each file is a ready file of it). Photos join the story's photos, voice notes join the voices, under this wish's own limits (its
   * ticket's, the Moment line when it has none). The files stay the buyer's own. A sealed wish takes none.
   */
  async addOrderFilesIn(tx: Tx, accountId: string, wishId: string, photoIds: string[], voiceIds: string[]): Promise<void> {
    await lockAccount(tx, accountId);
    await this.lifecycle.lock(tx, wishId);
    const cur = await tx.wish.findUniqueOrThrow({ where: { id: wishId } });
    if (stateOf(cur) !== "draft") throw AppError.conflict("wish_locked", "This wish is sealed, so its photos can no longer be changed.");
    const content = { ...((cur.content ?? {}) as Obj) };
    if (photoIds.length) {
      const story = { ...((content.story ?? {}) as Obj) };
      const photos = Array.isArray(story.photos) ? [...(story.photos as Obj[])] : [];
      const have = new Set(photos.map((p) => p.photoId));
      for (const fileId of photoIds) if (!have.has(fileId)) photos.push({ photoId: fileId });
      content.story = { ...story, photos };
    }
    if (voiceIds.length) {
      const voices = { ...((content.voices ?? {}) as Obj) };
      const items = Array.isArray(voices.items) ? [...(voices.items as Obj[])] : [];
      const have = new Set(items.map((i) => i.voiceId));
      for (const fileId of voiceIds) if (!have.has(fileId)) items.push({ voiceId: fileId, name: "Voice note" });
      content.voices = { ...voices, items };
    }
    const stored = await this.applyContent(tx, accountId, null, await this.entitlements.row(tx), cur, content);
    if (voiceIds.length) await tx.voiceNote.updateMany({ where: { id: { in: voiceIds } }, data: { wishId } });
    await tx.wish.update({ where: { id: wishId }, data: { content: stored, version: { increment: 1 } } });
  }

  private passcode(p: string): string {
    // IK2a: outer spaces are cut first, then 4 to 64 characters must be left (a secret of spaces only is refused)
    const cut = cutSecret(p);
    if (cut.length < 4 || cut.length > 64) throw AppError.validation({ passcode: SECRET_LENGTH_WORDS }, SECRET_LENGTH_WORDS);
    return cut;
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

  async seal(accountId: string, id: string, input: SealInput, viaOrder = false): Promise<Obj> {
    if (!isUuidV7(id)) throw AppError.notFound("No such wish.");
    if (input.timeZone !== undefined && !isTimeZone(input.timeZone)) throw AppError.validation({ timeZone: "Not a time zone, for example Africa/Lagos." });
    if (input.usePlan && input.usePass) throw AppError.validation({ usePlan: "Use the plan or the Pass, not both.", usePass: "Use the plan or the Pass, not both." });
    // ZB3: the plan is the caller's business (owner or live login, RR2 header); a person with no business gets 403.
    const plan = input.usePlan ? await this.access.find(accountId, input.businessHeader) : null;
    if (input.usePlan && !plan) throw AppError.forbidden("You are not part of a business.");
    const biz = plan ? plan.businessId : await this.business.find(accountId);
    const book = await this.entitlements.row(); // read before the transaction: a pool connection is never held while another is asked for
    // M2: clips stored before lengths were read are read now (before the transaction: the tool may be slow), once, and kept
    if (await this.prisma.wish.findFirst({ where: { id, accountId }, select: { id: true } })) await fillClipLengths(this.prisma, this.clipLength, id);
    const row = await this.prisma.$transaction(async (tx) => {
      // HD3: one lock order for everything a business's money touches: the owner's account first, then the caller's. A seal that took the
      // caller's account first and the owner's second deadlocked with a client wish being made (it takes the owner's, then writes a row
      // that needs the caller's account); the cause of the 500 on POST /v1/business/client-wishes under load.
      const carried = plan ? plan.businessId : (await tx.$queryRaw<{ businessId: string | null }[]>`SELECT "businessId"::text AS "businessId" FROM wish WHERE id = ${id}::uuid`)[0]?.businessId;
      if (carried) await lockBusinessOwner(tx, carried);
      await lockAccount(tx, accountId);
      await this.owned(tx, accountId, id, biz, viaOrder);
      const locked = await this.lifecycle.lock(tx, id);
      const w = await tx.wish.findUniqueOrThrow({ where: { id } });
      if (stateOf(locked) !== "draft") throw AppError.conflict("not_allowed", "Only a draft can be sealed.");
      if (input.version !== w.version) {
        throw new AppError(409, "stale_version", "This wish changed somewhere else. Load it again.", { version: String(w.version) });
      }
      if (plan && w.ticket) throw AppError.conflict("already_ticketed", "This wish already has a ticket, so nothing is drawn from the plan for it.");
      if (!w.ticket && !input.usePass && !plan && !viaOrder) throw new AppError(402, "payment_required", "Pay for this wish first.");
      const missing: Record<string, string> = {};
      if (!w.name?.trim()) missing.name = "Who is it for?";
      // IK1: an opening that asks for a secret is never sealed without one (it would open for anyone)
      const need = secretOpening(w.content);
      if (need && !w.passcodeHash) throw AppError.validation({ [SECRET_WORDS[need].field]: SECRET_WORDS[need].words }, SECRET_WORDS[need].words);
      if (!hasBody(w.content as Obj | null)) missing.content = "Write at least one part of the wish.";
      if (Object.keys(missing).length) throw AppError.validation(missing, "This wish is not ready to seal.");
      const now = this.clock.now();
      const zone = input.timeZone ?? w.timeZone;
      const opensAt = this.openTime(input, w, zone, now);
      if (plan) {
        if (!this.planSeal) throw new Error("the plan seal is not registered");
        await this.planSeal(tx, { wish: w, businessId: plan.businessId, opensAt, zone });
      } else if (viaOrder) {
        // HZ2: the order was paid for; a wish its maker makes in the buyer's name needs no ticket of its own and is given a Signature one
        if (!w.ticket) await this.fulfilTicketIn(tx, w.id, "signature");
      } else {
        await this.payForSeal(tx, accountId, w, input.usePass);
        // GB1: a wish that carries a business earns its creator at this seal too (it was drawn from the plan when it was made).
        if (w.businessId && this.sealAccrual) await this.sealAccrual(tx, w);
      }
      // HQ5: the style is checked against the ticket the seal REALLY ends with (a paid ticket, or the one a Pass, plan or pack just drew).
      // A refusal rolls the whole transaction back: nothing drawn, charged or sealed.
      const ended = await tx.wish.findUniqueOrThrow({ where: { id }, select: { kind: true, ticket: true, adds: true, styleSlug: true, styleTakenLevel: true } });
      if (!ended.styleSlug) throw AppError.validation({ style: "Choose a style before sealing." }, "Choose a style before sealing.");
      await this.checkStyleTaking(tx, book, { id, ...ended }, ended.styleSlug, true);
      await this.checkClips(tx, book, { id, ticket: ended.ticket, adds: ended.adds }); // IL1a
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
    await this.jobs.schedule("rest-wish", new Date(opensAt.getTime() + (await readLimits(tx)).unopenedDays * DAY), id, tx);
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
      const locked = await this.lifecycle.lock(tx, id);
      // IF4: a wish its owner removes carries the day it can be brought back until (the price book's days); when that day passes the erase job
      // erases it with its files (and a business's draft gives its draw back: the move to erased does that).
      const until = new Date(this.clock.now().getTime() + (await this.lifecycle.restoreDays(tx)) * DAY);
      await this.lifecycle.move(tx, locked, "taken_down", { cause: "owner.remove", data: { restorableUntil: until } });
      await this.jobs.schedule("restore-window-end", until, id, tx);
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
        // IF4: a removed wish comes back only inside its window (after it the wish is erased; a business's draft gives its draw back).
        if ((await this.lifecycle.restoreEnd(tx, id, last.createdAt)).getTime() <= this.clock.now().getTime()) {
          throw AppError.conflict("not_allowed", "The time to bring this wish back is over.");
        }
        await this.lifecycle.move(tx, w, to, { cause: "owner.restore" });
        await this.jobs.cancel("restore-window-end", id, tx);
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
