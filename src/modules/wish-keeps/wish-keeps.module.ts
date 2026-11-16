import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { PaymentsModule } from "../payments/payments.module";
import { PeopleModule } from "../people/people.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { WishesModule } from "../wishes/wishes.module";
import { WishKeepsController } from "./wish-keeps.controller";
import { WishKeepsService } from "./wish-keeps.service";

/** Keep and wake (B22): E-228 and E-232. PurchasesModule is imported so its start check and keep handler are registered first. */
@Module({
  imports: [PaymentsModule, PurchasesModule, WishesModule, JobsModule, PeopleModule],
  controllers: [WishKeepsController],
  providers: [WishKeepsService],
})
export class WishKeepsModule {}
