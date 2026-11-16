import { Module } from "@nestjs/common";
import { NoticesModule } from "../notices/notices.module";
import { ProBusinessModule } from "../pro-business/pro-business.module";
import { PublicWishesModule } from "../public-wishes/public-wishes.module";
import { UnlockTokens } from "../public-wishes/unlock-token";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { RevealPublicController } from "./reveal-public.controller";
import { RevealsPublicService } from "./reveals-public.service";
import { RevealsService } from "./reveals.service";
import { ShootsService } from "./shoots.service";
import { VaultController } from "./vault.controller";
import { VaultSpaceService } from "./vault-space.service";

/**
 * The Vault (B18): shoots, the space used, reveal links and their plays, and sending a reveal (E-33). Files themselves are the files
 * bundle's (uploads E-182, the list E-214); a plan lapsing never takes a link away (links play to their end).
 */
@Module({
  imports: [ProBusinessModule, NoticesModule, PublicWishesModule, StoredFilesModule],
  controllers: [VaultController, RevealPublicController],
  providers: [VaultSpaceService, ShootsService, RevealsService, RevealsPublicService, UnlockTokens],
})
export class VaultModule {}
