import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

/** App events (E-52) and the server's own (EventsService.record: a wish paid in a style). Style counts sum these rows. */
@Module({ controllers: [EventsController], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
