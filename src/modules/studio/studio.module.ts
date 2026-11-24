import { Module } from "@nestjs/common";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { PublicWishesModule } from "../public-wishes/public-wishes.module";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { StylesModule } from "../styles/styles.module";
import { CreatorStateService } from "./creator-state.service";
import { AI_AVAILABILITY, AiAvailability, StudioAiService } from "./studio-ai.service";
import { StudioAiController } from "./studio-ai.controller";
import { StudioController, StyleFilesPlayerController } from "./studio.controller";
import { StudioErasure } from "./studio-erasure";
import { StudioFilesService } from "./studio-files.service";
import { StudioPrefsService } from "./studio-prefs.service";
import { StudioStylesService } from "./studio-styles.service";
import { StyleReviewController } from "./style-review.controller";
import { SubmissionsService } from "./submissions.service";

/**
 * The Studio (B15): a creator's state, settings, style drafts, AI help, submission and staff review. Exports StudioErasure for the
 * account erase.
 */
@Module({
  imports: [StylesModule, StoredFilesModule, PublicWishesModule],
  controllers: [StudioController, StudioAiController, StyleReviewController, StyleFilesPlayerController],
  providers: [
    CreatorStateService,
    StudioPrefsService,
    StudioStylesService,
    StudioFilesService,
    SubmissionsService,
    StudioAiService,
    StudioErasure,
    { provide: AI_AVAILABILITY, inject: [ENV], useFactory: (env: Env) => new AiAvailability(env) },
  ],
  exports: [StudioErasure, CreatorStateService, AI_AVAILABILITY, StudioFilesService],
})
export class StudioModule {}
