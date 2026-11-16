import { Module } from "@nestjs/common";
import { PeopleModule } from "../people/people.module";
import { PublicWishesModule } from "../public-wishes/public-wishes.module";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { GatherFriendController, GatherOwnerController } from "./gather.controller";
import { GatherService } from "./gather.service";

/** The gather link (HS1): a friend adds one voice to a wish with no account; the owner sees each arrive, removes one, turns the link off. */
@Module({
  imports: [PeopleModule, PublicWishesModule, StoredFilesModule],
  controllers: [GatherOwnerController, GatherFriendController],
  providers: [GatherService],
})
export class GatherModule {}
