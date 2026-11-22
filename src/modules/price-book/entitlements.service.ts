import { Injectable } from "@nestjs/common";
import type { Entitlements as EntitlementsRow, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import type { Entitlements } from "../../contracts";

/** What one price-book line grants: photos, term days, style level, video, wishes, GB, credits, as the book holds them. */
export type Grant = Record<string, unknown> & { sku: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const has = (o: Obj, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k) && obj(o[k]) === o[k];

/**
 * What each line grants comes from the entitlements row of the price book, never from code. `for(sku)` is what the
 * fulfilment bundle calls once a payment is good; a line the book sells with no entitlement is an error, not a default.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly db: PrismaService) {}

  async row(db: PrismaService | Prisma.TransactionClient = this.db): Promise<EntitlementsRow> {
    const r = await db.entitlements.findFirst({ orderBy: { id: "desc" } });
    if (!r) throw new AppError(503, "price_book_missing", "The price book is not set up yet.");
    return r;
  }

  /** The entitlements row on the wire (public price book). */
  async wire(): Promise<Entitlements> {
    const r = await this.row();
    return {
      tickets: obj(r.tickets),
      keepsakeExtrasCeilingKobo: Number(r.keepsakeExtrasCeilingKobo),
      passWishes: r.passWishes,
      passUpgrades: r.passUpgrades,
      conciergePassDiscountPercent: r.conciergePassDiscountPercent,
      vatRate: r.vatRate,
      creator: obj(r.creator),
      pro: obj(r.pro),
    };
  }

  /** What `sku` grants. Throws when the book has no entitlement for it. */
  async for(sku: string): Promise<Grant> {
    const g = grantOf(await this.row(), sku);
    if (!g) throw new Error(`price book: no entitlement for ${sku}`);
    return g;
  }
}

/** IE1: the photos and voices one wish of a ticket holds, from the price book (the one place the number is read). */
export function ticketFileLimits(r: EntitlementsRow, slug: string): { photos: number; voices: number } {
  const g = grantOf(r, `ticket.${slug}`);
  if (!g) throw new Error(`price book: no entitlement for ticket.${slug}`);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { photos: num(g.photos) ?? 0, voices: num(g.voices) ?? num(g.friendMessagesMax) ?? 12 };
}

/** The grant for one sku from an entitlements row, or null when the row holds none. */
export function grantOf(r: EntitlementsRow, sku: string): Grant | null {
  const [group, name] = [sku.slice(0, sku.indexOf(".")), sku.slice(sku.indexOf(".") + 1)];
  if (!group || !name) return null;
  const tickets = obj(r.tickets);
  const pro = obj(r.pro);
  const creator = obj(r.creator);
  const pick = (o: Obj, k: string): Grant | null => (has(o, k) ? { sku, ...obj(o[k]) } : null);
  switch (group) {
    case "ticket":
      return ["extras", "keeps", "concierge"].includes(name) ? null : pick(tickets, name);
    case "extra":
      return pick(obj(tickets.extras), name);
    case "keep":
      return pick(obj(tickets.keeps), name);
    case "concierge":
      return pick(obj(tickets.concierge), name);
    case "pass":
      return name === "year"
        ? { sku, termDays: 365, wishes: r.passWishes, upgrades: r.passUpgrades, conciergeDiscountPercent: r.conciergePassDiscountPercent }
        : null;
    case "pro":
      return name === "vault" ? null : pick(pro, name);
    case "vault":
      return pick(obj(pro.vault), name);
    case "creator": {
      const key = { plan: "creator", signed: "signed", "credit-pack": "creditPack", "extra-review": "extraReview" }[name];
      return key ? pick(creator, key) : null;
    }
    default:
      return null;
  }
}
