// Request validation for earnings-summary endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsDateOnly } from "../../common/validation/decorators";
import type { GetAdminEarningsQuery, DateOnly } from "../types";

/** E-50 GET /v1/admin/earnings (query). */
export class GetAdminEarningsQueryDto implements GetAdminEarningsQuery {
  @IsDateOnly()
  from!: DateOnly;
  @IsDateOnly()
  to!: DateOnly;
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
