// Request validation for maker endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetAdminConciergeMakersQuery } from "../types";

/** E-69 GET /v1/admin/concierge/makers (query). */
export class GetAdminConciergeMakersQueryDto implements GetAdminConciergeMakersQuery {
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
