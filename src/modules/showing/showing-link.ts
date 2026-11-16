import { Injectable, Module } from "@nestjs/common";
import type { ShowingService } from "./showing.service";

/** What the wish lifecycle, the wish detail and the account erase need from Now showing. */
export type ShowingCalls = Pick<ShowingService, "dropForWishes" | "dropForAccount" | "publishStateOf">;

/**
 * The way from the wish and account modules to ShowingService without a module cycle (Now showing reads the wish; the wish drops
 * its rows). ShowingService registers itself here when the application starts; a call before that fails loudly, never skips.
 */
@Injectable()
export class ShowingLink {
  private calls: ShowingCalls | null = null;

  register(calls: ShowingCalls): void {
    this.calls = calls;
  }

  get showing(): ShowingCalls {
    if (!this.calls) throw new Error("Now showing is not registered: its rows cannot be dropped.");
    return this.calls;
  }
}

@Module({ providers: [ShowingLink], exports: [ShowingLink] })
export class ShowingLinkModule {}
