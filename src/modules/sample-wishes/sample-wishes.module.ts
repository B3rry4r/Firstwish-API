import { Module } from "@nestjs/common";
import { SampleWishesController } from "./sample-wishes.controller";
import { SampleWishesService } from "./sample-wishes.service";

/** IJ1: the designed sample wishes as reference data. */
@Module({ controllers: [SampleWishesController], providers: [SampleWishesService] })
export class SampleWishesModule {}
