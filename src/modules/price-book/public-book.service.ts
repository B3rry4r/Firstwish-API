import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, toPage } from "../../common/pagination/cursor";
import type { GetPriceBookQuery, LifecycleConfig, PriceBook, TicketOfferState, TicketQuote } from "../../contracts";
import type { Principal } from "../../common/auth/principal";
import { notInBusiness, removedFromBusiness, loginRemoved } from "../../common/auth/login-removed";
import { EntitlementsService, grantOf } from "./entitlements.service";
import { PriceBookService, safe } from "./price-book.service";
import { readLimits } from "./book-limits";
import { readPayoutSetting } from "./payout-setting";
import { priceOf, promotionOf } from "./price-view";
import { NOT_SOLD_WORDS, TICKET_ORDER, unsoldLines } from "../purchases/wish-rules";
import { VideoRenderer } from "../render-jobs/video-renderer";
import { PurchasesService } from "../purchases/purchases.service";

/**
 * GET /v1/price-book: the version in force now, its lines (price now and list price), the promotion while it runs, the
 * lifecycle terms (DEC-70) and the entitlements. The list shape is the registry's; version, promotion, lifecycle and
 * entitlements ride beside it.
 */
export type PublicBook = PriceBook;

@Injectable()
export class PublicBookService {
  constructor(
    private readonly db: PrismaService,
    private readonly book: PriceBookService,
    private readonly entitlements: EntitlementsService,
    private readonly modules: ModuleRef,
  ) {}

  async read(q: GetPriceBookQuery): Promise<{ body: PublicBook; maxAgeSeconds: number }> {
    const at = this.book.now();
    const book = await this.book.versionAt(at);
    const ent = await this.entitlements.row();
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = q.cursor ? String(decodeCursor(q.cursor).key) : null;
    const deliveryHours = (await readLimits(this.db)).conciergeDeliveryHours;
    const lines = after === null ? book.lines : book.lines.filter((l) => l.sku > after);
    const page = toPage(lines.slice(0, limit + 1), limit, (l) => ({ key: l.sku, id: l.id }));
    const promo = PriceBookService.promotionAt(book, at);
    const body: PublicBook = {
      items: page.items.map((l) => priceOf(l, { at, book, grant: grantOf(ent, l.sku), public: true, deliveryHours })),
      nextCursor: page.nextCursor,
      version: book.version,
      promotion: promo ? promotionOf(promo) : null,
      lifecycle: await this.lifecycle(),
      entitlements: await this.entitlements.wire(),
      payout: await readPayoutSetting(this.db),
    };
    // A cache may keep the answer for a minute, never past the promotion's end: then the price changes.
    const untilEnd = promo ? Math.floor((promo.endsAt.getTime() - at.getTime()) / 1000) : 60;
    return { body, maxAgeSeconds: Math.max(0, Math.min(60, untilEnd)) };
  }

  private async lifecycle(): Promise<LifecycleConfig | null> {
    const r = await this.db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
    if (!r) return null;
    const { id: _id, KEEPS, keepsakeExtrasCeiling, ...rest } = r; // rest carries photoMaxBytes, soundMaxBytes, modelMaxBytes, conciergeDeliveryHours and unopenedDays (HW6)
    return {
      ...rest,
      KEEPS: KEEPS === null ? null : safe(KEEPS),
      keepsakeExtrasCeiling: keepsakeExtrasCeiling === null ? null : safe(keepsakeExtrasCeiling),
    } as unknown as LifecycleConfig;
  }

  /* ---------------- TicketQuote (E-213, X13) ---------------- */

