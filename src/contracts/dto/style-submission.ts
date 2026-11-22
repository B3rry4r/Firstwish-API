// Request validation for style-submission endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { Allow, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminStylesReviewQuery, PostAdminStylesReviewByIdDecideBody, PostAdminStylesReviewByIdDecideParams, PostStudioStylesByIdSubmissionsBody, PostStudioStylesByIdSubmissionsParams } from "../types";

/** E-200 GET /v1/admin/styles/review (query). */
export class GetAdminStylesReviewQueryDto implements GetAdminStylesReviewQuery {
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

/** E-201 POST /v1/admin/styles/review/:id/decide (body). */
export class PostAdminStylesReviewByIdDecideBodyDto implements PostAdminStylesReviewByIdDecideBody {
  @IsIn(["approve", "return"])
  decision!: "approve" | "return";
  @IsOptional()
  @IsIn(["standard", "premium"])
  level?: "standard" | "premium";
  @IsOptional()
  @IsString()
  note?: string;
  @IsOptional()
  @IsString()
  @MinTrimmed(4)
  reason?: string;
}
export class PostAdminStylesReviewByIdDecideParamsDto implements PostAdminStylesReviewByIdDecideParams {
  @IsString()
  id!: string;
}

/** E-202 POST /v1/studio/styles/:id/submissions (body). */
export class PostStudioStylesByIdSubmissionsBodyDto implements PostStudioStylesByIdSubmissionsBody {
  @IsOptional()
  @Allow()
  style?: unknown;
  @IsOptional()
  @IsString()
  styleId?: string;
  @IsOptional()
  @IsBoolean()
  useExtra?: boolean;
}
export class PostStudioStylesByIdSubmissionsParamsDto implements PostStudioStylesByIdSubmissionsParams {
  @IsString()
  id!: string;
}
