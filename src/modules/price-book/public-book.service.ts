import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { decodeCursor, DEFAULT_LIMIT, toPage } from "../../common/pagination/cursor";
import type { Entitlements, GetPriceBookQuery, GetTicketOffersQuery, GetTicketOffersResponse, LifecycleConfig, Price, Promotion, TicketOffer } from "../../contracts";
import { EntitlementsService, grantOf } from "./entitlements.service";
import { BookVersion, PriceBookService, safe } from "./price-book.service";
import { priceOf, promotionOf } from "./price-view";

/**
 * GET /v1/price-book: the version in force now, its lines (price now and list price), the promotion while it runs, the
 * lifecycle terms (DEC-70) and the entitlements. The list shape is the registry's; version, promotion, lifecycle and
 * entitlements ride beside it.
 */
export interface PublicBook {
  items: Price[];
  nextCursor: string | null;
  version: number;
  promotion: Promotion | null;
  lifecycle: LifecycleConfig | null;
  entitlements: Entitlements;
}

@Injectable()
export class PublicBookService {
  constructor(
    private readonly db: PrismaService,
    private readonly book: PriceBookService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async read(q: GetPriceBookQuery): Promise<{ body: PublicBook; maxAgeSeconds: number }> {
    const at = this.book.now();
    const book = await this.book.versionAt(at);
    const ent = await this.entitlements.row();
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = q.cursor ? String(decodeCursor(q.cursor).key) : null;
    const lines = after === null ? book.lines : book.lines.filter((l) => l.sku > after);
    const page = toPage(lines.slice(0, limit + 1), limit, (l) => ({ key: l.sku, id: l.id }));
    const promo = PriceBookService.promotionAt(book, at);
    const body: PublicBook = {
      items: page.items.map((l) => priceOf(l, { at, book, grant: grantOf(ent, l.sku) })),
      nextCursor: page.nextCursor,
      version: book.version,
      promotion: promo ? promotionOf(promo) : null,
      lifecycle: await this.lifecycle(),
      entitlements: await this.entitlements.wire(),
    };
    // A cache may keep the answer for a minute, never past the promotion's end: then the price changes.
    const untilEnd = promo ? Math.floor((promo.endsAt.getTime() - at.getTime()) / 1000) : 60;
    return { body, maxAgeSeconds: Math.max(0, Math.min(60, untilEnd)) };
  }

  private async lifecycle(): Promise<LifecycleConfig | null> {
    const r = await this.db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
    if (!r) return null;
    const { id: _id, KEEPS, keepsakeExtrasCeiling, ...rest } = r;
    return {
      ...rest,
      KEEPS: KEEPS === null ? null : safe(KEEPS),
      keepsakeExtrasCeiling: keepsakeExtrasCeiling === null ? null : safe(keepsakeExtrasCeiling),
    } as unknown as LifecycleConfig;
  }

  /* ---------------- TicketOffer ---------------- */

  /**
   * What a ticket plus extras costs now, from the book (never from the request): the ticket's price now plus each extra's
   * price now. An unknown line is 422. An extra the ticket does not take, or a Keepsake past its extras ceiling, is ok:false
   * with the reason.
   */
  async offerFor(ticketSku: string, extraSkus: string[], book?: BookVersion): Promise<TicketOffer & { adds: Record<string, unknown> }> {
    const at = this.book.now();
    const b = book ?? (await this.book.versionAt(at));
    const ent = await this.entitlements.row();
    const ticket = b.lines.find((l) => l.sku === ticketSku && l.sku.startsWith("ticket."));
    const fields: Record<string, string> = {};
    if (!ticket) fields.ticket = "Not a ticket in the price book.";
    const extras = extraSkus.map((s, i) => {
      const l = b.lines.find((x) => x.sku === s && x.sku.startsWith("extra."));
      if (!l) fields[`extras[${i}]`] = "Not an extra in the price book.";
      return l;
    });
    if (Object.keys(fields).length || !ticket) throw AppError.validation(fields);
    const grant = grantOf(ent, ticket.sku) ?? { sku: ticket.sku };
    const takes = Array.isArray(grant.takes) ? (grant.takes as unknown[]).filter((x): x is string => typeof x === "string") : [];
    let why = "";
    const notTaken = extras.find((e) => e && !takes.includes(e.sku));
    if (notTaken) why = `${ticket.name} does not take ${notTaken.name}.`;
    const extrasList = extras.reduce((s, e) => s + (e ? e.listKobo : 0n), 0n);
    if (!why && ticket.sku === "ticket.keepsake" && extrasList > ent.keepsakeExtrasCeilingKobo) why = "Too many extras for a Keepsake.";
    const now = (l: NonNullable<(typeof extras)[number]>) => PriceBookService.chargedAt(l, at);
    const total = PriceBookService.chargedAt(ticket, at) + extras.reduce((s, e) => s + (e ? now(e) : 0n), 0n);
    const was = ticket.listKobo + extrasList;
    return {
      ok: why === "",
      why,
      total: safe(total),
      was: safe(was),
      adds: {
        ticket: ticket.sku,
        name: ticket.name,
        version: b.version,
        extras: extras.map((e) => ({ sku: e!.sku, name: e!.name, now: safe(now(e!)), was: safe(e!.listKobo) })),
        takes: takes
          .map((s) => b.lines.find((l) => l.sku === s))
          .filter((l): l is NonNullable<typeof l> => !!l)
          .map((l) => ({ sku: l.sku, name: l.name, now: safe(PriceBookService.chargedAt(l, at)), was: safe(l.listKobo) })),
      },
    };
  }

  /** E-213: each ticket's offer from the book, with the extras it takes and their prices now. */
  async ticketOffers(q: GetTicketOffersQuery): Promise<GetTicketOffersResponse> {
    const book = await this.book.versionAt(this.book.now());
    const tickets = book.lines.filter((l) => l.sku.startsWith("ticket.")).sort((a, b) => Number(a.listKobo - b.listKobo));
    const limit = q.limit ?? DEFAULT_LIMIT;
    const after = q.cursor ? String(decodeCursor(q.cursor).key) : null;
    const start = after === null ? 0 : tickets.findIndex((t) => t.sku === after) + 1;
    if (after !== null && start === 0) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
    const slice = tickets.slice(start, start + limit + 1);
    const offers = await Promise.all(slice.map((t) => this.offerFor(t.sku, [], book)));
    return toPage(offers, limit, (o) => ({ key: String(o.adds.ticket), id: String(o.adds.ticket) }));
  }
}
