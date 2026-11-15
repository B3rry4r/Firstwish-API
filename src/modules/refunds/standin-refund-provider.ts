import { RefundAccepted, ProviderSettlement, RefundProviderPort, RefundRefused, RefundRequest } from "./refund-provider.port";

/** The stand-in behind the refund port (R16: the owner's Paystack test keys are not here yet). It asks nothing of any network. */
export class StandinRefundProvider extends RefundProviderPort {
  readonly asked: RefundRequest[] = [];
  private refuse: string | null = null;
  private hang = false;
  private readonly settlements = new Map<string, ProviderSettlement>();

  /** The next refund requests are refused with this message (null: accepted again). */
  refusing(message: string | null): void {
    this.refuse = message;
  }
  /** The next refund requests never answer (the time limit rejects them). */
  hanging(on: boolean): void {
    this.hang = on;
  }
  /** What the provider reports for a day. */
  setSettlement(day: string, s: ProviderSettlement): void {
    this.settlements.set(day, s);
  }

  refund(input: RefundRequest): Promise<RefundAccepted> {
    this.asked.push(input);
    if (this.hang) return new Promise<RefundAccepted>(() => undefined);
    if (this.refuse !== null) return Promise.reject(new RefundRefused(this.refuse));
    return Promise.resolve({ providerReference: `standin-refund-${input.refundId}` });
  }

  settlement(day: string): Promise<ProviderSettlement> {
    return Promise.resolve(this.settlements.get(day) ?? { totalKobo: 0n, lines: [] });
  }
}
