import { Module } from "@nestjs/common";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { CreatorsController } from "./creators.controller";
import { CreatorsService } from "./creators.service";

/** Creator: the public list of creator pages (E-42). The profile itself is written by the creator side (E-11, accounts). */
@Module({ imports: [StoredFilesModule], controllers: [CreatorsController], providers: [CreatorsService] })
export class CreatorsModule {}
