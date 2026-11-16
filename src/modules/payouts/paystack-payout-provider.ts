import { PAYSTACK_BASE_URL } from "../../common/ports/adapters/paystack.adapter";
import { getJson, postJson, ProviderError } from "../../common/ports/adapters/http";
import { AccountNotFound, PayoutProviderPort, ResolveAccount, TransferAccepted, TransferLookup, TransferRefused, TransferRequest } from "./payout-provider.port";

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
}

/**
 * Paystack's account-name and transfer calls. A 4xx to a transfer is the provider saying no (TransferRefused); anything else is left
 * to the caller as "not known yet". NOT RUN against the real service: the owner gives the test keys later.
 */
export class PaystackPayoutProvider extends PayoutProviderPort {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = PAYSTACK_BASE_URL,
  ) {
    super();
  }

  private get auth(): Record<string, string> {
    return { authorization: `Bearer ${this.secretKey}` };
  }

  async resolveAccount(input: ResolveAccount): Promise<{ accountName: string }> {
    try {
      const q = `account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`;
      const r = await getJson<Envelope<{ account_name: string }>>("paystack", `${this.baseUrl}/bank/resolve?${q}`, this.auth);
      if (!r.data?.account_name) throw new AccountNotFound();
      return { accountName: r.data.account_name };
    } catch (e) {
      if (e instanceof ProviderError && e.status >= 400 && e.status < 500) throw new AccountNotFound();
      throw e;
    }
  }

  async transfer(input: TransferRequest): Promise<TransferAccepted> {
    try {
      const { accountName } = await this.resolveAccount(input);
      const rec = await postJson<Envelope<{ recipient_code: string }>>("paystack", `${this.baseUrl}/transferrecipient`, this.auth, {
        type: "nuban",
        name: accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: "NGN",
      });
      const r = await postJson<Envelope<{ id: number | string; transfer_code?: string }>>("paystack", `${this.baseUrl}/transfer`, this.auth, {
        source: "balance",
        amount: input.amount.kobo,
        recipient: rec.data.recipient_code,
        reason: input.narration,
        reference: input.reference,
      });
      return { providerReference: String(r.data.transfer_code ?? r.data.id) };
    } catch (e) {
      if (e instanceof AccountNotFound) throw new TransferRefused(e.message);
      if (e instanceof ProviderError && e.status >= 400 && e.status < 500) throw new TransferRefused(e.message);
      throw e;
    }
  }

  /** GET /transfer/verify/:reference. A 404 is "no such transfer". NOT RUN against the real service. */
  async lookup(reference: string): Promise<TransferLookup> {
    try {
      const r = await getJson<Envelope<{ status?: string; amount?: number }>>("paystack", `${this.baseUrl}/transfer/verify/${encodeURIComponent(reference)}`, this.auth);
      const status = r.data?.status;
      const amount = typeof r.data?.amount === "number" ? r.data.amount : undefined;
      if (status === "success") return { state: "success", amount };
      if (status === "failed") return { state: "failed", amount };
      if (status === "reversed") return { state: "reversed", amount };
      return { state: "pending", amount };
    } catch (e) {
      if (e instanceof ProviderError && e.status === 404) return { state: "unknown" };
      throw e;
    }
  }
}
