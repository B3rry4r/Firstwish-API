import { Module } from "@nestjs/common";
import { FileJobs } from "./file-jobs";
import { PhotoCleaner } from "./photo-cleaner";
import { ScreeningService } from "./screening.service";
import { SignedUrlsService } from "./signed-urls.service";
import { StoredFilesController } from "./stored-files.controller";
import { StoredFilesService } from "./stored-files.service";

/**
 * StoredFile and UploadTicket (E-182..E-184), SignedUrl (E-173, exported: SignedUrlsService.signedRead), the screening run
 * (E-158, ScreeningService.screenFile) and the file jobs (FileJobs, for the jobs frame).
 */
@Module({
  controllers: [StoredFilesController],
  providers: [StoredFilesService, ScreeningService, SignedUrlsService, FileJobs, PhotoCleaner],
  exports: [StoredFilesService, ScreeningService, SignedUrlsService, FileJobs, PhotoCleaner],
})
export class StoredFilesModule {}
