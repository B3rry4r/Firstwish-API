// Request validation for royalty-accrual endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetCreatorEarningsQuery } from "../types";

/** E-154 GET /v1/creator/earnings (query). */
export class GetCreatorEarningsQueryDto implements GetCreatorEarningsQuery {
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
