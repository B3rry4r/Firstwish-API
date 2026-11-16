import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { JobsModule } from "../jobs/jobs.module";
import { PaymentsModule } from "../payments/payments.module";
import { WishesModule } from "../wishes/wishes.module";
import { BusinessHandlers } from "./business-handlers";
import { CreatorHandlers } from "./creator-handlers";
import { GrantStore } from "./grants";
import { PassDrawsModule } from "./pass-draws";
import { PassService } from "./pass.service";
import { PurchasesService } from "./purchases.service";
import { WishHandlers } from "./wish-handlers";

/**
 * What a payment buys (B07): one fulfilment handler per price-book line, registered at boot with the payments frame. Exports
 * PurchasesService (revoke for the refund, assertStartable for the start), PassService (draw a Pass counter), BusinessHandlers
 * (draw a client wish, extraGb of Vault space).
 */
@Module({
  imports: [PaymentsModule, WishesModule, JobsModule, EventsModule, PassDrawsModule],
  providers: [GrantStore, WishHandlers, PassService, BusinessHandlers, CreatorHandlers, PurchasesService],
  exports: [PurchasesService, PassService, BusinessHandlers, GrantStore],
})
export class PurchasesModule {}
