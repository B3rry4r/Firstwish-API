import { Module } from "@nestjs/common";
import { AdminStylesController } from "./admin-styles.controller";
import { ApprovedStyleDocuments } from "./approved-document";
import { StylesController } from "./styles.controller";
import { StylesService } from "./styles.service";

/** The server's style record (DEC-69): slug, level, on/off, creator and use counts; the staff Styles page. */
@Module({ controllers: [StylesController, AdminStylesController], providers: [StylesService, ApprovedStyleDocuments], exports: [StylesService, ApprovedStyleDocuments] })
export class StylesModule {}
