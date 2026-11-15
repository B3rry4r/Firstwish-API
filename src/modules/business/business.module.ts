import { Module } from "@nestjs/common";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";

/** Business profile: the brand (E-26). The row itself is made by the business side (E-9, accounts). */
@Module({ controllers: [BusinessController], providers: [BusinessService], exports: [BusinessService] })
export class BusinessModule {}
