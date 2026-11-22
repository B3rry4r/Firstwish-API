// Request validation for ending-purpose endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetEndingPurposesQuery } from "../types";

/** E-51 GET /v1/ending-purposes (query). */
export class GetEndingPurposesQueryDto implements GetEndingPurposesQuery {
  @IsOptional()
  @IsString()
  cursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
