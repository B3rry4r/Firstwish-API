// Request validation for the sample-wish endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsOptional, IsString } from "class-validator";
import type { GetSampleWishesByKindByOccasionParams, GetSampleWishesQuery } from "../types";

/** E-288 GET /v1/sample-wishes/:kind/:occasion (path). A spelling that names no sample is a 404 in words, so only the type is checked here. */
export class GetSampleWishesByKindByOccasionParamsDto implements GetSampleWishesByKindByOccasionParams {
  @IsString()
  kind!: string;
  @IsString()
  occasion!: string;
}
/** E-288 has no query. */
export class GetSampleWishesByKindByOccasionQueryDto {}

/** E-287 GET /v1/sample-wishes (query). */
export class GetSampleWishesQueryDto implements GetSampleWishesQuery {
  @IsOptional()
  @IsString()
  kind?: string;
}
