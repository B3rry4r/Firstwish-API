// Request validation for play-wish endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { GetPlayWishesByIdParams } from "../types";

/** E-122 GET /v1/play-wishes/:id (query). */
export class GetPlayWishesByIdQueryDto {}
export class GetPlayWishesByIdParamsDto implements GetPlayWishesByIdParams {
  @IsString()
  id!: string;
}
