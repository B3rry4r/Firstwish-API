import { Module } from "@nestjs/common";
import { PriceBookModule } from "../price-book/price-book.module";
import { RoyaltiesController } from "./royalties.controller";
import { RoyaltiesService } from "./royalties.service";

/** B16: royalties. The settle transaction's handlers call RoyaltiesService.accrue; the refund path calls reverse. */
@Module({ imports: [PriceBookModule], controllers: [RoyaltiesController], providers: [RoyaltiesService], exports: [RoyaltiesService] })
export class RoyaltiesModule {}
