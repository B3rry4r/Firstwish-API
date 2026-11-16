import { AccountNotFound, PayoutProviderPort, ResolveAccount, TransferAccepted, TransferRefused, TransferRequest } from "./payout-provider.port";

/** The stand-in behind the payout port (the owner's Paystack test keys are not here yet). It asks nothing of any network. */
export class StandinPayoutProvider extends PayoutProviderPort {
  readonly asked: TransferRequest[] = [];
  readonly resolved: ResolveAccount[] = [];
  private refuse: string | null = null;
  private hang = false;
  private name = "Standin Account Holder";

  /** The next transfers are refused with this message (null: accepted again). */
  refusing(message: string | null): void {
    this.refuse = message;
  }
  /** The next transfers never answer (the time limit rejects them). */
  hanging(on: boolean): void {
    this.hang = on;
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
    if (this.hang) return new Promise<TransferAccepted>(() => undefined);
    if (this.refuse !== null) return Promise.reject(new TransferRefused(this.refuse));
    return Promise.resolve({ providerReference: `standin-${input.reference}` });
  }
}
