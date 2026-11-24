import { Module } from "@nestjs/common";
import { PriceBookModule } from "../price-book/price-book.module";
import { PublicWishesModule } from "../public-wishes/public-wishes.module";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { StudioModule } from "../studio/studio.module";
import { RenderJobsModule } from "./render-jobs.module";
import { RenderReadController } from "./render-read.controller";
import { RenderReadService } from "./render-read.service";

/** R3: the render page's read. Its own module so the Studio and the link's limits can be imported without a cycle through the wishes module. */
@Module({
  imports: [RenderJobsModule, PublicWishesModule, StudioModule, StoredFilesModule, PriceBookModule],
  controllers: [RenderReadController],
  providers: [RenderReadService],
})
export class RenderReadModule {}
