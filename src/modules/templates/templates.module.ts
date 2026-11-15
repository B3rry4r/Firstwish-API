import { Module } from "@nestjs/common";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

/** House Studio templates (E-212). */
@Module({ controllers: [TemplatesController], providers: [TemplatesService] })
export class TemplatesModule {}
