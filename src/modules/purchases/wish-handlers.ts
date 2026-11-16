import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { EntitlementsService } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import { EventsService } from "../events/events.service";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { RoyaltiesService } from "../royalties/royalties.service";
import { WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { WishesService } from "../wishes/wishes.service";
import { holderKey, KeepProofs } from "./keep-proof";
import { PassCover } from "./pass-cover";
import { GrantStore, num, type GrantRow, type Tx } from "./grants";
import { assessExtra, assessKeep, assessTicket, readWish, TICKET_ORDER, type WishFacts } from "./wish-rules";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
type TicketName = (typeof TICKET_ORDER)[number];

/**
 * The ticket, the extras and the keeps: what a payment does to one wish. Every handler runs in the payment's own transaction. The
 * ticket is given by the wish bundle's fulfilTicketIn (GG2): one way to give a wish its ticket.
 */
@Injectable()
export class WishHandlers {
  constructor(
    private readonly store: GrantStore,
    private readonly lifecycle: WishLifecycleService,
    private readonly entitlements: EntitlementsService,
    private readonly book: PriceBookService,
    private readonly events: EventsService,
    private readonly wishes: WishesService,
    private readonly royalties: RoyaltiesService,
    private readonly proofs: KeepProofs,
    private readonly cover: PassCover,
  ) {}

  /** Locks the wish the payment names (a missing one or one that is no uuid is null) and reads it under that lock. */
  private async lockWish(tx: Tx, ctx: FulfilmentContext): Promise<WishFacts | null> {
    const id = ctx.request.subjectId ?? ctx.payment.subjectId;
    try {
      await this.lifecycle.lock(tx, typeof id === "string" ? id : "");
    } catch (e) {
      if (e instanceof AppError) return null;
      throw e;
    }
    return readWish(tx, id);
  }

  async ticket(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "ticket", { wishId: ctx.request.subjectId });
    if (!grantId) return;
    const ticket = line.sku.slice("ticket.".length) as TicketName;
    const w = await this.lockWish(tx, ctx);
    const why = assessTicket(w, ctx.payment.accountId, ticket);
    if (why || !w) return this.store.refuse(tx, ctx, grantId, why ?? "wish_not_payers");
    const grant = await ctx.grant();
    await this.wishes.fulfilTicketIn(tx, w.id, ticket);
    await this.store.record(tx, grantId, { wishId: w.id, ticket, previousTicket: w.ticket, termDays: num(grant.termDays), photos: num(grant.photos) });
    await this.store.nameWish(tx, grantId, w.id);
    await this.paidInStyle(tx, ctx, w.id);
    // WW2: a wish paid in a creator's Premium style earns the creator, in this same settle transaction.
    await this.royalties.accrue(tx, ctx.payment);
  }

  /** The "paid in a style" event of a ticket line: the settle wrote it by the request's style; this adds the wish and its own style. */
  private async paidInStyle(tx: Tx, ctx: FulfilmentContext, wishId: string): Promise<void> {
    const row = await tx.wish.findUniqueOrThrow({ where: { id: wishId }, select: { styleSlug: true } });
    const style = SLUG.test(row.styleSlug) ? row.styleSlug : null;
    await this.events.record(
      { name: "paid", key: ctx.payment.providerReference, accountId: ctx.payment.accountId, wishId, styleSlug: style, amountKobo: ctx.payment.amountKobo, line: "tickets" },
      tx,
    );
    await tx.$executeRaw`
      UPDATE event SET "wishId" = ${wishId}::uuid, "styleSlug" = COALESCE("styleSlug", ${style})
       WHERE name = 'paid' AND key = ${ctx.payment.providerReference} AND "accountId" IS NOT DISTINCT FROM ${ctx.payment.accountId}::uuid`;
  }

  async extra(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "extra", { wishId: ctx.request.subjectId });
    if (!grantId) return;
    const w = await this.lockWish(tx, ctx);
    const book = await this.entitlements.row(tx);
    const lines = new Map((await this.book.load(ctx.payment.priceBookVersion, tx)).lines.map((l) => [l.sku, l.listKobo]));
    const why = assessExtra(w, ctx.payment.accountId, line.sku, book, (s) => lines.get(s) ?? 0n);
    if (why || !w) return this.store.refuse(tx, ctx, grantId, why ?? "wish_not_payers");
    const grant = await ctx.grant();
    await tx.wish.update({ where: { id: w.id }, data: { adds: [...w.adds, line.sku], version: { increment: 1 } } });
    await this.store.record(tx, grantId, { wishId: w.id, extra: line.sku, ticket: w.ticket, gives: grant });
    await this.store.nameWish(tx, grantId, w.id);
    await this.royalties.accrue(tx, ctx.payment);
  }

  async keep(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "keep", { wishId: ctx.request.subjectId });
    if (!grantId) return;
    const length = line.sku.slice("keep.".length) as "month" | "half" | "year";
    const w = await this.lockWish(tx, ctx);
    const payer = ctx.payment.accountId ?? (ctx.payment.payerContact ? holderKey(ctx.payment.payerContact) : null);
    const byLink = this.proofs.valid(ctx.request.options?.receiverProof, payer, w?.id ?? null, false);
    const why = assessKeep(w, payer, await this.entitlements.row(tx), byLink);
    if (why || !w) return this.store.refuse(tx, ctx, grantId, why ?? "wish_not_payers");
    // HU3: a keep paid for the same wish and term while this one waited has already done the work (the first to settle keeps or wakes): this one is refund due
    // (another payer's: one payer cannot have two keeps open at once, so a payer's own later keep stacks as before)
    const other = ctx.payment.accountId ? { OR: [{ accountId: null }, { accountId: { not: ctx.payment.accountId } }] } : { OR: [{ accountId: { not: null } }, { payerContact: { not: ctx.payment.payerContact } }] };
    const first = await tx.purchaseGrant.findFirst({ where: { wishId: w.id, kind: "keep", sku: line.sku, revokedAt: null, refusedReason: null, id: { not: grantId }, createdAt: { gte: ctx.payment.createdAt }, payment: other }, select: { id: true } });
    if (first) return this.store.refuse(tx, ctx, grantId, "keep_already_paid");
    const days = num((await ctx.grant()).termDays);
    const before = await tx.wish.findUniqueOrThrow({ where: { id: w.id }, select: { keep: true, keptUntil: true, keptBy: true, endsAt: true } });
    // the grant row holds the length and days (and its claim time is the moment bought); the end is worked out from the rows (HB1)
    await this.store.record(tx, grantId, { wishId: w.id, length, days, wasResting: w.state === "resting", previousEndsAt: before.endsAt?.toISOString() ?? null, previousKeep: before.keep, previousKeptUntil: before.keptUntil?.toISOString() ?? null, previousKeptBy: before.keptBy });
    await this.store.nameWish(tx, grantId, w.id);
    const end = await this.cover.applyEnd(tx, w.id, { wake: true, cause: "purchase.keep" });
    await tx.purchaseGrant.update({ where: { id: grantId }, data: { endsAt: end } });
  }

  /** A refund takes the ticket back while the wish is still a draft; a keep takes its days off the end; an extra comes off the list. */
  async revoke(tx: Tx, g: GrantRow): Promise<string> {
    if (!g.wishId) return "nothing_granted";
    try {
      await this.lifecycle.lock(tx, g.wishId);
    } catch {
      return "wish_gone";
    }
    const w = await readWish(tx, g.wishId);
    if (!w || w.state === "erased") return "wish_gone";
    const d = g.detail;
    if (g.kind === "ticket") {
      if (w.ticket !== d.ticket || w.state !== "draft") return "kept_wish_is_sealed";
      const prev = typeof d.previousTicket === "string" ? (d.previousTicket as TicketName) : null;
      await tx.wish.update({ where: { id: w.id }, data: { ticket: prev, version: { increment: 1 } } });
      return "revoked";
    }
    if (g.kind === "extra") {
      const i = w.adds.lastIndexOf(String(d.extra));
      if (i < 0) return "revoked";
      const adds = w.adds.filter((_, k) => k !== i);
      await tx.wish.update({ where: { id: w.id }, data: { adds, version: { increment: 1 } } });
      return "revoked";
    }
    if (g.kind === "keep") {
      // HH4, HB1: the end, keep, keptBy and keptUntil are worked out again from the keeps that remain (this one left out)
      await this.cover.applyEnd(tx, w.id, { except: g.id });
      return "revoked";
    }
    return "nothing_granted";
  }
}
