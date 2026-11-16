import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { PaymentsModule } from "../payments/payments.module";
import { PeopleModule } from "../people/people.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { PublicWishesModule } from "../public-wishes/public-wishes.module";
import { WishesModule } from "../wishes/wishes.module";
import { PriceBookModule } from "../price-book/price-book.module";
import { ReceiverKeepsController } from "./receiver-keeps.controller";
import { WishKeepsController } from "./wish-keeps.controller";
import { WishKeepsService } from "./wish-keeps.service";

/** Keep and wake (B22): E-228 and E-232. PurchasesModule is imported so its start check and keep handler are registered first. */
@Module({
  imports: [PaymentsModule, PurchasesModule, WishesModule, JobsModule, PeopleModule, PublicWishesModule, PriceBookModule],
  controllers: [WishKeepsController, ReceiverKeepsController],
  providers: [WishKeepsService],
})
export class WishKeepsModule {}
