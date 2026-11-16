import type { $Enums } from "@prisma/client";
import type { LedgerDraft } from "../payments/ledger";

export interface PaymentLedgerRow {
  journalId: string;
  account: $Enums.LedgerEntryAccount;
  direction: $Enums.LedgerEntryDirection;
  amountKobo: bigint;
  memo: string;
  refundId: string | null;
}

/** What every royalty journal's memo starts with (royalties.service writes them). */
const ROYALTY_MEMO = "Royalty";

/**
 * The reversing rows of a refund: every journal that sold something (not the provider's fee, which the provider keeps) is written
 * again with its debits and credits swapped, under a journal of its own. Each reversed journal sums to zero because the original
 * did; the original rows are never touched. Rows that already belong to a refund are not reversed again. The royalty journals of the
 * payment (memo "Royalty ...") are not reversed here: RoyaltiesService.reverse takes each one back itself (WW2), once.
 */
export function reversalEntries(rows: PaymentLedgerRow[], journal: () => string, reference: string): LedgerDraft[] {
  const original = rows.filter((r) => r.refundId === null && !r.memo.startsWith(ROYALTY_MEMO));
  const feeJournals = new Set(original.filter((r) => r.account === "provider_fees").map((r) => r.journalId));
  const newId = new Map<string, string>();
  const out: LedgerDraft[] = [];
  for (const r of original) {
    if (feeJournals.has(r.journalId)) continue;
    let id = newId.get(r.journalId);
    if (!id) {
      id = journal();
      newId.set(r.journalId, id);
    }
    out.push({ journalId: id, account: r.account, direction: r.direction === "debit" ? "credit" : "debit", amountKobo: r.amountKobo, memo: `Refund ${reference}: ${r.memo}`.slice(0, 300) });
  }
  return out;
}
