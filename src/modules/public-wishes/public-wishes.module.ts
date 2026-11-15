import { Module } from "@nestjs/common";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { WishesModule } from "../wishes/wishes.module";
import { FeedWishesController } from "./feed-wishes.controller";
import { FeedWishesService } from "./feed-wishes.service";
import { LinkLimits } from "./link-limits";
import { PublicWishesController } from "./public-wishes.controller";
import { PublicWishesService } from "./public-wishes.service";
import { ReceiverActivityService } from "./receiver-activity.service";
import { UnlockTokens } from "./unlock-token";

/**
 * The receiver's link (B10): GET /v1/w/:slug and its unlock, first opening, reactions, favourites; the signed-in side of a
 * published wish (react, share, play). ReceiverActivityService.summary is exported for the owner's wish detail.
 */
@Module({
  imports: [WishesModule, StoredFilesModule],
  controllers: [PublicWishesController, FeedWishesController],
  providers: [PublicWishesService, FeedWishesService, ReceiverActivityService, LinkLimits, UnlockTokens],
  exports: [ReceiverActivityService],
})
export class PublicWishesModule {}
