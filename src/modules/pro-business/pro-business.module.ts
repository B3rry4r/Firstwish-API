import { RoyaltiesModule } from "../royalties/royalties.module";
import { Module } from "@nestjs/common";
import { NoticesModule } from "../notices/notices.module";
import { PriceBookModule } from "../price-book/price-book.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { WishesModule } from "../wishes/wishes.module";
import { ClientWishesService } from "./client-wishes.service";
import { InvoicesModule } from "./invoices.module";
import { LoginsService } from "./logins.service";
import { PlanPaymentDrop } from "./plan-drop";
import { PlanView } from "./plan-view";
import { ProAccess } from "./pro-access";
import { AdminBusinessesController, ProBusinessController } from "./pro-business.controller";
import { ProBusinessService } from "./pro-business.service";

/**
 * The business beyond its profile (B17): plan and usage, client wishes, invoices, extra logins, and staff's read of businesses.
 * Exports InvoicesService: the plan and pack handlers call issue(tx, payment) and a refund calls voidFor(tx, paymentId).
 */
@Module({
  imports: [StoredFilesModule, PurchasesModule, WishesModule, NoticesModule, PriceBookModule, InvoicesModule, RoyaltiesModule],
  controllers: [ProBusinessController, AdminBusinessesController],
  providers: [ProAccess, PlanView, PlanPaymentDrop, ProBusinessService, ClientWishesService, LoginsService],
  exports: [InvoicesModule, ProAccess, PlanView, ClientWishesService],
})
export class ProBusinessModule {}
