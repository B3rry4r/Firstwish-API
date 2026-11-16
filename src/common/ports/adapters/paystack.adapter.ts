import { Money } from "../../money/money";
import { PaymentsPort, PaymentStatus, StartPayment, StartedPayment, VerifiedPayment } from "../payments.port";
import { signatureMatches } from "../signature";
import { getJson, postJson } from "./http";
import { type PortPing, pingWith } from "../ping";

export const PAYSTACK_BASE_URL = "https://api.paystack.co";

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

/** Paystack: transaction/initialize, transaction/verify, and the webhook signature check. */
export class PaystackPayments extends PaymentsPort {
  constructor(
    private readonly secretKey: string,
    private readonly defaultCallbackUrl: string | undefined,
    private readonly baseUrl = PAYSTACK_BASE_URL,
  ) {
    super();
  }

  private get auth(): Record<string, string> {
    return { authorization: `Bearer ${this.secretKey}` };
  }

  async start(input: StartPayment): Promise<StartedPayment> {
    const r = await postJson<PaystackEnvelope<{ authorization_url: string; access_code: string; reference: string }>>(
      "paystack",
      `${this.baseUrl}/transaction/initialize`,
      this.auth,
      {
        reference: input.reference,
        amount: input.amount.kobo,
        currency: "NGN",
        email: input.email,
        callback_url: input.callbackUrl ?? this.defaultCallbackUrl,
        metadata: input.metadata,
      },
    );
    return { reference: r.data.reference, authorizationUrl: r.data.authorization_url, accessCode: r.data.access_code };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const r = await getJson<PaystackEnvelope<{ status: string; amount: number; paid_at: string | null; reference: string }>>(
      "paystack",
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      this.auth,
    );
    return {
      reference: r.data.reference,
      status: toStatus(r.data.status),
      amount: Money.kobo(r.data.amount),
      paidAt: r.data.paid_at ? new Date(r.data.paid_at) : null,
    };
  }

  /** FB4: one authenticated read of the transaction list (a page of one). NOT RUN against Paystack: the owner gives the test keys later. */
  ping(): Promise<PortPing> {
    return pingWith(() => getJson("paystack", `${this.baseUrl}/transaction?perPage=1`, this.auth), [this.secretKey]);
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    return signatureMatches(this.secretKey, rawBody, signature);
  }
}

function toStatus(s: string): PaymentStatus {
  if (s === "success") return "success";
  if (s === "failed" || s === "reversed") return "failed";
  if (s === "abandoned") return "abandoned";
  return "pending";
}
