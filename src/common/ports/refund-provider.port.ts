import type { Money } from "../money/money";

export interface RefundRequest {
  /** Our refund's id: the provider is asked once for it, however many times we ask. */
  refundId: string;
  /** The provider's reference of the payment being refunded. */
  paymentReference: string;
  amount: Money;
}
export interface RefundAccepted {
  /** The provider's own id for the refund. */
  providerReference: string;
}

/** What the provider moved for one payment on one day, net of its fee and of refunds. */
export interface SettlementLine {
  reference: string;
  netKobo: bigint;
}
export interface ProviderSettlement {
  totalKobo: bigint;
  lines: SettlementLine[];
}

/** The provider said no (the answer is final, unlike a time-out). `message` is plain words for staff. */
export class RefundRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundRefused";
  }
}

/**
 * The payments provider's refund and settlement calls, beside the payments port (which has no refund or settlement call). Every
 * method answers within the payments time limit (PortTimeoutError). Never called inside a database transaction.
 */
export abstract class RefundProviderPort {
  /** Asks for a refund of the whole payment. Rejects with RefundRefused when the provider refuses. */
  abstract refund(input: RefundRequest): Promise<RefundAccepted>;
  /**
   * The refund the provider already holds for this payment's reference (not a failed one), or null. The adapter calls it before any
   * ask, so a time-out that did land at the provider never makes a second refund (TT1).
   */
  abstract findRefund(paymentReference: string): Promise<RefundAccepted | null>;
  /** The provider's settlement for one UTC day ("YYYY-MM-DD"): a total and one line per payment. */
  abstract settlement(day: string): Promise<ProviderSettlement>;
}
