import { Module, OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Express } from "express";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { WishesModule } from "../wishes/wishes.module";
import { FeedWishesController } from "./feed-wishes.controller";
import { FeedWishesService } from "./feed-wishes.service";
import { LinkLimits } from "./link-limits";
import { undecodableSlug } from "./slug-escapes";
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
export class PublicWishesModule implements OnModuleInit {
  constructor(private readonly adapter: HttpAdapterHost) {}

  /** NN3: runs before the kernel registers its own last handler, so a path the router cannot decode is 404 on a link. */
  onModuleInit(): void {
    const app = this.adapter.httpAdapter?.getInstance<Express>();
    app?.use(undecodableSlug);
  }
}
