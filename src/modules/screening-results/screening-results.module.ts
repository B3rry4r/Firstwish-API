import { Module } from "@nestjs/common";
import { ScreeningResultsController } from "./screening-results.controller";
import { ScreeningResultsService } from "./screening-results.service";

/** ScreeningResult: the moderator's decision on a held file (E-157) and the staff queue (exported). E-158 is ScreeningService. */
@Module({ controllers: [ScreeningResultsController], providers: [ScreeningResultsService], exports: [ScreeningResultsService] })
export class ScreeningResultsModule {}
