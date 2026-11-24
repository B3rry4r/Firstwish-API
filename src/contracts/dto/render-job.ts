// Request validation for render-job endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsOptional, IsString } from "class-validator";
import type { GetRenderByTokenWishParams, GetWishesByIdVideoParams, PostWishesByIdVideoBody, PostWishesByIdVideoParams } from "../types";

/** E-147 GET /v1/wishes/:id/video (query). */
export class GetWishesByIdVideoQueryDto {}
export class GetWishesByIdVideoParamsDto implements GetWishesByIdVideoParams {
  @IsString()
  id!: string;
}

/** E-148 POST /v1/wishes/:id/video (body). */
export class PostWishesByIdVideoBodyDto implements PostWishesByIdVideoBody {
  @IsOptional()
  @IsString()
  wishId?: string;
}
export class PostWishesByIdVideoParamsDto implements PostWishesByIdVideoParams {
  @IsString()
  id!: string;
}

/** E-289 GET /v1/render/:token/wish (query). */
export class GetRenderByTokenWishQueryDto {}
export class GetRenderByTokenWishParamsDto implements GetRenderByTokenWishParams {
  @IsString()
  token!: string;
}
