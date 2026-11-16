import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { lockAccount } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { toWireInstant } from "../../common/time/time";
import type { QrCard } from "../../contracts";
import { EntitlementsService } from "../price-book/entitlements.service";
import { ServerFileWriter } from "../server-files/server-files";
import { wishHas } from "../wish-extras/wish-extras";
import { cardSvg } from "./card-svg";
import { Inject } from "@nestjs/common";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CARD_WISHES = 24;
const MAX_NAME = 80;

/** The QR card (B19): a print-ready file made on the server that carries each wish's link. */
@Injectable()
export class QrCardsService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly entitlements: EntitlementsService,
    private readonly files: ServerFileWriter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E-141. 404 for a wish that is not the caller's, 402 when a wish does not have the card. The same ask gives the same card. */
  async make(accountId: string, body: { wishId?: string; wishIds?: string[]; names?: string[] }, forOrder = false): Promise<QrCard> {
    const asked = body.wishIds?.length ? body.wishIds : body.wishId ? [body.wishId] : [];
    if (!asked.length) throw AppError.validation({ wishIds: "Name the wish." });
    if (asked.length > MAX_CARD_WISHES) throw AppError.validation({ wishIds: `A card holds up to ${MAX_CARD_WISHES} wishes.` });
    const wishIds = [...new Set(asked.map((w) => String(w).trim().toLowerCase()))];
    if (wishIds.some((w) => !UUID.test(w))) throw AppError.notFound();
    const names = (body.names ?? []).map((n) => n.trim());
    if (names.length > wishIds.length) throw AppError.validation({ names: "One name for each wish at most." });
    if (names.some((n) => n.length > MAX_NAME)) throw AppError.validation({ names: `Each name is ${MAX_NAME} characters or fewer.` });
    const kind = wishIds.length === 1 ? "wish_card" : "table_card";
    const key = [...wishIds].sort();

    const made = await this.db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      // the owner check is the query: a wish that is not the caller's reads as missing
      const wishes = await tx.wish.findMany({
        where: { id: { in: wishIds }, accountId, erasedAt: null, removedAt: null },
        select: { id: true, ticket: true, adds: true },
      });
      if (wishes.length !== wishIds.length) throw AppError.notFound();
      await tx.$queryRaw`SELECT id FROM wish WHERE id = ANY(${key}::uuid[]) ORDER BY id FOR UPDATE`;
      const book = await this.entitlements.row(tx);
      // an order's card is part of the order (the maker makes it), so the wish need not carry the card itself
      if (!forOrder && wishes.some((w) => !wishHas(book, w, "qrCard"))) throw new AppError(402, "payment_required", "This wish needs the QR card. Get the card to print it.");
      const links = await tx.wishLink.findMany({ where: { wishId: { in: wishIds }, active: true }, orderBy: { id: "asc" } });
      const slugOf = new Map<string, string>();
      for (const l of links) if (!slugOf.has(l.wishId)) slugOf.set(l.wishId, l.slug);
      if (wishIds.some((w) => !slugOf.has(w))) throw AppError.conflict("wish_has_no_link", "This wish has no link yet. Seal it first.");
      const base = this.env.PUBLIC_SITE_URL.replace(/\/+$/, "");
      const entries = wishIds.map((w, i) => ({ url: `${base}/w/${slugOf.get(w)}`, name: names[i] || null }));
      const same = await tx.qrCard.findMany({ where: { kind, wishIds: { equals: wishIds }, names: names.length ? { equals: names } : { equals: Prisma.DbNull } }, orderBy: { id: "desc" }, take: 5 });
      const mine = same.find((c) => c.status !== "failed") ?? same[0];
      if (mine && mine.status !== "failed") return { id: mine.id, entries, run: false };
      if (mine) {
        await tx.qrCard.update({ where: { id: mine.id }, data: { status: "queued" } });
        return { id: mine.id, entries, run: true };
      }
      const id = this.ids.id();
      await tx.qrCard.create({
        data: { id, wishId: wishIds[0], kind, status: "queued", wishIds, names: names.length ? names : Prisma.DbNull, createdAt: this.clock.now() },
      });
      return { id, entries, run: true };
    });
    if (made.run) await this.render(accountId, made.id, made.entries);
    const row = await this.db.qrCard.findUniqueOrThrow({ where: { id: made.id } });
    return this.wire(row);
  }

  /**
   * E-141 for a maker: the wishes must all be wishes delivered for orders given to this maker (the owner: any order), and of one
   * buyer; any other wish reads as missing (404). The file is that buyer's.
   */
  async makeForOrder(who: { staffId: string; all: boolean }, body: { wishId?: string; wishIds?: string[]; names?: string[] }): Promise<QrCard> {
    const asked = body.wishIds?.length ? body.wishIds : body.wishId ? [body.wishId] : [];
    if (!asked.length) throw AppError.validation({ wishIds: "Name the wish." });
    const wishIds = [...new Set(asked.map((w) => String(w).trim().toLowerCase()))];
    if (wishIds.some((w) => !UUID.test(w))) throw AppError.notFound();
    const maker = who.all ? Prisma.empty : Prisma.sql`AND o."makerId" = ${who.staffId}::uuid`;
    const rows = await this.db.$queryRaw<{ wishId: string; accountId: string }[]>`
      SELECT DISTINCT l."wishId"::text AS "wishId", o."accountId"::text AS "accountId"
        FROM concierge_order_wish l JOIN concierge_order o ON o.id = l."orderId"
       WHERE l."wishId" = ANY(${wishIds}::uuid[]) AND o.status = 'delivered' ${maker}`;
    const accounts = new Set(rows.map((r) => r.accountId));
    if (new Set(rows.map((r) => r.wishId)).size !== wishIds.length || accounts.size !== 1) throw AppError.notFound();
    return this.make([...accounts][0], body, true);
  }

  /** The file is made and stored outside the database transaction (Y4); the row then says done, or failed with a way to ask again. */
  private async render(accountId: string, id: string, entries: { url: string; name: string | null }[]): Promise<void> {
    try {
      const svg = cardSvg(entries);
      const fileId = await this.files.write({ ownerAccountId: accountId, purpose: "qr-card", contentType: "image/svg+xml", bytes: Buffer.from(svg, "utf8"), kind: "image" });
      await this.db.qrCard.updateMany({ where: { id, status: "queued" }, data: { status: "done", fileId } });
    } catch {
      await this.db.qrCard.updateMany({ where: { id, status: "queued" }, data: { status: "failed" } });
    }
  }

  private wire(r: { id: string; kind: string; status: string; fileId: string | null; eventId: string | null; wishIds: string[]; names: Prisma.JsonValue | null; createdAt: Date }): QrCard {
    return {
      createdAt: toWireInstant(r.createdAt),
      eventId: r.eventId,
      fileId: r.fileId,
      id: r.id,
      kind: r.kind === "table_card" ? "table-card" : "wish-card",
      names: Array.isArray(r.names) ? r.names : [],
      status: r.status as QrCard["status"],
      wishIds: r.wishIds,
    };
  }
}
