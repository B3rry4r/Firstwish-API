// Request validation for style endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminStylesQuery, GetCreatorsByHandleStylesParams, GetCreatorsByHandleStylesQuery, GetStylesByIdParams, GetStylesQuery, PostAdminStylesBySlugSwitchBody, PostAdminStylesBySlugSwitchParams } from "../types";

/** E-193 GET /v1/admin/styles (query). */
export class GetAdminStylesQueryDto implements GetAdminStylesQuery {
  @IsOptional()
  @IsIn(["starter", "standard", "premium"])
  level?: "starter" | "standard" | "premium";
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

/** E-194 POST /v1/admin/styles/:slug/switch (body). */
export class PostAdminStylesBySlugSwitchBodyDto implements PostAdminStylesBySlugSwitchBody {
  @IsBoolean()
  on!: boolean;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class PostAdminStylesBySlugSwitchParamsDto implements PostAdminStylesBySlugSwitchParams {
  @IsString()
  slug!: string;
}

/** E-195 GET /v1/styles (query). */
export class GetStylesQueryDto implements GetStylesQuery {
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

/** E-196 GET /v1/styles/:id (query). */
export class GetStylesByIdQueryDto {}
export class GetStylesByIdParamsDto implements GetStylesByIdParams {
  @IsString()
  id!: string;
}

/** E-285 GET /v1/creators/:handle/styles (query). */
export class GetCreatorsByHandleStylesQueryDto implements GetCreatorsByHandleStylesQuery {
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
export class GetCreatorsByHandleStylesParamsDto implements GetCreatorsByHandleStylesParams {
  @IsString()
  handle!: string;
}
