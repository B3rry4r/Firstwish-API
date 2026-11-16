import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { lockAccount } from "../../common/db/account-lock";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import type { PostWishesByIdKeepBody, PostWishesByIdKeepResponse, PublicWishView, Wish } from "../../contracts";
import { FulfilmentRegistry } from "../payments/fulfilment.registry";
import { PaymentsService } from "../payments/payments.service";
import { JobsService } from "../jobs/jobs.service";
import { PublicWishesService } from "../public-wishes/public-wishes.service";
import { KeepProofs } from "../purchases/keep-proof";
import { PassCover } from "../purchases/pass-cover";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { REASON_TEXT } from "../purchases/wish-rules";
import { NOTICE_DAYS, WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { WishesService } from "../wishes/wishes.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
export const KEEP_LENGTHS = ["month", "half", "year"] as const;
/** What a receiver sends to show they hold the wish's link: its slug (x-wish-link) and the link's own unlock token (x-unlock-token). */
export interface LinkHold {
  slug?: string;
  token?: string;
  address: string | null;
}
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
    private readonly jobs: JobsService,
    private readonly links: PublicWishesService,
    private readonly proofs: KeepProofs,
    private readonly cover: PassCover,
  ) {}

  onModuleInit(): void {
    // CB1 for a keep: one open keep payment per wish. The start holds the account lock, so two starts cannot both pass this.
    this.registry.onStart(async (accountId, request, skus, tx) => {
      if (request.purpose !== "keep" || !UUID.test(request.subjectId ?? "")) return;
      // the wish row is locked first: the owner and a receiver are two accounts with two account locks, and this lock is what lines them up
      await tx.$queryRaw`SELECT id FROM wish WHERE id = ${request.subjectId}::uuid FOR UPDATE`;
      const open = await tx.payment.findFirst({
        where: { purpose: "keep", subjectId: request.subjectId, status: { in: ["pending", "started"] }, fulfilledAt: null },
        orderBy: { id: "desc" },
        select: { id: true, accountId: true, lines: true },
      });
      if (!open) return;
      const sku = (Array.isArray(open.lines) ? (open.lines[0] as { sku?: string } | undefined) : undefined)?.sku;
      // another payer's open keep is never answered to this one (their payment and checkout are theirs)
      if (open.accountId !== accountId || sku !== skus[0]) throw AppError.conflict("keep_payment_open", "A keep for this wish is waiting to be paid. Pay it, or try again when it has lapsed.");
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
    if (await this.db.wish.findFirst({ where: { id, accountId }, select: { id: true } })) return { owner: true };
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
    const w = await this.db.wish.findUnique({ where: { id }, select: { id: true, status: true, erasedAt: true, ticket: true } });
    if (!w) throw AppError.notFound("No such wish.");
    const state = stateOf(w);
    if (state === "erased") throw AppError.conflict("wish_erased", REASON_TEXT.wish_erased);
    if (state === "taken_down") throw AppError.conflict("wish_removed", REASON_TEXT.wish_removed);
    if (state !== "live" && state !== "resting") throw AppError.conflict("wish_not_live", REASON_TEXT.wish_not_live);
    if (grantOf(await this.entitlements.row(), `ticket.${w.ticket ?? "moment"}`)?.keepable !== true) {
      throw AppError.conflict("ticket_not_keepable", "A Moment cannot be kept. Make it a Keepsake first, and it can be kept.");
    }
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
    await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const locked = await this.lifecycle.lock(tx, id);
      if (stateOf(locked) !== "resting") throw AppError.conflict("not_allowed", "Only a resting wish can be woken.");
      const now = this.clock.now();
      const row = await tx.wish.findUniqueOrThrow({ where: { id }, select: { keptBy: true, keptUntil: true } });
      const paid = row.keptBy === "keep" && row.keptUntil && row.keptUntil.getTime() > now.getTime() ? row.keptUntil : null;
      const pass = who.owner ? await this.cover.liveUntil(tx, accountId) : null;
      if (pass && (!paid || pass.getTime() > paid.getTime())) {
        await this.cover.apply(tx, accountId, id);
        return;
      }
      if (!paid) throw new AppError(402, "keep_needed", "Keep this wish for a month, six months or a year to wake it.");
      await this.lifecycle.move(tx, locked, "live", { cause: who.owner ? "owner.wake" : "receiver.wake", data: { endsAt: paid, restingSince: null, eraseAfter: null } });
      await this.jobs.cancel("erase-wish", id, tx);
      await this.jobs.cancel("restore-window-end", id, tx);
      await this.jobs.schedule("rest-wish", paid, id, tx);
      const notice = new Date(paid.getTime() - NOTICE_DAYS * DAY_MS);
      if (notice.getTime() > now.getTime()) await this.jobs.schedule("send-notice", notice, id, tx);
      else await this.jobs.cancel("send-notice", id, tx);
    });
  }
}
