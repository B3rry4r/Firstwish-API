import type { Payout } from "../../contracts";
import { toWireInstant } from "../../common/time/time";

export interface PayoutFacts {
  id: string;
  creatorId: string;
  month: string;
  amountKobo: bigint;
  status: "pending" | "sent" | "succeeded" | "failed";
  providerReference: string | null;
  bankAccountId: string;
  createdAt: Date;
  handle: string;
  name: string;
  paidAt: Date | null;
  note: string | null;
  failureReason: string | null;
  earnedKobo: bigint;
  byStyle: { styleSlug: string; amountKobo: number }[];
}

/** What staff see as the row's state: due (made, not yet handed over), sent, paid, failed. (Under the threshold there is no row: it rolls on.) */
export const STATE: Record<PayoutFacts["status"], string> = { pending: "due", sent: "sent", succeeded: "paid", failed: "failed" };

/** The day the month's run pays: the 5th of the month after (a calendar date). */
export function payDayOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-05` : `${y}-${String(m + 1).padStart(2, "0")}-05`;
}

export function payoutWire(f: PayoutFacts, thresholdKobo: number): Payout {
  const amount = Number(f.amountKobo);
  const earned = Number(f.earnedKobo);
  return {
    id: f.id,
    creatorId: f.creatorId,
    month: f.month,
    amountKobo: amount,
    status: f.status,
    providerReference: f.providerReference,
    bankAccountId: f.bankAccountId,
    createdAt: toWireInstant(f.createdAt),
    handle: f.handle,
    name: f.name,
    earned,
    carried: amount - earned,
    total: amount,
    threshold: thresholdKobo,
    payDay: payDayOf(f.month),
    reason: f.status === "failed" ? (f.failureReason ?? "") : (f.note ?? ""),
    rows: f.byStyle,
    state: STATE[f.status],
    paid: f.status === "succeeded" ? { decision: "paid", at: f.paidAt ? toWireInstant(f.paidAt) : null, reason: f.note ?? "" } : null,
  };
}

/** The account number as anyone but the creator's bank sees it: the last four digits only. */
export const maskNumber = (n: string | null): string => (n ? `******${n.slice(-4)}` : "");
