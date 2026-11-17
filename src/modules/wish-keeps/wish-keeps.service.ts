import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { toWireInstant } from "../../common/time/time";
import type { GetWBySlugKeepByReferenceResponse, PostWBySlugKeepBody, PostWBySlugKeepResponse, PostWishesByIdKeepBody, PostWishesByIdKeepResponse, PublicWishView, Wish } from "../../contracts";
import { PriceBookService } from "../price-book/price-book.service";
import { FulfilmentRegistry } from "../payments/fulfilment.registry";
import { PaymentsService } from "../payments/payments.service";
import { PublicWishesService } from "../public-wishes/public-wishes.service";
import { holderKey, KeepProofs } from "../purchases/keep-proof";
import { HOUSE_WORDS, isHouseWish } from "../wishes/house";
import { endOf, PassCover } from "../purchases/pass-cover";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { REASON_TEXT } from "../purchases/wish-rules";
import { WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { WishesService } from "../wishes/wishes.service";
import { SHOWN_TO_BUYER } from "../wishes/wish-shown";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const KEEP_LENGTHS = ["month", "half", "year"] as const;
/** What a receiver sends to show they hold the wish's link: its slug (x-wish-link) and the link's own unlock token (x-unlock-token). */
export interface LinkHold {
  slug?: string;
  token?: string;
  address: string | null;
}
/** HS2: what a link holder with no account carries: the link (slug), its unlock token where there is a passcode, and the signed proof the public view gave. */
export interface LinkProof extends LinkHold {
  proof?: string;
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export type KeepLength = (typeof KEEP_LENGTHS)[number];

/**
 * Keeping a wish (E-228) and waking it (E-232). Keeping asks the payments start for the price book's keep line and answers its
 * payment; the keep handler of the purchases bundle moves the end when the payment settles (one way to move it). Waking is the
 * lifecycle's own move, resting to live, for a wish that already holds a keep covering now.
 */
@Injectable()
export class WishKeepsService implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly payments: PaymentsService,
    private readonly registry: FulfilmentRegistry,
    private readonly entitlements: EntitlementsService,
    private readonly lifecycle: WishLifecycleService,
    private readonly wishes: WishesService,
    private readonly links: PublicWishesService,
    private readonly proofs: KeepProofs,
    private readonly cover: PassCover,
    private readonly prices: PriceBookService,
  ) {}

  onModuleInit(): void {
    // HS2: the public view of a held link carries the wish's id, a signed proof and the keeps on offer
    this.links.useOffers((h) => this.offerFor(h));
    // CB1 for a keep: one open keep payment per payer for a wish (HU3: each payer has their own, so one payer never blocks another). The start holds
    // the payer's lock; the wish row lock below lines up the owner and the link holders, so two starts of one payer cannot both pass this.
    this.registry.onStart(async (accountId, request, skus, tx, _quote, holderEmail) => {
      if (request.purpose !== "keep" || !UUID.test(request.subjectId ?? "")) return;
      await tx.$queryRaw`SELECT id FROM wish WHERE id = ${request.subjectId}::uuid FOR UPDATE`;
      const mine = accountId ? { accountId } : { accountId: null, payerContact: (holderEmail ?? "").toLowerCase() };
      const open = await tx.payment.findFirst({
        where: { purpose: "keep", subjectId: request.subjectId, status: { in: ["pending", "started"] }, fulfilledAt: null, ...mine },
        orderBy: { id: "desc" },
        select: { id: true, lines: true },
      });
      if (!open) return;
      const sku = (Array.isArray(open.lines) ? (open.lines[0] as { sku?: string } | undefined) : undefined)?.sku;
      if (sku !== skus[0]) throw AppError.conflict("keep_payment_open", "A keep for this wish is waiting to be paid. Pay it, or try again when it has lapsed.");
      return { existingPaymentId: open.id };
    });
  }

  /** Month, half or year from the body: `keepKey`, `keep` or `days` (matched against the price book's terms). Two that disagree are 422. */
  private async lengthOf(body: PostWishesByIdKeepBody, required: boolean): Promise<KeepLength | null> {
    const book = await this.entitlements.row();
    const found = new Set<KeepLength>();
    const bad: Record<string, string> = {};
    const named = (field: string, v: unknown) => {
      if (v === undefined || v === null) return;
      if (typeof v === "string" && (KEEP_LENGTHS as readonly string[]).includes(v)) found.add(v as KeepLength);
      else bad[field] = "Must be month, half or year.";
    };
    named("keepKey", body.keepKey);
    named("keep", body.keep);
    if (body.days !== undefined && body.days !== null) {
      const hit = KEEP_LENGTHS.find((l) => grantOf(book, `keep.${l}`)?.termDays === body.days);
      if (hit) found.add(hit);
      else bad.days = "Must be the length of a month, half or year keep.";
    }
    if (Object.keys(bad).length) throw AppError.validation(bad);
    if (found.size === 0) {
      if (!required) return null;
      throw AppError.validation({ keepKey: "Choose month, half or year." });
    }
    if (found.size > 1) throw AppError.validation({ keepKey: "The length named twice does not agree." });
    return [...found][0];
  }

  /**
   * Who is asking about this wish: its owner, or (HA1) a signed-in person who holds its link (the slug in x-wish-link, and the link's
   * unlock token where the wish has a passcode). A guessed id with no link, a link that names another wish, and a wrong or switched-off
   * link are all the same 404.
   */
  private async who(accountId: string, id: string, link: LinkHold): Promise<{ owner: boolean; summary?: (state: string) => PublicWishView }> {
    if (await this.db.wish.findFirst({ where: { AND: [{ id, accountId }, SHOWN_TO_BUYER] }, select: { id: true } })) return { owner: true };
    if (!link.slug) throw AppError.notFound("No such wish.");
    const held = await this.links.holdLink(link.slug, { address: link.address, token: link.token });
    if (held.wishId !== id) throw AppError.notFound("No such wish.");
    return { owner: false, summary: held.summary };
  }

  /**
   * E-228. The owner, or a receiver who holds the link, asks. Where the owner holds a live Pass the keep is covered (HA2: payment
   * null, no payment row); anyone else pays: the price book's keep line, a payment of the asking account's own, and the keep handler
   * moves the wish's end when it settles. The receiver's answers carry the public view of the wish only.
   */
  async keep(accountId: string, wishId: string, body: PostWishesByIdKeepBody, idempotencyKey: string | undefined, link: LinkHold): Promise<{ answer: PostWishesByIdKeepResponse; status: 200 | 201 }> {
    if (!UUID.test(wishId)) throw AppError.notFound("No such wish.");
    if (body.wishId !== undefined && body.wishId.toLowerCase() !== wishId.toLowerCase()) throw AppError.validation({ wishId: "Must be the wish in the address." });
    const id = wishId.toLowerCase();
    const length = await this.lengthOf(body, false);
    const who = await this.who(accountId, id, link);
    await this.assertKeepable(id);
    if (who.owner) {
      const covered = await this.db.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        return this.cover.apply(tx, accountId, id);
      });
      if (covered) return { answer: { payment: null, item: (await this.wishes.get(accountId, id)) as unknown as Wish }, status: 200 };
    }
    if (!length) throw AppError.validation({ keepKey: "Choose month, half or year." });
    const options = who.owner ? undefined : { receiverProof: this.proofs.issue(accountId, id) };
    const r = await this.payments.start(accountId, { purpose: "keep", id: length, subjectId: id, way: body.paymentWay, options }, idempotencyKey);
    let item: Wish | null = null;
    if (r.started.payment.state === "succeeded") {
      const fresh = await this.db.wish.findUniqueOrThrow({ where: { id }, select: { status: true, erasedAt: true } });
      item = who.owner ? ((await this.wishes.get(accountId, id)) as unknown as Wish) : (who.summary?.(stateOf(fresh)) as unknown as Wish);
    }
    return { answer: { payment: r.started.payment, item }, status: r.status };
  }

  /**
   * E-232: the owner, or a receiver who holds the link, wakes a resting wish. It needs a paid keep that covers now, or (the owner
   * only, HA2) a live Pass. The move is the lifecycle's own, resting to live, in one transaction.
   */
  async wake(accountId: string, wishId: string, bodyWishId: string | undefined, link: LinkHold): Promise<void> {
    if (!UUID.test(wishId)) throw AppError.notFound("No such wish.");
    if (bodyWishId !== undefined && bodyWishId.toLowerCase() !== wishId.toLowerCase()) throw AppError.validation({ wishId: "Must be the wish in the address." });
    const id = wishId.toLowerCase();
    const who = await this.who(accountId, id, link);
    await this.assertNotHouse(id);
    await this.wakeNow(accountId, id, who.owner);
  }

  /** The wake itself, for an owner or a receiver: `lockId` is the account lock that lines the moves up (a link holder with no account uses the wish owner's). */
  private async wakeNow(lockId: string, id: string, owner: boolean): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, lockId);
      const locked = await this.lifecycle.lock(tx, id);
      if (stateOf(locked) !== "resting") throw AppError.conflict("not_allowed", "Only a resting wish can be woken.");
      const now = this.clock.now();
      // HB1: the end is worked out by applyEnd; here only whether something that this asker may use covers now
      const r = await endOf(tx, id, { now });
      const paid = r.keepsEnd && r.keepsEnd.getTime() > now.getTime();
      const pass = owner && r.passEnd && r.passEnd.getTime() > now.getTime();
      if (!paid && !pass) throw new AppError(402, "keep_needed", "Keep this wish for a month, six months or a year to wake it.");
      await this.cover.applyEnd(tx, id, { wake: true, cause: pass ? "pass.cover" : owner ? "owner.wake" : "receiver.wake" });
    });
  }

  private async assertNotHouse(id: string): Promise<void> {
    if (await isHouseWish(this.db, id)) throw AppError.conflict("house_wish", HOUSE_WORDS);
  }

  /** The public view's word for where a wish stands: live is "open". */
  private viewState(state: string): string {
    return state === "live" ? "open" : state;
  }

  /** A wish that may be kept now: live or resting, not erased or taken down, on a ticket the price book lets be kept. */
  private async assertKeepable(id: string): Promise<void> {
    const w = await this.db.wish.findUnique({ where: { id }, select: { id: true, status: true, erasedAt: true, ticket: true } });
    if (!w) throw AppError.notFound("No such wish.");
    // HU2: a house wish is the house's: it is never kept or woken
    if (await isHouseWish(this.db, id)) throw AppError.conflict("house_wish", HOUSE_WORDS);
    const state = stateOf(w);
    if (state === "erased") throw AppError.conflict("wish_erased", REASON_TEXT.wish_erased);
    if (state === "taken_down") throw AppError.conflict("wish_removed", REASON_TEXT.wish_removed);
    if (state !== "live" && state !== "resting") throw AppError.conflict("wish_not_live", REASON_TEXT.wish_not_live);
    if (grantOf(await this.entitlements.row(), `ticket.${w.ticket ?? "moment"}`)?.keepable !== true) {
      throw AppError.conflict("ticket_not_keepable", "A Moment cannot be kept. Make it a Keepsake first, and it can be kept.");
    }
  }

  /**
   * HS2: what the public view of a held link gives a keep or wake start: the wish's id, the proof the link's holder signs with (it names this
   * link and this wish), and the keeps on offer with their price book prices. A wish whose ticket cannot be kept offers nothing.
   */
  private async offerFor(h: { wishId: string; linkId: string; resting: boolean }): Promise<Record<string, unknown> | null> {
    if (await isHouseWish(this.db, h.wishId)) return null;
    const w = await this.db.wish.findUnique({ where: { id: h.wishId }, select: { ticket: true } });
    const book = await this.entitlements.row();
    if (grantOf(book, `ticket.${w?.ticket ?? "moment"}`)?.keepable !== true) return null;
    // a view is never refused for want of a price: with no price book in force there is simply no offer
    const quote = await this.prices.quote(KEEP_LENGTHS.map((l) => ({ sku: `keep.${l}` })), this.clock.now()).catch(() => null);
    if (!quote) return null;
    const given = this.proofs.issueHold(h.linkId, h.wishId);
    return {
      wishId: h.wishId,
      proof: given.proof,
      proofExpiresAt: toWireInstant(given.expiresAt),
      resting: h.resting,
      wake: h.resting,
      keeps: quote.lines.map((l) => ({ key: l.sku.slice("keep.".length), name: l.name, days: grantOf(book, l.sku)?.termDays ?? null, priceKobo: l.unitKobo })),
    };
  }

  /** HS2: the holder of a link with no account: the link (and its unlock) lets them in, and the signed proof of THIS link and wish must be good. Else 403. */
  private async holder(slug: string, hold: LinkProof): Promise<{ wishId: string; linkId: string; summary: (state: string) => PublicWishView }> {
    const held = await this.links.holdLink(slug, { address: hold.address, token: hold.token });
    if (!this.proofs.validHold(hold.proof, held.linkId, held.wishId)) throw new AppError(403, "proof_needed", "Open this wish's link again, then keep or wake it from there.");
    return held;
  }

  /** HU1: the email a link holder's receipt goes to. It is kept on the payment only: no Account is made or read by it. */
  private emailOf(email: unknown): string {
    const e = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!EMAIL.test(e)) throw AppError.validation({ email: "Give the email the receipt should go to." });
    return e;
  }

  /**
   * HS2: a keep (or, on a resting wish, a wake: the keep wakes it when it is paid) started by the holder of the wish's link with no account.
   * The payment is for the wish and carries the holder's proof, with the payer's email on the payment row only, priced by the price book; the answer carries the public view of the wish only.
   */
  async keepByLink(slug: string, body: PostWBySlugKeepBody, idempotencyKey: string | undefined, hold: LinkProof): Promise<{ answer: PostWBySlugKeepResponse; status: 200 | 201 }> {
    const length = await this.lengthOf(body, true);
    this.emailOf(body.email);
    const held = await this.holder(slug, hold);
    const id = held.wishId;
    await this.assertKeepable(id);
    const email = this.emailOf(body.email);
    const options = { receiverProof: this.proofs.issue(holderKey(email), id) };
    const r = await this.payments.start(null, { purpose: "keep", id: length as KeepLength, subjectId: id, way: body.paymentWay, options }, idempotencyKey, { wishId: id, email });
    return { answer: { payment: r.started.payment, item: held.summary(this.viewState(stateOf(await this.db.wish.findUniqueOrThrow({ where: { id }, select: { status: true, erasedAt: true } })))) }, status: r.status };
  }

  /** HS2: the result of a link holder's keep payment, read back with the same proof (the payment must be a guest payment for this wish). */
  async keepResult(slug: string, reference: string, hold: LinkProof): Promise<GetWBySlugKeepByReferenceResponse> {
    const held = await this.holder(slug, hold);
    const payment = await this.payments.verifyHeld(held.wishId, reference);
    const fresh = await this.db.wish.findUniqueOrThrow({ where: { id: held.wishId }, select: { status: true, erasedAt: true } });
    return { payment: payment as unknown as GetWBySlugKeepByReferenceResponse["payment"], item: held.summary(this.viewState(stateOf(fresh))) };
  }

  /** HS2: the holder with no account wakes a resting wish that a paid keep covers now (a Pass covers only its owner). */
  async wakeByLink(slug: string, hold: LinkProof): Promise<void> {
    const held = await this.holder(slug, hold);
    await this.assertNotHouse(held.wishId);
    const owner = await this.db.wish.findUniqueOrThrow({ where: { id: held.wishId }, select: { accountId: true } });
    await this.wakeNow(owner.accountId, held.wishId, false);
  }
}

