// Request validation for day-pick endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminShowingDaysQuery, PutAdminShowingDayByDateBody, PutAdminShowingDayByDateParams } from "../types";

/** E-49 PUT /v1/admin/showing/day/:date (body). */
export class PutAdminShowingDayByDateBodyDto implements PutAdminShowingDayByDateBody {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsString()
  wish!: string;
}
export class PutAdminShowingDayByDateParamsDto implements PutAdminShowingDayByDateParams {
  @IsString()
  date!: string;
}

/** E-255 GET /v1/admin/showing/days (query). */
export class GetAdminShowingDaysQueryDto implements GetAdminShowingDaysQuery {
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
