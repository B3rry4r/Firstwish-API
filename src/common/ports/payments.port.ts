import { Money } from "../money/money";
import type { PortPing } from "./ping";

export interface StartPayment {
  reference: string;
  amount: Money;
  email: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}
export interface StartedPayment {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
}
export type PaymentStatus = "success" | "failed" | "abandoned" | "pending";
export interface VerifiedPayment {
  reference: string;
  status: PaymentStatus;
  amount: Money;
  paidAt: Date | null;
}

/** Payments (Paystack). Amounts are Money (integer kobo); Paystack also counts in kobo. */
export abstract class PaymentsPort {
  abstract start(input: StartPayment): Promise<StartedPayment>;
  abstract verify(reference: string): Promise<VerifiedPayment>;
  /** Checks the x-paystack-signature header (HMAC-SHA512 of the raw body with the secret key). */
  abstract verifySignature(rawBody: Buffer, signature: string | undefined): boolean;
  /** FB4: one cheap authenticated read. Answers ok, or the provider's error; a stand-in answers "stand-in". Never carries a secret. */
  abstract ping(): Promise<PortPing>;
}
