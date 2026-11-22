// Request validation for price-book-version endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsInstant, MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminPriceBookVersionsQuery, PostAdminPriceBookVersionsBody, PostAdminPriceBookVersionsByIdPublishBody, PostAdminPriceBookVersionsByIdPublishParams, Instant } from "../types";

/** E-256 GET /v1/admin/price-book-versions (query). */
export class GetAdminPriceBookVersionsQueryDto implements GetAdminPriceBookVersionsQuery {
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

/** E-126 POST /v1/admin/price-book-versions (body). */
export class PostAdminPriceBookVersionsBodyDto implements PostAdminPriceBookVersionsBody {
  @IsInstant()
  effectiveFrom!: Instant;
  @IsString()
  note!: string;
  @IsArray()
  prices!: unknown[];
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}

/** E-127 POST /v1/admin/price-book-versions/:id/publish (body). */
export class PostAdminPriceBookVersionsByIdPublishBodyDto implements PostAdminPriceBookVersionsByIdPublishBody {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsInt()
  version!: number;
}
export class PostAdminPriceBookVersionsByIdPublishParamsDto implements PostAdminPriceBookVersionsByIdPublishParams {
  @IsString()
  id!: string;
}
