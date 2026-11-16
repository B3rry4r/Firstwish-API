import { PING_STAND_IN, type PortPing } from "../ping";
import { AccountNotFound, PayoutProviderPort, ResolveAccount, TransferAccepted, TransferLookup, TransferRefused, TransferRequest } from "../payout-provider.port";

/** The stand-in behind the payout port (the owner's Paystack test keys are not here yet). It asks nothing of any network. */
export class StandinPayoutProvider extends PayoutProviderPort {
  /** FB4: a stand-in calls nothing. */
  ping(): Promise<PortPing> {
    return Promise.resolve(PING_STAND_IN);
  }

  readonly asked: TransferRequest[] = [];
  readonly resolved: ResolveAccount[] = [];
  private refuse: string | null = null;
  private hang = false;
  /** What the stand-in remembers: the transfers that went (accepted, or sent and the answer lost) by reference, and how each ended. */
  private readonly went = new Map<string, { amount: number; state: "success" | "failed" | "reversed" | "pending" }>();
  private name = "Standin Account Holder";

  /** The next transfers are refused with this message (null: accepted again). */
  refusing(message: string | null): void {
    this.refuse = message;
  }
  /** The next transfers never answer (the time limit rejects them). */
  hanging(on: boolean): void {
    this.hang = on;
  }
  /** Says how a transfer it already holds ended (a test's way of letting the provider settle). */
  settled(reference: string, state: "success" | "failed" | "reversed" | "pending"): void {
    const t = this.went.get(reference);
    if (t) t.state = state;
  }
  named(name: string): void {
    this.name = name;
  }

  /** An account number ending in 0000 is no account at all. */
  resolveAccount(input: ResolveAccount): Promise<{ accountName: string }> {
    this.resolved.push(input);
    return input.accountNumber.endsWith("0000") ? Promise.reject(new AccountNotFound()) : Promise.resolve({ accountName: this.name });
  }

  transfer(input: TransferRequest): Promise<TransferAccepted> {
    this.asked.push(input);
    if (this.hang) {
      if (!this.went.has(input.reference)) this.went.set(input.reference, { amount: input.amount.kobo, state: "pending" });
      return new Promise<TransferAccepted>(() => undefined);
    }
    if (this.refuse !== null) return Promise.reject(new TransferRefused(this.refuse));
    if (!this.went.has(input.reference)) this.went.set(input.reference, { amount: input.amount.kobo, state: "pending" });
    return Promise.resolve({ providerReference: `standin-${input.reference}` });
  }

  /** From its own memory: a reference it never let go is unknown. */
  lookup(reference: string): Promise<TransferLookup> {
    const t = this.went.get(reference);
    return Promise.resolve(t ? { state: t.state, amount: t.amount } : { state: "unknown" });
  }
}
