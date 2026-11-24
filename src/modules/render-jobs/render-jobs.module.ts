import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { PriceBookModule } from "../price-book/price-book.module";
import { ServerFilesModule } from "../server-files/server-files";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { RenderJobsController } from "./render-jobs.controller";
import { RenderJobsService } from "./render-jobs.service";
import { ENV } from "../../common/env/env.module";
import { RenderTokens } from "./render-token";
import { VideoRenderer, videoRendererFor } from "./video-renderer";

/** The video job (B19, E-147, E-148). With PROVIDERS=standin the stand-in renderer is bound; with live providers the one that says it is not configured, until a real one is built (IK3). */
@Module({
  imports: [JobsModule, PriceBookModule, ServerFilesModule, StoredFilesModule],
  controllers: [RenderJobsController],
  providers: [RenderJobsService, RenderTokens, { provide: VideoRenderer, inject: [ENV], useFactory: videoRendererFor }],
  exports: [RenderJobsService, VideoRenderer, RenderTokens],
})
export class RenderJobsModule {}
