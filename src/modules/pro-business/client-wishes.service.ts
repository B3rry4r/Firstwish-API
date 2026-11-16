import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ClientWish, PostBusinessClientWishesBody } from "../../contracts";
import { lockBusinessOwner } from "../../common/db/account-lock";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { decodeCursor, Page, toPage } from "../../common/pagination/cursor";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { BusinessHandlers } from "../purchases/business-handlers";
import type { Tx } from "../purchases/grants";
import { clientWishWire } from "./client-wish-wire";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX = 80;
const OCCASIONS = ["Staff birthday", "Work anniversary"];

interface NewWish {
  client: string;
  kind: string;
  occasion: string;
  day: string;
  key?: string;
}

/**
 * A business's wishes for its clients (E-29 to E-32). A wish is made by the owner or a live login; it counts one wish against the
 * business in the SAME transaction that writes it (BusinessHandlers.draw: the month's allowance first, a pack after), so a wish
 * that cannot be counted is not made. Everything runs under the owner's account lock (AA1), which also lines up 20 requests at once.
 * A lapsed plan changes nothing already made: the rows stay and play to the end of their terms; a new wish then draws from the pack.
 */
@Injectable()
export class ClientWishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly handlers: BusinessHandlers,
  ) {}

  async list(businessId: string, cursor: string | undefined, limit: number): Promise<Page<ClientWish>> {
    let before = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!isUuidV7(c.id)) throw AppError.validation({ cursor: "Must be a cursor from a previous page." });
      before = c.id;
    }
    const rows = await this.prisma.clientWish.findMany({ where: { businessId, id: { lt: before } }, orderBy: { id: "desc" }, take: limit + 1 });
    const page = toPage(rows, limit, (r) => ({ key: r.id, id: r.id }));
    return { items: page.items.map(clientWishWire), nextCursor: page.nextCursor };
  }

  async get(businessId: string, id: string): Promise<ClientWish> {
    if (!UUID.test(id)) throw AppError.notFound();
    const r = await this.prisma.clientWish.findFirst({ where: { id, businessId } });
    if (!r) throw AppError.notFound();
    return clientWishWire(r);
  }

  private read(body: PostBusinessClientWishesBody): NewWish {
    const fields: ErrorFields = {};
    const client = (typeof body.client === "string" ? body.client : "").trim().replace(/\s+/g, " ");
    if (!client || client.length > NAME_MAX) fields.client = `Must be the client's name, 1 to ${NAME_MAX} characters.`;
    const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
    if (!SLUG.test(kind)) fields.kind = "Use the kind's own name, letters, numbers and dashes.";
    const occasion = typeof body.occasion === "string" ? body.occasion.trim() : "";
    if (!occasion || occasion.length > 60) fields.occasion = "Must be the occasion, up to 60 characters.";
    const day = typeof body.day === "string" ? body.day.trim() : "";
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) fields.day = "Must be a date like 2027-03-04.";
    if (Array.isArray(body.reveal) ? body.reveal.length > 0 : body.reveal !== undefined) fields.reveal = "A reveal is sent from a shoot in the Vault, not made here.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    return { client, kind, occasion, day };
  }

  /** E-30: make one wish for a client. 402 when the business has nothing left to count it against. */
  async create(businessId: string, body: PostBusinessClientWishesBody): Promise<ClientWish> {
    const w = this.read(body);
    return this.prisma.$transaction((tx) => this.make(tx, businessId, w));
  }

  /** The wish row and its draw, in the caller's transaction (the owner's account is locked first). */
  private async make(tx: Tx, businessId: string, w: NewWish): Promise<ClientWish> {
    await lockBusinessOwner(tx, businessId);
    if (w.key) {
      const again = await tx.clientWish.findFirst({ where: { businessId, key: w.key } });
      if (again) return clientWishWire(again);
    }
    const from = await this.handlers.draw(tx, businessId);
    if (!from) throw await this.nothingLeft(tx, businessId);
    const next = await tx.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(max(no::int), 900) + 1 AS n FROM client_wish WHERE "businessId" = ${businessId}::uuid AND no ~ '^[0-9]{1,9}$'`;
    const no = String(next[0]?.n ?? 901).padStart(4, "0");
    const id = this.ids.id();
    const now = this.clock.now();
    const row = await tx.clientWish.create({
      data: {
        id, businessId, createdAt: now, sentAt: now, client: w.client, kind: w.kind, occasion: w.occasion, day: new Date(`${w.day}T00:00:00Z`), from, no,
        key: w.key ?? `cw-${no}`, wish: "", shoot: "", hearts: [] as Prisma.InputJsonArray, madeOwn: false,
      },
    });
    return clientWishWire(row);
  }

  /** 402 naming what to buy: a wish pack always; a plan too when there is none or it has lapsed. */
  private async nothingLeft(tx: Tx, businessId: string): Promise<AppError> {
    const u = await this.handlers.read(tx, businessId);
    if (u?.live) return new AppError(402, "no_wishes", "You have used this month's wishes. Buy a wish pack to make more, or wait for next month.");
    return new AppError(402, "no_wishes", "You have no wishes left. Buy a wish pack or a Pro plan to make more.");
  }

  /**
   * E-32: approve a person's date (a staff birthday or work anniversary): the date is approved and one wish is made for it, counted
   * like any other. `:id` is the person; the key names the date (`<person>:b|s:<year>`). The same key twice answers the first wish.
   */
  async approveDate(businessId: string, personId: string, body: { client: string; day: string; key: string; occasion: unknown }): Promise<ClientWish> {
    if (!UUID.test(personId)) throw AppError.notFound();
    const occasion = typeof body.occasion === "string" ? body.occasion : "";
    const fields: ErrorFields = {};
    if (!OCCASIONS.includes(occasion)) fields.occasion = "Must be Staff birthday or Work anniversary.";
    if (typeof body.key !== "string" || !new RegExp(`^${personId}:[bs]:\\d{4}$`, "i").test(body.key)) fields.key = "Must name this person's date.";
    if (Object.keys(fields).length) throw AppError.validation(fields);
    const w = { ...this.read({ client: body.client, day: body.day, kind: "teams", occasion }), key: body.key.toLowerCase() };
    return this.prisma.$transaction(async (tx) => {
      await lockBusinessOwner(tx, businessId);
      const person = await tx.person.findFirst({ where: { id: personId, businessId }, select: { id: true } });
      if (!person) throw AppError.notFound();
      const made = await this.make(tx, businessId, w);
      await tx.$executeRaw`INSERT INTO approved_date (id, "businessId", key) VALUES (${this.ids.id()}::uuid, ${businessId}::uuid, ${w.key}) ON CONFLICT ("businessId", key) DO NOTHING`;
      return made;
    });
  }
}
