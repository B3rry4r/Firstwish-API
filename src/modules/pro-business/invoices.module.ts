import { Module } from "@nestjs/common";
import { PriceBookModule } from "../price-book/price-book.module";
import { InvoicesService } from "./invoices.service";

/**
 * The invoice writer on its own, so the purchase handlers (issue in the settle transaction) and the refund (void in its transaction)
 * can reach it without a module cycle with the business pages.
 */
@Module({
  imports: [PriceBookModule],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
