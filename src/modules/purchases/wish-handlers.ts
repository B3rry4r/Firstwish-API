import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { EntitlementsService } from "../price-book/entitlements.service";
import { PriceBookService } from "../price-book/price-book.service";
import { EventsService } from "../events/events.service";
import type { FulfilmentContext } from "../payments/fulfilment.registry";
import { JobsService } from "../jobs/jobs.service";
import { NOTICE_DAYS, WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { addDays, DAY_MS, GrantStore, num, type GrantRow, type Tx } from "./grants";
import { assessExtra, assessKeep, assessTicket, readWish, TICKET_ORDER, type WishFacts } from "./wish-rules";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
type TicketName = (typeof TICKET_ORDER)[number];

/** The ticket, the extras and the keeps: what a payment does to one wish. Every handler runs in the payment's own transaction. */
@Injectable()
export class WishHandlers {
  constructor(
    private readonly store: GrantStore,
    private readonly lifecycle: WishLifecycleService,
    private readonly entitlements: EntitlementsService,
    private readonly book: PriceBookService,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
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
    await tx.wish.update({ where: { id: w.id }, data: { ticket, version: { increment: 1 } } });
    await this.store.record(tx, grantId, { wishId: w.id, ticket, previousTicket: w.ticket, termDays: num(grant.termDays), photos: num(grant.photos) });
    await tx.$executeRaw`UPDATE purchase_grant SET "wishId" = ${w.id}::uuid WHERE id = ${grantId}::uuid`;
    await this.paidInStyle(tx, ctx, w.id);
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
    await tx.$executeRaw`UPDATE purchase_grant SET "wishId" = ${w.id}::uuid WHERE id = ${grantId}::uuid`;
  }

  async keep(ctx: FulfilmentContext): Promise<void> {
    const { tx, line } = ctx;
    const grantId = await this.store.claim(tx, ctx, "keep", { wishId: ctx.request.subjectId });
    if (!grantId) return;
    const length = line.sku.slice("keep.".length) as "month" | "half" | "year";
    const w = await this.lockWish(tx, ctx);
    const why = assessKeep(w, ctx.payment.accountId, await this.entitlements.row(tx));
    if (why || !w) return this.store.refuse(tx, ctx, grantId, why ?? "wish_not_payers");
    const days = num((await ctx.grant()).termDays);
    const now = this.clock.now();
    const before = await tx.wish.findUniqueOrThrow({ where: { id: w.id }, select: { keep: true, keptUntil: true, keptBy: true } });
    const resting = w.state === "resting";
    // From its end while it is showing; a resting wish wakes now (E-232). Two keeps at once queue on the wish row: the second adds to the first.
    const from = resting || !w.endsAt || w.endsAt.getTime() < now.getTime() ? now : w.endsAt;
    const endsAt = addDays(from, days);
    const data = { endsAt, keep: length, keptUntil: endsAt, keptBy: "keep" as const };
    if (resting) {
      const locked = await this.lifecycle.lock(tx, w.id);
      await this.lifecycle.move(tx, locked, "live", { cause: "purchase.keep", data: { ...data, restingSince: null, eraseAfter: null } });
      await this.jobs.cancel("erase-wish", w.id, tx);
      await this.jobs.cancel("restore-window-end", w.id, tx);
    } else {
      await tx.wish.update({ where: { id: w.id }, data: { ...data, version: { increment: 1 } } });
    }
    await this.jobs.schedule("rest-wish", endsAt, w.id, tx);
    const notice = addDays(endsAt, -NOTICE_DAYS);
    if (notice.getTime() > now.getTime()) await this.jobs.schedule("send-notice", notice, w.id, tx);
    else await this.jobs.cancel("send-notice", w.id, tx);
    await this.store.record(
      tx,
      grantId,
      { wishId: w.id, length, days, from: from.toISOString(), endsAt: endsAt.toISOString(), wasResting: resting, previousEndsAt: w.endsAt?.toISOString() ?? null,
        previousKeep: before.keep, previousKeptUntil: before.keptUntil?.toISOString() ?? null, previousKeptBy: before.keptBy },
      endsAt,
    );
    await tx.$executeRaw`UPDATE purchase_grant SET "wishId" = ${w.id}::uuid WHERE id = ${grantId}::uuid`;
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
    if (g.kind === "keep" && w.endsAt) {
      const endsAt = new Date(w.endsAt.getTime() - num(d.days) * DAY_MS);
      await tx.wish.update({ where: { id: w.id }, data: { endsAt, keptUntil: endsAt, version: { increment: 1 } } });
      await this.jobs.schedule("rest-wish", endsAt, w.id, tx);
      return "revoked";
    }
    return "nothing_granted";
  }
}
