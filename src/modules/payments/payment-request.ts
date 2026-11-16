import { createHash } from "node:crypto";
import type { $Enums } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";
import type { PostPaymentsBody } from "../../contracts";
import type { QuoteInput } from "../price-book/price-book.service";
import type { PaymentRequestInfo } from "./fulfilment.registry";

/** The wire name of a purpose to the database's. */
const PURPOSES: Record<string, $Enums.PaymentPurpose> = {
  ticket: "ticket",
  extra: "extra",
  keep: "keep",
  pass: "pass",
  "pro-plan": "pro_plan",
  "wish-pack": "wish_pack",
  "vault-space": "vault_space",
  concierge: "concierge",
  "creator-plan": "creator_plan",
  signed: "signed",
  "credit-pack": "credit_pack",
  "extra-review": "extra_review",
};
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NEEDS_BUSINESS = new Set(["pro-plan", "wish-pack", "vault-space"]);

export interface ParsedRequest {
  purpose: $Enums.PaymentPurpose;
  wirePurpose: string;
  needsBusiness: boolean;
  lines: QuoteInput[];
  info: PaymentRequestInfo;
  way: "card" | "transfer" | "ussd";
  fingerprint: string;
}

/**
 * What is bought, from the body, as price-book lines. The body never carries an amount (the global pipe refuses an unknown
 * field, so `amount` or `price` is a 422 before this runs). Default (lead), owner may override: the line is named by the group
 * the purpose is in and the name in `ticket`, `key` or `id`:
 *   ticket -> ticket.<ticket|id>, extra -> extra.<id>, keep -> keep.<id>, pass -> pass.year, pro-plan -> pro.<key>,
 *   wish-pack -> pro.pack x packs, vault-space -> vault.<id> x packs, concierge -> concierge.single (priced from the order), creator-plan -> creator.plan,
 *   signed -> creator.signed, credit-pack -> creator.credit-pack x packs, extra-review -> creator.extra-review.
 */
export function parseRequest(body: PostPaymentsBody): ParsedRequest {
  const wire = (body.purpose ?? "").trim().toLowerCase();
  const purpose = PURPOSES[wire];
  if (!purpose) throw AppError.validation({ purpose: `Must be one of ${Object.keys(PURPOSES).join(", ")}.` });
  const name = (field: "ticket" | "key" | "id", v: string | undefined): string => {
    const n = (v ?? "").trim().toLowerCase();
    if (!NAME.test(n)) throw AppError.validation({ [field]: "Name the line you are buying." });
    return n;
  };
  const packs = body.packs ?? 1;
  if (!Number.isSafeInteger(packs) || packs < 1 || packs > 1000) throw AppError.validation({ packs: "Must be a whole number from 1 to 1000." });

  let line: QuoteInput;
  switch (wire) {
    case "ticket":
      line = { sku: `ticket.${name(body.ticket !== undefined ? "ticket" : "id", body.ticket ?? body.id)}` };
      break;
    case "extra":
      line = { sku: `extra.${name("id", body.id)}` };
      break;
    case "keep":
      line = { sku: `keep.${name("id", body.id)}` };
      break;
    case "pass":
      line = { sku: "pass.year" };
      break;
    case "pro-plan":
      line = { sku: `pro.${name("key", body.key)}`, qty: body.key === "pack" ? packs : 1 };
      break;
    case "wish-pack":
      line = { sku: "pro.pack", qty: packs };
      break;
    case "vault-space":
      line = { sku: `vault.${name("id", body.id)}`, qty: packs };
      break;
    case "concierge":
      line = { sku: "concierge.single" }; // CA1: the start charges the order's own stored price (the concierge start check sets it)
      break;
    case "creator-plan":
      line = { sku: "creator.plan" };
      break;
    case "signed":
      line = { sku: "creator.signed" };
      break;
    case "credit-pack":
      line = { sku: "creator.credit-pack", qty: packs };
      break;
    default:
      line = { sku: "creator.extra-review" };
  }
  if (body.subjectId !== undefined && (typeof body.subjectId !== "string" || !body.subjectId.trim() || body.subjectId.length > 100)) {
    throw AppError.validation({ subjectId: "Must be an id." });
  }
  const info: PaymentRequestInfo = { purpose: wire };
  const keep = <K extends keyof PaymentRequestInfo>(k: K, v: PaymentRequestInfo[K] | undefined) => {
    if (v !== undefined) info[k] = v;
  };
  keep("subjectId", body.subjectId?.trim());
  keep("id", body.id?.trim());
  keep("key", body.key);
  keep("plan", body.plan);
  keep("packs", body.packs);
  keep("ticket", body.ticket);
  keep("title", body.title?.trim());
  keep("way", body.way);
  keep("extraDays", body.extraDays);
  keep("options", body.options);
  return {
    purpose,
    wirePurpose: wire,
    needsBusiness: NEEDS_BUSINESS.has(wire),
    lines: [line],
    info,
    way: body.way ?? "card",
    fingerprint: fingerprint(info, [line]),
  };
}

/** The same request gives the same fingerprint, whatever the order of its keys; the price is not part of it. */
export function fingerprint(info: PaymentRequestInfo, lines: QuoteInput[]): string {
  return createHash("sha256").update(canonical({ info, lines: lines.map((l) => ({ sku: l.sku, qty: l.qty ?? 1 })) })).digest("hex");
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
