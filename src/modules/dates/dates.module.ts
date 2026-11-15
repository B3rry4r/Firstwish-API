import { Module } from "@nestjs/common";
import { PeopleModule } from "../people/people.module";
import { DatesController } from "./dates.controller";
import { DatesService } from "./dates.service";

/** DateRow: a person's remembered dates (B12). */
@Module({
  imports: [PeopleModule],
  controllers: [DatesController],
  providers: [DatesService],
  exports: [DatesService],
})
export class DatesModule {}
