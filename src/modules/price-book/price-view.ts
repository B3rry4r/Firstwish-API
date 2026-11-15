import type { Promotion as PromotionRow, PriceBookVersion as VersionRow } from "@prisma/client";
import { toWireInstant } from "../../common/time/time";
import type { Price, PriceBookVersion, Promotion } from "../../contracts";
import type { Grant } from "./entitlements.service";
import { lastDayInLagos } from "./price-math";
import { BookLine, BookVersion, PriceBookService, safe } from "./price-book.service";

/** The two setting lines staff change through the same book. */
export const PROMOTION_KEY = "promotion.endsAt";
export const PAYOUT_KEY = "payout.thresholdKobo";

export interface LineContext {
  at: Date;
  book: BookVersion;
  grant?: Grant | null;
  changed?: boolean;
  reason?: string;
}

const groupOf = (sku: string) => sku.slice(0, Math.max(0, sku.indexOf("."))) || sku;
const num = (v: unknown): number => (typeof v === "number" && Number.isSafeInteger(v) ? v : 0);

/**
 * A line on the wire. price and value are what one costs at `at`; listKobo and was the list price; promoKobo the promoted
 * price (null on a line the promotion never covers). Fields of the shared Price shape that belong to other screens and that
 * the book has no answer for are empty ("" or 0).
 */
export function priceOf(line: BookLine, ctx: LineContext): Price {
  const charged = safe(PriceBookService.chargedAt(line, ctx.at));
  const single = ctx.book.lines.find((l) => l.sku === "concierge.single");
  return {
    key: line.sku,
    sku: line.sku,
    name: line.name,
    title: line.name,
    group: groupOf(line.sku),
    kind: "naira",
    price: charged,
    value: charged,
    listKobo: safe(line.listKobo),
    was: safe(line.listKobo),
    promoKobo: line.promoKobo === null ? null : safe(line.promoKobo),
    discountable: line.discountable,
    vatIncluded: line.vatIncluded,
    version: line.version,
    per: "",
    from: `price-book v${line.version}`,
    lead: "",
    sla: "",
    reason: ctx.reason ?? "",
    items: ctx.grant ? [ctx.grant] : [],
    conciergeDeliveryHours: num(ctx.grant?.deliveryHours),
    conciergeSingleWish: single ? safe(PriceBookService.chargedAt(single, ctx.at)) : 0,
    changed: ctx.changed ?? false,
  };
}

/** The promotion's end as a line of kind "date": value carries the instant (ISO-8601), as the admin prices screen reads it. */
export function promotionLineOf(p: PromotionRow, book: BookVersion, reason = "", changed = false): Price {
  return {
    ...settingBase(PROMOTION_KEY, `The ${p.percentOff}% off ends`, "promotion", book.version),
    kind: "date",
    value: toWireInstant(p.endsAt) as unknown as number,
    lead: p.label,
    reason,
    changed,
  };
}

/** The creators' payout threshold (R14): a setting line in kobo, PROVISIONAL until the owner confirms. */
export function payoutLineOf(valueKobo: number, status: string, schedule: string, book: BookVersion, reason = "", changed = false): Price {
  return {
    ...settingBase(PAYOUT_KEY, "Creators' payout threshold", "payout", book.version),
    price: valueKobo,
    value: valueKobo,
    listKobo: valueKobo,
    was: valueKobo,
    per: schedule,
    lead: status,
    reason,
    changed,
  };
}

function settingBase(key: string, name: string, group: string, version: number): Price {
  return {
    key,
    sku: key,
    name,
    title: name,
    group,
    kind: "naira",
    price: 0,
    value: 0,
    listKobo: null,
    was: 0,
    promoKobo: null,
    discountable: false,
    vatIncluded: false,
    version,
    per: "",
    from: "settings",
    lead: "",
    sla: "",
    reason: "",
    items: [],
    conciergeDeliveryHours: 0,
    conciergeSingleWish: 0,
  };
}

export function promotionOf(p: PromotionRow): Promotion {
  return {
    id: p.id,
    label: p.label,
    percentOff: p.percentOff,
    endsAt: toWireInstant(p.endsAt),
    endsOn: lastDayInLagos(p.endsAt),
    appliesTo: [...p.appliesTo],
  };
}

export function versionOf(v: VersionRow, published: boolean, reason = ""): PriceBookVersion {
  return {
    key: v.id,
    version: v.version,
    name: `Version ${v.version}${published ? "" : " (draft)"}`,
    effectiveFrom: toWireInstant(v.effectiveFrom),
    createdAt: toWireInstant(v.createdAt),
    createdBy: v.createdBy,
    at: toWireInstant(v.createdAt),
    by: v.createdBy,
    note: v.note,
    reason,
    prices: Array.isArray(v.prices) ? v.prices : [],
    from: 0,
    to: "",
  };
}
