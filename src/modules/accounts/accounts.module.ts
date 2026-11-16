import { Module } from "@nestjs/common";
import { AccountErasureService } from "./account-erasure.service";
import { AccountSidesController, HandlesController } from "./account-sides.controller";
import { AccountSidesService } from "./account-sides.service";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";
import { SavedWishesModule } from "../saved-wishes/saved-wishes.module";
import { ShowingLinkModule } from "../showing/showing-link";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { StudioModule } from "../studio/studio.module";

/**
 * Account: made on first sign-in; GET and PATCH /v1/me (B01). The handle check, the creator and business sides, and erase on
 * request (B02); AccountErasureService is the one erase every caller uses (the staff erase action, E-3, included).
 */
@Module({
  imports: [SavedWishesModule, StoredFilesModule, ShowingLinkModule, StudioModule],
  controllers: [AccountsController, AccountSidesController, HandlesController],
  providers: [AccountsService, AccountSidesService, AccountErasureService],
  exports: [AccountsService, AccountErasureService],
})
export class AccountsModule {}
