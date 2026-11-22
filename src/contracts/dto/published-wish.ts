// Request validation for published-wish endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminShowingQuery, GetCreatorsByHandleWishesParams, GetCreatorsByHandleWishesQuery, GetShowingQuery, GetStylesByIdWishesParams, GetStylesByIdWishesQuery, PostAdminShowingListedByNoUnlistBody, PostAdminShowingListedByNoUnlistParams } from "../types";

/** E-138 GET /v1/admin/showing (query). */
export class GetAdminShowingQueryDto implements GetAdminShowingQuery {
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

/** E-139 POST /v1/admin/showing/listed/:no/unlist (body). */
export class PostAdminShowingListedByNoUnlistBodyDto implements PostAdminShowingListedByNoUnlistBody {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class PostAdminShowingListedByNoUnlistParamsDto implements PostAdminShowingListedByNoUnlistParams {
  @IsString()
  no!: string;
}

/** E-140 GET /v1/showing (query). */
export class GetShowingQueryDto implements GetShowingQuery {
  @IsOptional()
  @IsString()
  style?: string;
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

/** E-283 GET /v1/creators/:handle/wishes (query). */
export class GetCreatorsByHandleWishesQueryDto implements GetCreatorsByHandleWishesQuery {
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
export class GetCreatorsByHandleWishesParamsDto implements GetCreatorsByHandleWishesParams {
  @IsString()
  handle!: string;
}

/** E-284 GET /v1/styles/:id/wishes (query). */
export class GetStylesByIdWishesQueryDto implements GetStylesByIdWishesQuery {
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
export class GetStylesByIdWishesParamsDto implements GetStylesByIdWishesParams {
  @IsString()
  id!: string;
}
