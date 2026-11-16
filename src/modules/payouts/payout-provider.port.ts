import type { Money } from "../../common/money/money";

export interface ResolveAccount {
  bankCode: string;
  accountNumber: string;
}
export interface TransferRequest {
  /** Our reference, made from the payout id: the provider is asked once for it, however many times we ask. */
  reference: string;
  amount: Money;
  bankCode: string;
  accountNumber: string;
  /** Plain words the bank shows. */
  narration: string;
}
export interface TransferAccepted {
  /** The provider's own id for the transfer. */
  providerReference: string;
}

/** What the provider says about a transfer we asked for by reference (ZZ2). `unknown`: it has no transfer by that reference. */
export interface TransferLookup {
  state: "success" | "failed" | "reversed" | "pending" | "unknown";
  /** Kobo, when the provider says. */
  amount?: number;
}

/** The provider said no and the answer is final, unlike a time-out. `message` is plain words for staff. */
export class TransferRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferRefused";
  }
}
/** No such account at that bank. */
export class AccountNotFound extends Error {
  constructor() {
    super("No account was found for that bank and number.");
    this.name = "AccountNotFound";
  }
}

/**
 * The payments provider's transfer calls, beside the payments port (which has no transfer or account-name call; the shared port was
 * not changed). Every method answers within the payments time limit (PortTimeoutError). Never called inside a database transaction.
 */
export abstract class PayoutProviderPort {
  /** The name the bank holds for an account. Rejects with AccountNotFound. */
  abstract resolveAccount(input: ResolveAccount): Promise<{ accountName: string }>;
  /** Sends money to a bank account. Rejects with TransferRefused when the provider refuses. Paid is told later by a signed event. */
  abstract transfer(input: TransferRequest): Promise<TransferAccepted>;
  /** What became of the transfer made with this reference (ZZ2). Never sends money. */
  abstract lookup(reference: string): Promise<TransferLookup>;
}
