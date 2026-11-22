// Request validation for report endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminModerationQuery, PostAdminModerationByIdDecideBody, PostAdminModerationByIdDecideParams, PostReportsBody } from "../types";

/** E-149 GET /v1/admin/moderation (query). */
export class GetAdminModerationQueryDto implements GetAdminModerationQuery {
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

/** E-150 POST /v1/admin/moderation/:id/decide (body). */
export class PostAdminModerationByIdDecideBodyDto implements PostAdminModerationByIdDecideBody {
  @IsIn(["take_down", "keep", "ban"])
  decision!: "take_down" | "keep" | "ban";
  @IsOptional()
  @IsString()
  @MinTrimmed(4)
  reason?: string;
}
export class PostAdminModerationByIdDecideParamsDto implements PostAdminModerationByIdDecideParams {
  @IsString()
  id!: string;
}

/** E-151 POST /v1/reports (body). */
export class PostReportsBodyDto implements PostReportsBody {
  @IsOptional()
  @IsString()
  note?: string;
  @IsString()
  reason!: string;
  @IsString()
  slug!: string;
}
