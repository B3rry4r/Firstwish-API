import type { Prisma } from "@prisma/client";
import { toWireInstant } from "../../common/time/time";
import { lineOfPurpose, maskEmail, maskPhone } from "./mask";

/** The staff view of a wish's life, in the words the admin app uses ("down" is taken down by staff). */
export function stateWord(status: string, erasedAt: Date | null): string {
  if (erasedAt) return "erased";
  return status === "removed" ? "down" : status;
}

type WishRow = Prisma.WishGetPayload<object>;

/** One wish for a staff list or detail. Its words and photos are never here: the registry gives staff the number, state, term and payments only. */
export function wishWire(w: WishRow, link: string | null, isPublic: boolean, timeline: { at: string; what: string; by?: string; reason?: string }[] = []) {
  const adds = Array.isArray(w.adds) ? (w.adds as unknown[]) : [];
  const extras = adds
    .map((a) => (typeof a === "string" ? a : a && typeof a === "object" ? ((a as Record<string, unknown>).key ?? (a as Record<string, unknown>).slug) : null))
    .filter((a): a is string => typeof a === "string");
  return {
    no: w.no ?? "",
    link: link ?? "",
    forName: w.erasedAt ? "" : (w.name ?? ""),
    person: w.accountId,
    kind: w.kind,
    occasion: w.occasion,
    ticket: w.ticket ?? "",
    extras,
    state: stateWord(w.status, w.erasedAt),
    opensAt: w.opensAt ? toWireInstant(w.opensAt) : "",
    ...(w.endsAt ? { endsAt: toWireInstant(w.endsAt) } : {}),
    isPublic,
    timeline,
  };
}

export function paymentWire(p: Prisma.PaymentGetPayload<object>, wishNo?: string) {
  const state = p.status === "succeeded" ? "paid" : p.status === "refunded" || p.status === "partly_refunded" ? "refunded" : p.status === "failed" ? "failed" : p.status;
  return {
    ref: p.providerReference, what: p.purpose, line: lineOfPurpose(p.purpose), amount: Number(p.amountKobo), state,
    at: toWireInstant(p.createdAt), person: p.accountId ?? "", ...(wishNo ? { wish: wishNo } : {}),
  };
}

export { maskEmail, maskPhone };
