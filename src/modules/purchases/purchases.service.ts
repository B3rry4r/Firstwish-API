import { Injectable, OnModuleInit } from "@nestjs/common";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { EntitlementsService } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import { FulfilmentRegistry, type FulfilmentContext, type PaymentRequestInfo } from "../payments/fulfilment.registry";
import { BusinessHandlers } from "./business-handlers";
import { CreatorHandlers } from "./creator-handlers";
import { GrantStore, type GrantRow, type Tx } from "./grants";
import { holderKey, KeepProofs } from "./keep-proof";
import { PassService } from "./pass.service";
import { WishHandlers } from "./wish-handlers";
import { VideoRenderer } from "../render-jobs/video-renderer";
import { assessExtra, assessKeep, assessTicket, assessTicketStyle, readWish, REASON_TEXT, NOT_SOLD_WORDS, unsoldLines } from "./wish-rules";
import { canMove } from "../concierge/order-state";
import { hiddenFromBuyer } from "../wishes/wish-shown";
import { IdGenerator } from "../../common/ports/ids.port";
import { releaseOrderFiles } from "../stored-files/order-files";
import { ERASE_WISH_FILE_PREFIX, WishLifecycleService } from "../wishes/wish-lifecycle.service";
import type { JobContext } from "../jobs/jobs.service";

/**
 * Every line the price book sells, by its sku. A new line in the book needs its sku here (a test walks the seeded book and fails
 * when one has no handler or no entitlement), and a payment for a line nobody registered fails its whole settle, so it retries.
 */
export const SOLD_SKUS = {
  ticket: ["ticket.moment", "ticket.keepsake", "ticket.signature", "ticket.premiere"],
  extra: ["extra.five-photos", "extra.premium-style", "extra.portrait-video", "extra.qr-card", "extra.clip-15s", "extra.clip-60s"],
  keep: ["keep.month", "keep.half", "keep.year"],
  pass: ["pass.year"],
  plan: ["pro.starter", "pro.studio"],
  pack: ["pro.pack"],
  vault: ["vault.block", "vault.block-bulk"],
  creator: ["creator.plan", "creator.signed", "creator.credit-pack", "creator.extra-review"],
  concierge: ["concierge.single"],
} as const;

export interface RevokeResult {
  sku: string;
  kind: string;
  /** "revoked", or why nothing was taken back ("kept_wish_is_sealed", "refused_line"...). */
  result: string;
}

/**
 * The fulfilment handlers (B07), registered with the payments frame at boot, and the way back for a refund (B08): revoke(tx, payment).
 * Each handler runs in the settle transaction it is given, claims its purchase_grant row first (a repeat finds it and changes nothing),
 * locks the row it changes, and never reads the phone or the system clock: the clock port gives every term.
 */
@Injectable()
export class PurchasesService implements OnModuleInit {
  constructor(
    private readonly registry: FulfilmentRegistry,
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly store: GrantStore,
    private readonly wish: WishHandlers,
    private readonly pass: PassService,
    private readonly business: BusinessHandlers,
    private readonly creator: CreatorHandlers,
    private readonly entitlements: EntitlementsService,
    private readonly book: PriceBookService,
    private readonly video: VideoRenderer,
    private readonly proofs: KeepProofs,
    private readonly ids: IdGenerator,
    private readonly lifecycle: WishLifecycleService,
  ) {}

  onModuleInit(): void {
    const on = (skus: readonly string[], h: (c: FulfilmentContext) => Promise<void>) => skus.forEach((s) => this.registry.register(s, h));
    on(SOLD_SKUS.ticket, (c) => this.wish.ticket(c));
    on(SOLD_SKUS.extra, (c) => this.wish.extra(c));
    on(SOLD_SKUS.keep, (c) => this.wish.keep(c));
    on(SOLD_SKUS.pass, (c) => this.pass.fulfil(c));
    on(SOLD_SKUS.plan, (c) => this.business.plan(c));
    on(SOLD_SKUS.pack, (c) => this.business.pack(c));
    on(SOLD_SKUS.vault, (c) => this.business.vault(c));
    on(SOLD_SKUS.creator, (c) => this.creator.fulfil(c));
    on(SOLD_SKUS.concierge, (c) => this.concierge(c));
    // GG3: the payments frame asks at start what can never be granted (assertStartable)
    this.registry.onStart((accountId, request, skus, tx, _quote, holderEmail) => this.assertStartable(accountId ?? (holderEmail ? holderKey(holderEmail) : null), request, skus, tx));
  }

