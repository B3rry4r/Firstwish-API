import { Module } from "@nestjs/common";
import { PeopleModule } from "../people/people.module";
import { SavedWishesModule } from "../saved-wishes/saved-wishes.module";
import { WishLifecycleService } from "./wish-lifecycle.service";
import { WishesController } from "./wishes.controller";
import { WishesService } from "./wishes.service";

/** The wish (B06): draft, content, seal, the state machine with its number and link, and the timed moves. */
@Module({
  imports: [PeopleModule, SavedWishesModule],
  controllers: [WishesController],
  providers: [WishesService, WishLifecycleService],
  exports: [WishesService, WishLifecycleService],
})
export class WishesModule {}
