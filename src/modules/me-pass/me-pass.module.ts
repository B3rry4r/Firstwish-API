import { Module } from "@nestjs/common";
import { MePassController } from "./me-pass.controller";
import { MePassService } from "./me-pass.service";

/** The Pass read (B22, E-83). */
@Module({ controllers: [MePassController], providers: [MePassService] })
export class MePassModule {}
