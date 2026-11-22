// Request validation for session endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetSessionsQuery } from "../types";

/** E-159 POST /v1/auth/refresh (body). */
export class PostAuthRefreshBodyDto {}

/** E-160 POST /v1/auth/sign-out (body). */
export class PostAuthSignOutBodyDto {}

/** E-161 POST /v1/auth/sign-out-everywhere (body). */
export class PostAuthSignOutEverywhereBodyDto {}

/** E-162 GET /v1/sessions (query). */
export class GetSessionsQueryDto implements GetSessionsQuery {
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
