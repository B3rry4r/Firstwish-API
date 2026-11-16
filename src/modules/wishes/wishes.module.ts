import { Module } from "@nestjs/common";
import { PeopleModule } from "../people/people.module";
import { PassDrawsModule } from "../purchases/pass-draws";
import { ReceiverActivityService } from "../public-wishes/receiver-activity.service";
import { SavedWishesModule } from "../saved-wishes/saved-wishes.module";
import { ShowingLinkModule } from "../showing/showing-link";
import { WishLifecycleService } from "./wish-lifecycle.service";
import { WishesController } from "./wishes.controller";
import { WishesService } from "./wishes.service";

/** The wish (B06): draft, content, seal, the state machine with its number and link, and the timed moves. */
@Module({
  imports: [PeopleModule, SavedWishesModule, PassDrawsModule, ShowingLinkModule],
  controllers: [WishesController],
  // ReceiverActivityService holds no state and needs only the database: PublicWishesModule imports this module, so it is listed here too (no import cycle).
  providers: [WishesService, WishLifecycleService, ReceiverActivityService],
  exports: [WishesService, WishLifecycleService],
})
export class WishesModule {}
