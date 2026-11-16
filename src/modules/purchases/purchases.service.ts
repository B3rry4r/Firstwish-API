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
import { KeepProofs } from "./keep-proof";
import { PassService } from "./pass.service";
import { WishHandlers } from "./wish-handlers";
import { assessExtra, assessKeep, assessTicket, readWish, REASON_TEXT } from "./wish-rules";

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
    private readonly proofs: KeepProofs,
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
    this.registry.onStart((accountId, request, skus, tx) => this.assertStartable(accountId, request, skus, tx));
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
  async revoke(tx: Tx, payment: Pick<Payment, "id">): Promise<RevokeResult[]> {
    const out: RevokeResult[] = [];
    for (const g of await this.store.list(tx, payment.id)) {
      if (g.revokedAt) {
        out.push({ sku: g.sku, kind: g.kind, result: "already_revoked" });
        continue;
      }
      if (g.refusedReason) {
        out.push({ sku: g.sku, kind: g.kind, result: "refused_line" });
        continue;
      }
      const result = await this.revokeOne(tx, g);
      if (result === "revoked") await this.store.markRevoked(tx, g.id);
      out.push({ sku: g.sku, kind: g.kind, result });
    }
    return out;
  }

  private revokeOne(tx: Tx, g: GrantRow): Promise<string> {
    switch (g.kind) {
      case "ticket":
      case "extra":
      case "keep":
        return this.wish.revoke(tx, g);
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
   * At START (E-87, quote time): the checks that decide a ticket, extra or keep can never be granted, so the buyer is told before paying
   * (422 with the field) and not after. The same rules run again at fulfilment. Lines of other kinds pass.
   */
  async assertStartable(accountId: string, request: PaymentRequestInfo, skus: string[], db: PrismaService | Tx = this.db): Promise<void> {
    const sku = skus[0] ?? "";
    const group = sku.slice(0, sku.indexOf("."));
    if (!["ticket", "extra", "keep"].includes(group)) return;
    const wishId = request.subjectId;
    if (!wishId) throw AppError.validation({ subjectId: "Name the wish this is for." });
    const w = await readWish(db, wishId);
    const book = await this.entitlements.row(db);
    let why: string | null;
    if (group === "ticket") why = assessTicket(w, accountId, sku.slice("ticket.".length));
    else if (group === "keep") why = assessKeep(w, accountId, book, this.proofs.valid(request.options?.receiverProof, accountId, wishId, true));
    else {
      const lines = new Map((await this.book.versionAt(this.clock.now(), db)).lines.map((l) => [l.sku, l.listKobo]));
      why = assessExtra(w, accountId, sku, book, (s) => lines.get(s) ?? 0n);
    }
    // GG3: the app sells no paid upgrade, so a ticket line for a wish that already has a ticket (paid or from the Pass) is refused at start
    if (!why && group === "ticket" && w?.ticket) why = "wish_has_ticket";
    if (why) throw AppError.validation({ subjectId: REASON_TEXT[why] ?? "This cannot be bought for this wish." });
  }
}
