import { Global, Module } from "@nestjs/common";
import { EntitlementsService } from "./entitlements.service";
import { PriceAdminService } from "./price-admin.service";
import { PriceBookController } from "./price-book.controller";
import { PriceBookService } from "./price-book.service";
import { PublicBookService } from "./public-book.service";

/**
 * The price book: every price, term and limit, and the promotion. Other bundles inject PriceBookService (quote),
 * EntitlementsService (for(sku)), PublicBookService (offerFor) and PriceAdminService (payoutThreshold).
 */
@Global()
@Module({
  controllers: [PriceBookController],
  providers: [PriceBookService, EntitlementsService, PublicBookService, PriceAdminService],
  exports: [PriceBookService, EntitlementsService, PublicBookService, PriceAdminService],
})
export class PriceBookModule {}