  /**
   * E-213 as the route answers it. Without `wish` it is the business side's, as before (a person with no business side is 403, a removed login says so). With `wish` any
   * signed-in person reads it for their own wish (another's is 404), `ticket` is optional, and the quote carries `tickets` (only then): for each ticket whether it can be bought now
   * and the server's words when not (IL3). The quote's lines are the named ticket's; with none named, the Moment ticket's.
   */
  async offers(p: Principal | undefined, q: { ticket?: string; extras?: string[]; wish?: string }, businessHeader: string | string[] | undefined): Promise<TicketQuote> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    const accountId = p.accountId;
    if (q.wish === undefined) {
      if (!p.sides.includes("business")) throw await notInBusiness(this.db, accountId, "Forbidden.");
      if (await removedFromBusiness(this.db, accountId, businessHeader)) throw loginRemoved();
    }
    if (q.ticket === undefined && (q.wish === undefined || (q.extras ?? []).length > 0)) throw AppError.validation({ ticket: "Name the ticket." });
    const wishId = q.wish === undefined ? null : q.wish.trim().toLowerCase();
    if (wishId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(wishId)) throw AppError.notFound("No such wish.");
    if (wishId === null) return this.quoteTicket(q.ticket as string, q.extras ?? []);
    const states = await this.modules.get(PurchasesService, { strict: false }).ticketStates(accountId, wishId);
    const at = this.book.now();
    const b = await this.book.versionAt(at);
    const tickets: TicketOfferState[] = [];
    const order = (sku: string): number => TICKET_ORDER.indexOf(sku.slice("ticket.".length) as (typeof TICKET_ORDER)[number]);
    for (const l of b.lines.filter((x) => x.sku.startsWith("ticket.") && order(x.sku) >= 0).sort((x, y) => order(x.sku) - order(y.sku))) {
      const no = states.get(l.sku) ?? null;
      tickets.push({ ticket: l.sku, name: l.name, canBuy: no === null, reason: no?.reason ?? null, words: no?.words ?? null, priceKobo: safe(PriceBookService.chargedAt(l, at)), listKobo: safe(l.listKobo) });
    }
    const quote = await this.quoteTicket(q.ticket ?? "ticket.moment", q.extras ?? []);
    return { ...quote, tickets };
  }

  /**
   * What a ticket plus extras costs now: ONE quote from the book (never from the request), through quote(). An unknown line,
   * an extra named twice, an extra the ticket does not take, or a Keepsake past its extras ceiling is 422 with the field.
   */
  async quoteTicket(ticketSku: string, extraSkus: string[]): Promise<TicketQuote> {
    const at = this.book.now();
    const b = await this.book.versionAt(at);
    const ent = await this.entitlements.row();
    const ticket = b.lines.find((l) => l.sku === ticketSku && l.sku.startsWith("ticket."));
    const fields: Record<string, string> = {};
    if (!ticket) fields.ticket = "Not a ticket in the price book.";
    // IK3a: the ticket step reads this: a ticket that includes the portrait video is not available while no renderer is configured (the same words and code as the start)
    const renderer = this.modules.get(VideoRenderer, { strict: false });
    const notSold = unsoldLines(ent, renderer.configured());
    if (ticket && notSold.has(ticket.sku)) throw new AppError(409, "extra_not_sold", NOT_SOLD_WORDS, { ticket: ticketSku });
    const seen = new Set<string>();
    const extras = extraSkus.map((s, i) => {
      const l = b.lines.find((x) => x.sku === s && x.sku.startsWith("extra."));
      if (!l) fields[`extras[${i}]`] = "Not an extra in the price book.";
      else if (seen.has(s)) fields[`extras[${i}]`] = "Named twice.";
      seen.add(s);
      return l;
    });
    if (Object.keys(fields).length || !ticket) throw AppError.validation(fields);
    // N2: an unsold extra answers like the payment start (same 409, same words); the contract's quote has no "not available" field, so no wire change
    const unsoldExtra = extraSkus.find((s) => notSold.has(s));
    if (unsoldExtra) throw new AppError(409, "extra_not_sold", NOT_SOLD_WORDS, { extra: unsoldExtra });
    const grant = grantOf(ent, ticket.sku) ?? { sku: ticket.sku };
    const takes = Array.isArray(grant.takes) ? (grant.takes as unknown[]).filter((x): x is string => typeof x === "string") : [];
    extras.forEach((e, i) => {
      if (e && !takes.includes(e.sku)) fields[`extras[${i}]`] = `${ticket.name} does not take ${e.name}.`;
    });
    if (!Object.keys(fields).length && ticket.sku === "ticket.keepsake") {
      const listSum = extras.reduce((s, e) => s + (e ? e.listKobo : 0n), 0n);
      if (listSum > ent.keepsakeExtrasCeilingKobo) fields.extras = "Too many extras for a Keepsake.";
    }
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const q = await this.book.quote([{ sku: ticket.sku }, ...extraSkus.map((sku) => ({ sku }))], at, { version: b.version });
    return { version: q.version, versionId: q.versionId, lines: q.lines, totalKobo: q.totalKobo, listTotalKobo: q.listTotalKobo };
  }
}
