import { RefundAccepted, ProviderSettlement, RefundProviderPort, RefundRefused, RefundRequest } from "../refund-provider.port";

/** The stand-in behind the refund port (R16: the owner's Paystack test keys are not here yet). It asks nothing of any network. */
export class StandinRefundProvider extends RefundProviderPort {
  readonly asked: RefundRequest[] = [];
  private refuse: string | null = null;
  private hang = false;
  private landing = true;
  /** The refunds the stand-in holds, by the payment's reference (its own memory of what it was asked). */
  readonly created = new Map<string, RefundAccepted>();
  /** One entry per refund the provider really created: the refund id asked for. A second ask for the same payment adds none. */
  readonly creations: string[] = [];
  private readonly settlements = new Map<string, ProviderSettlement>();

  /** The next refund requests are refused with this message (null: accepted again). */
  refusing(message: string | null): void {
    this.refuse = message;
  }
  /** The next refund requests never answer (the time limit rejects them). */
  hanging(on: boolean): void {
    this.hang = on;
  }
  /** A hanging ask still lands at the provider (true, the default) or is lost on the way (false). */
  landingWhenHanging(on: boolean): void {
    this.landing = on;
  }
  /** What the provider reports for a day. */
  setSettlement(day: string, s: ProviderSettlement): void {
    this.settlements.set(day, s);
  }

  findRefund(paymentReference: string): Promise<RefundAccepted | null> {
    return Promise.resolve(this.created.get(paymentReference) ?? null);
  }

  /** Looks the payment's refund up first, as the real adapter does, and creates one only when none is there. */
  async refund(input: RefundRequest): Promise<RefundAccepted> {
    this.asked.push(input);
    const held = await this.findRefund(input.paymentReference);
    if (held) return held;
    if (this.hang) {
      if (this.landing) {
        this.created.set(input.paymentReference, { providerReference: `standin-refund-${input.refundId}` });
        this.creations.push(input.refundId);
      }
      return new Promise<RefundAccepted>(() => undefined);
    }
    if (this.refuse !== null) throw new RefundRefused(this.refuse);
    const made = { providerReference: `standin-refund-${input.refundId}` };
    this.created.set(input.paymentReference, made);
    this.creations.push(input.refundId);
    return made;
  }

  settlement(day: string): Promise<ProviderSettlement> {
    return Promise.resolve(this.settlements.get(day) ?? { totalKobo: 0n, lines: [] });
  }
}
