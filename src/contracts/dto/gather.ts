// Request validation for the gather link endpoints (HS1, API-BASE-6).
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { DeleteWishesByIdGatherVoicesByVoiceIdParams, GetGBySlugParams, GetWishesByIdGatherParams, PostGBySlugVoiceBody, PostGBySlugVoiceByIdConfirmParams, PostGBySlugVoiceParams, PostWishesByIdGatherOffParams } from "../types";

/** E-260 GET /v1/wishes/:id/gather (query). */
export class GetWishesByIdGatherQueryDto {}
export class GetWishesByIdGatherParamsDto implements GetWishesByIdGatherParams {
  @IsString()
  id!: string;
}

/** E-261 POST /v1/wishes/:id/gather/off (body). */
export class PostWishesByIdGatherOffBodyDto {}
export class PostWishesByIdGatherOffParamsDto implements PostWishesByIdGatherOffParams {
  @IsString()
  id!: string;
}

/** E-262 DELETE /v1/wishes/:id/gather/voices/:voiceId (body). */
export class DeleteWishesByIdGatherVoicesByVoiceIdBodyDto {}
export class DeleteWishesByIdGatherVoicesByVoiceIdParamsDto implements DeleteWishesByIdGatherVoicesByVoiceIdParams {
  @IsString()
  id!: string;
  @IsString()
  voiceId!: string;
}

/** E-263 GET /v1/g/:slug (query). */
export class GetGBySlugQueryDto {}
export class GetGBySlugParamsDto implements GetGBySlugParams {
  @IsString()
  slug!: string;
}

/** E-264 POST /v1/g/:slug/voice (body). */
export class PostGBySlugVoiceBodyDto implements PostGBySlugVoiceBody {
  @IsString()
  @MaxLength(200)
  name!: string;
  @IsString()
  @MaxLength(100)
  contentType!: string;
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  bytes!: number;
  @IsOptional()
  @IsNumber()
  seconds?: number;
}
export class PostGBySlugVoiceParamsDto implements PostGBySlugVoiceParams {
  @IsString()
  slug!: string;
}

/** E-265 POST /v1/g/:slug/voice/:id/confirm (body). */
export class PostGBySlugVoiceByIdConfirmBodyDto {}
export class PostGBySlugVoiceByIdConfirmParamsDto implements PostGBySlugVoiceByIdConfirmParams {
  @IsString()
  slug!: string;
  @IsString()
  id!: string;
}
