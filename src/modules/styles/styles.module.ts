import { Module } from "@nestjs/common";
import { AdminStylesController } from "./admin-styles.controller";
import { StylesController } from "./styles.controller";
import { StylesService } from "./styles.service";

/** The server's style record (DEC-69): slug, level, on/off, creator and use counts; the staff Styles page. */
@Module({ controllers: [StylesController, AdminStylesController], providers: [StylesService], exports: [StylesService] })
export class StylesModule {}
