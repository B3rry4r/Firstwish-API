import { Module } from "@nestjs/common";
import { ReferenceDataController } from "./reference-data.controller";
import { ReferenceDataService } from "./reference-data.service";

/** B23: the maker's reference reads (chapter specs, ending purposes, moments, opening definitions). */
@Module({ controllers: [ReferenceDataController], providers: [ReferenceDataService] })
export class ReferenceDataModule {}
