import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { PeopleModule } from "../people/people.module";
import { PriceBookModule } from "../price-book/price-book.module";
import { PublicWishesModule } from "../public-wishes/public-wishes.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { ConciergeAdminController, ConciergeOrdersController } from "./concierge.controller";
import { ConciergeService } from "./concierge.service";

/**
 * Concierge orders and makers (B19: E-34 to E-40, E-69). Imports PurchasesModule so the paid line's handler is registered before
 * this module wraps it: the order becomes paid in the same transaction that records the purchase.
 */
@Module({
  imports: [PaymentsModule, PurchasesModule, PeopleModule, PriceBookModule, PublicWishesModule],
  controllers: [ConciergeOrdersController, ConciergeAdminController],
  providers: [ConciergeService],
  exports: [ConciergeService],
})
export class ConciergeModule {}