  /** Concierge: the order is B19's. This records that the payment for it was good (the order id the buyer named), nothing more. */
  private async concierge(ctx: FulfilmentContext): Promise<void> {
    const grantId = await this.store.claim(ctx.tx, ctx, "concierge");
    if (!grantId) return;
    const g = await ctx.grant();
    await this.store.record(ctx.tx, grantId, { orderId: ctx.request.subjectId ?? ctx.payment.subjectId ?? null, gives: g });
  }

  /**
   * Takes back what a payment granted (the refund path, B08), inside the refund's transaction. A line already taken back, or one that
   * was refused at the start, changes nothing. What cannot be undone (a ticket on a wish that is sealed) is kept and says so.
   */
  async revoke(tx: Tx, payment: Pick<Payment, "id">, released?: string[]): Promise<RevokeResult[]> {
    const out: RevokeResult[] = [];
    const grants = await this.store.list(tx, payment.id);
    const alone = this.extrasAlone(grants);
    for (const g of grants) {
      if (g.revokedAt) {
        out.push({ sku: g.sku, kind: g.kind, result: "already_revoked" });
        continue;
      }
      if (g.refusedReason) {
        out.push({ sku: g.sku, kind: g.kind, result: "refused_line" });
        continue;
      }
      // IJ3: the money is back (the provider refunded it), but an extra a held style still needs stays on the wish, and the note says so
      const result = alone && (await this.wish.premiumExtraBlock(tx, g)) ? "kept_style_needs_extra" : await this.revokeOne(tx, g, released);
      if (result === "revoked") await this.store.markRevoked(tx, g.id);
      out.push({ sku: g.sku, kind: g.kind, result });
    }
    return out;
  }

  /** IJ3: a payment of extras only (a whole purchase that holds a ticket or a keep follows the whole-refund rules as before). */
  private extrasAlone(grants: GrantRow[]): boolean {
    return grants.filter((g) => !g.revokedAt && !g.refusedReason).every((g) => g.kind === "extra");
  }

  /** IJ3: words that refuse starting a refund of this payment (the premium-style extra on its own while the wish holds a style that needs it), or null. */
  async refundBlock(tx: Tx, paymentId: string): Promise<string | null> {
    const grants = await this.store.list(tx, paymentId);
    if (!this.extrasAlone(grants)) return null;
    for (const g of grants) {
      if (g.revokedAt || g.refusedReason) continue;
      const why = await this.wish.premiumExtraBlock(tx, g);
      if (why) return why;
    }
    return null;
  }

  private revokeOne(tx: Tx, g: GrantRow, released?: string[]): Promise<string> {
    switch (g.kind) {
      case "ticket":
      case "extra":
      case "keep":
        return this.wish.revoke(tx, g);
      case "concierge":
        return this.releaseOrderFiles(tx, g, released);
      case "pass":
        return this.pass.revoke(tx, g);
      case "pro-plan":
      case "wish-pack":
      case "vault-space":
        return this.business.revoke(tx, g);
      case "creator":
        return this.creator.revoke(tx, g);
      default:
        return Promise.resolve("revoked");
    }
  }

  /**
   * A refund of a Concierge order released its files inside the refund's transaction (their rows are marked deleted and one cleanup job each is queued).
   * Once that transaction has committed the stored objects go at once, by the same step the job runs (so the next sweep finds nothing left to do).
   * A storage failure leaves the queued job to do it; the refund is already recorded.
   */
  async removeReleasedObjects(fileIds: readonly string[]): Promise<void> {
    for (const id of fileIds) {
      try {
        await this.lifecycle.eraseWishFileJob({ subjectId: `${ERASE_WISH_FILE_PREFIX}${id}` } as JobContext);
      } catch {
        // the queued upload-cleanup job removes it
      }
    }
  }

