import { PAYSTACK_BASE_URL } from "../../common/ports/adapters/paystack.adapter";
import { getJson, postJson, ProviderError } from "../../common/ports/adapters/http";
import { ProviderSettlement, RefundAccepted, RefundProviderPort, RefundRefused, RefundRequest, SettlementLine } from "./refund-provider.port";

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
}
interface SettlementRow {
  id: number | string;
  total_amount: number;
}
interface SettledTransaction {
  reference: string;
  amount: number;
  fees?: number | null;
}

const PER_PAGE = 100;
const MAX_PAGES = 100;

/**
 * Paystack's refund and settlement calls. A 4xx answer to a refund is the provider saying no (RefundRefused); anything else is
 * left to the caller as "not known yet". Not run against the real service yet: the owner gives the test keys later.
 */
export class PaystackRefundProvider extends RefundProviderPort {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = PAYSTACK_BASE_URL,
  ) {
    super();
  }

  private get auth(): Record<string, string> {
    return { authorization: `Bearer ${this.secretKey}` };
  }

  async refund(input: RefundRequest): Promise<RefundAccepted> {
    try {
      const r = await postJson<Envelope<{ id: number | string }>>("paystack", `${this.baseUrl}/refund`, this.auth, {
        transaction: input.paymentReference,
        amount: input.amount.kobo,
        currency: "NGN",
        merchant_note: input.refundId,
      });
      return { providerReference: String(r.data.id) };
    } catch (e) {
      if (e instanceof ProviderError && e.status >= 400 && e.status < 500) throw new RefundRefused(e.message);
      throw e;
    }
  }

  async settlement(day: string): Promise<ProviderSettlement> {
    const q = `from=${day}&to=${day}&perPage=${PER_PAGE}`;
    const settled = await getJson<Envelope<SettlementRow[]>>("paystack", `${this.baseUrl}/settlement?${q}`, this.auth);
    let total = 0n;
    const net = new Map<string, bigint>();
    for (const s of settled.data) {
      total += BigInt(s.total_amount);
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await getJson<Envelope<SettledTransaction[]>>("paystack", `${this.baseUrl}/settlement/${encodeURIComponent(String(s.id))}/transactions?perPage=${PER_PAGE}&page=${page}`, this.auth);
        for (const t of r.data) net.set(t.reference, (net.get(t.reference) ?? 0n) + BigInt(t.amount) - BigInt(t.fees ?? 0));
        if (r.data.length < PER_PAGE) break;
      }
    }
    const lines: SettlementLine[] = [...net].map(([reference, netKobo]) => ({ reference, netKobo }));
    return { totalKobo: total, lines };
  }
}

