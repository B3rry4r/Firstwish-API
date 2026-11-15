import { Module } from "@nestjs/common";
import { RoleAccessModule } from "../role-access/role-access.module";
import { SavedWishesModule } from "../saved-wishes/saved-wishes.module";
import { WishesModule } from "../wishes/wishes.module";
import { ShowingController } from "./showing.controller";
import { ShowingService } from "./showing.service";

/**
 * Now Showing (B13): the owner's asks to be shown, the staff review, the public list and the wish of the day.
 * The list reads the wish's own state, so no lifecycle call is needed to take a resting, taken-down or erased wish off it.
 * ShowingService.dropForWishes(tx, ids) is for the paths that must also forget its saves in their transaction.
 */
@Module({
  imports: [RoleAccessModule, SavedWishesModule, WishesModule],
  controllers: [ShowingController],
  providers: [ShowingService],
  exports: [ShowingService],
})
export class ShowingModule {}