  /**
   * IC7, IE3: a refunded Concierge payment: the order will not go ahead. It reads as refunded (not paid), the wish half made for it goes with it (the buyer never
   * saw it), and the files the buyer gave with it go. An order already delivered stays delivered; one staff cancelled stays cancelled.
   */
  private async releaseOrderFiles(tx: Tx, g: GrantRow, released?: string[]): Promise<string> {
    const orderId = g.detail.orderId;
    if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return "revoked";
    const now = this.clock.now();
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM concierge_order WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (rows[0] && canMove(rows[0].status as never, "refunded")) {
      await tx.$executeRaw`UPDATE concierge_order SET status = 'refunded', "updatedAt" = ${now} WHERE id = ${orderId}::uuid`;
      const half = await tx.wish.findMany({ where: { conciergeOrderId: orderId, erasedAt: null, conciergeOrderWishByWish: null }, select: { id: true } });
      for (const w of half) {
        const locked = await this.lifecycle.lock(tx, w.id);
        if (locked.status === "draft") await this.lifecycle.move(tx, locked, "taken_down", { cause: "order.refund" });
        await this.lifecycle.move(tx, await this.lifecycle.lock(tx, w.id), "erased", { cause: "order.refund" });
      }
    }
    await releaseOrderFiles(tx, this.ids, orderId, now, { keepUsed: false, released });
    return "revoked";
  }

  /**
   * At START (E-87, quote time): the checks that decide a ticket, extra or keep can never be granted, so the buyer is told before paying
   * (422 with the field) and not after. The same rules run again at fulfilment. Lines of other kinds pass.
   */
  async assertStartable(accountId: string | null, request: PaymentRequestInfo, skus: string[], db: PrismaService | Tx = this.db): Promise<void> {
    const sku = skus[0] ?? "";
    const group = sku.slice(0, sku.indexOf("."));
    // IK3a: with no renderer nothing whose entitlements include the portrait video is sold: 409, words, no payment, no provider call. Before any other check, for every line.
    const notSold = unsoldLines(await this.entitlements.row(db), this.video.configured());
    const unsold = skus.find((s) => notSold.has(s));
    if (unsold) {
      if (unsold === "extra.portrait-video") throw new AppError(409, "extra_not_sold", REASON_TEXT.extra_not_sold, { extra: "portrait-video" });
      throw new AppError(409, "extra_not_sold", NOT_SOLD_WORDS, { line: unsold });
    }
    if (!["ticket", "extra", "keep"].includes(group)) return;
    const wishId = request.subjectId;
    if (!wishId) throw AppError.validation({ subjectId: "Name the wish this is for." });
    if (!accountId) throw AppError.validation({ subjectId: "Name one of your own wishes." });
    // IC4: a wish being made for a Concierge order is not the buyer's to pay for until it is delivered
    const w = (await hiddenFromBuyer(db, wishId)) ? null : await readWish(db, wishId);
    const book = await this.entitlements.row(db);
    let why: string | null;
    if (group === "ticket") why = assessTicket(w, accountId, sku.slice("ticket.".length));
    else if (group === "keep") why = assessKeep(w, accountId, book, this.proofs.valid(request.options?.receiverProof, accountId, wishId, true));
    else {
      const lines = new Map((await this.book.versionAt(this.clock.now(), db)).lines.map((l) => [l.sku, l.listKobo]));
      why = assessExtra(w, accountId, sku, book, (s) => lines.get(s) ?? 0n, notSold);
      // IK3: 409 with its own code, so the app can tell "not on sale" from a wish that cannot take it
      if (why === "extra_not_sold") throw new AppError(409, "extra_not_sold", REASON_TEXT.extra_not_sold, { extra: sku.slice("extra.".length) });
    }
    // GG3: the app sells no paid upgrade, so a ticket line for a wish that already has a ticket (paid or from the Pass) is refused at start
    if (!why && group === "ticket" && w?.ticket) why = "wish_has_ticket";
    if (why) throw AppError.validation({ subjectId: REASON_TEXT[why] ?? "This cannot be bought for this wish." });
    // IJ2: a ticket for a wish whose style is off, made for another kind or above this ticket's level is refused at start, with the rule in words
    if (group === "ticket" && w) {
      const styleWhy = await assessTicketStyle(db, w, sku.slice("ticket.".length), book);
      if (styleWhy) throw AppError.validation({ subjectId: styleWhy.words }, styleWhy.words);
    }
  }
}
