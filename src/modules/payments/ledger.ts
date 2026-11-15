import type { $Enums } from "@prisma/client";

/** One ledger row to write, before it has an id. Debits and credits of one journal always sum to the same total. */
export interface LedgerDraft {
  journalId: string;
  account: $Enums.LedgerEntryAccount;
  direction: "debit" | "credit";
  amountKobo: bigint;
  memo: string;
}

export interface PaidLine {
  sku: string;
  totalKobo: bigint;
  vatIncluded: boolean;
}

/** The ledger account a price-book line earns into, from the group in front of the dot in its sku. */
const REVENUE: Record<string, $Enums.LedgerEntryAccount> = {
  ticket: "revenue_tickets",
  extra: "revenue_extras",
  keep: "revenue_keeps",
  pass: "revenue_pass",
  pro: "revenue_pro",
  vault: "revenue_vault",
  concierge: "revenue_concierge",
  creator: "revenue_creator",
};

export function revenueAccount(sku: string): $Enums.LedgerEntryAccount {
  const acc = REVENUE[sku.slice(0, sku.indexOf("."))];
  if (!acc) throw new Error(`ledger: no revenue account for ${sku}`);
  return acc;
}

/** "7.5" (percent) to basis points, 750. Anything that is not a plain non-negative decimal of at most two places is refused. */
export function vatBasisPoints(rate: string): bigint {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(rate.trim());
  if (!m) throw new Error(`ledger: vat rate "${rate}" is not a percentage`);
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

/** The VAT inside a price that includes it, to the kobo (half up): total x r / (100% + r). */
export function vatInside(totalKobo: bigint, bps: bigint): bigint {
  const num = totalKobo * bps;
  const den = 10000n + bps;
  return (num * 2n + den) / (den * 2n);
}

/**
 * The double entry for a verified payment, in integer kobo. Journal 1: the money lands in provider-clearing (debit the whole
 * amount); every line credits its revenue account, and the VAT inside a VAT-included line credits vat-payable. Journal 2 (when
 * the provider's fee is known): the fee is an expense paid out of clearing. Each journal sums to zero (debits equal credits).
 */
export function paymentEntries(input: {
  journal: () => string;
  lines: PaidLine[];
  vatRate: string;
  feeKobo: bigint | null;
  reference: string;
}): LedgerDraft[] {
  const bps = vatBasisPoints(input.vatRate);
  const sale = input.journal();
  const out: LedgerDraft[] = [];
  let total = 0n;
  for (const l of input.lines) {
    if (l.totalKobo <= 0n) throw new Error("ledger: a line must cost something");
    total += l.totalKobo;
    const vat = l.vatIncluded ? vatInside(l.totalKobo, bps) : 0n;
    out.push({ journalId: sale, account: revenueAccount(l.sku), direction: "credit", amountKobo: l.totalKobo - vat, memo: `Sale ${l.sku} ${input.reference}` });
    if (vat > 0n) out.push({ journalId: sale, account: "vat_payable", direction: "credit", amountKobo: vat, memo: `VAT in ${l.sku} ${input.reference}` });
  }
  out.unshift({ journalId: sale, account: "provider_clearing", direction: "debit", amountKobo: total, memo: `Paid ${input.reference}` });
  if (input.feeKobo !== null && input.feeKobo > 0n) {
    const fee = input.journal();
    out.push({ journalId: fee, account: "provider_fees", direction: "debit", amountKobo: input.feeKobo, memo: `Provider fee ${input.reference}` });
    out.push({ journalId: fee, account: "provider_clearing", direction: "credit", amountKobo: input.feeKobo, memo: `Provider fee ${input.reference}` });
  }
  return out;
}
