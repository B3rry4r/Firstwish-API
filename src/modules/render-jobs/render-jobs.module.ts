import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { PriceBookModule } from "../price-book/price-book.module";
import { ServerFilesModule } from "../server-files/server-files";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { RenderJobsController } from "./render-jobs.controller";
import { RenderJobsService } from "./render-jobs.service";
import { ENV } from "../../common/env/env.module";
import { PrismaService } from "../../common/db/prisma.service";
import { RenderTokens } from "./render-token";
import { Clock } from "../../common/ports/clock.port";
import { RenderWorker } from "./render-worker.service";
import { VideoRenderer } from "./video-renderer";
import { bindVideoRenderer } from "./video-binding";

/** The video job (B19, E-147, E-148). R6: PROVIDERS=live binds the real recorder when it can work (checked once at boot), else the one that says it is not configured (IK3); PROVIDERS=standin binds the stand-in unless RENDER_ADAPTER=chromium. */
@Module({
  imports: [JobsModule, PriceBookModule, ServerFilesModule, StoredFilesModule],
  controllers: [RenderJobsController],
  providers: [RenderJobsService, RenderWorker, RenderTokens, { provide: VideoRenderer, inject: [ENV, PrismaService, Clock], useFactory: bindVideoRenderer }],
  exports: [RenderJobsService, RenderWorker, VideoRenderer, RenderTokens],
})
export class RenderJobsModule {}
