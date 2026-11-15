import { Module } from "@nestjs/common";
import { BusinessOf } from "./business-of";
import { PeopleController } from "./people.controller";
import { PeopleService } from "./people.service";

/** Person (a business's people) and ApprovedDate (the dates a business approved for them), B12. */
@Module({
  controllers: [PeopleController],
  providers: [PeopleService, BusinessOf],
  exports: [PeopleService, BusinessOf],
})
export class PeopleModule {}
