import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { PriceBookModule } from "../price-book/price-book.module";
import { ServerFilesModule } from "../server-files/server-files";
import { RenderJobsController } from "./render-jobs.controller";
import { RenderJobsService } from "./render-jobs.service";
import { NoVideoRenderer, VideoRenderer } from "./video-renderer";

/** The video job (B19, E-147, E-148). The renderer is bound to the one that says it is not configured until a real one is built. */
@Module({
  imports: [JobsModule, PriceBookModule, ServerFilesModule],
  controllers: [RenderJobsController],
  providers: [RenderJobsService, { provide: VideoRenderer, useClass: NoVideoRenderer }],
  exports: [RenderJobsService, VideoRenderer],
})
export class RenderJobsModule {}
