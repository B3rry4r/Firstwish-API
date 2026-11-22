import { Module } from "@nestjs/common";
import { PeopleModule } from "../people/people.module";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";

/** Business profile: the brand (E-26). The row itself is made by the business side (E-9, accounts). */
@Module({ imports: [PeopleModule], controllers: [BusinessController], providers: [BusinessService], exports: [BusinessService] })
export class BusinessModule {}
