import { StoredFilesModule } from "../stored-files/stored-files.module";
import { Module } from "@nestjs/common";
import { RoleAccessModule } from "../role-access/role-access.module";
import { SavedWishesModule } from "../saved-wishes/saved-wishes.module";
import { WishesModule } from "../wishes/wishes.module";
import { ShowingLinkModule } from "./showing-link";
import { ShowingController } from "./showing.controller";
import { ShowingService } from "./showing.service";

/**
 * Now Showing (B13): the owner's asks to be shown, the staff review, the public list and the wish of the day.
 * The list also reads the wish's own state; the wish lifecycle and the account erase call dropForWishes / dropForAccount in their
 * transaction through ShowingLink, so a wish that rests, is taken down, removed or erased leaves no row here.
 */
@Module({
  imports: [StoredFilesModule, ShowingLinkModule, RoleAccessModule, SavedWishesModule, WishesModule],
  controllers: [ShowingController],
  providers: [ShowingService],
  exports: [ShowingService],
})
export class ShowingModule {}
