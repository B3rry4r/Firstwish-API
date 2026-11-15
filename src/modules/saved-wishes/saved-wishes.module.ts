import { Module } from "@nestjs/common";
import { SavedWishesController } from "./saved-wishes.controller";
import { SavedWishesService } from "./saved-wishes.service";

/** SavedWish: an account saves a feed wish (B12). SavedWishesService.forgetForWishes is for the take-down and erase paths. */
@Module({
  controllers: [SavedWishesController],
  providers: [SavedWishesService],
  exports: [SavedWishesService],
})
export class SavedWishesModule {}
