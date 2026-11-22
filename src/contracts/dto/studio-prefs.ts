// Request validation for studio-prefs endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import type { PatchStudioPrefsBody } from "../types";

/** E-185 GET /v1/studio/prefs (query). */
export class GetStudioPrefsQueryDto {}

/** E-186 PATCH /v1/studio/prefs (body). */
export class PatchStudioPrefsBodyDto implements PatchStudioPrefsBody {
  @IsOptional()
  @IsString()
  addTab?: string;
  @IsOptional()
  @IsString()
  bottom?: string;
  @IsOptional()
  @IsBoolean()
  coached?: boolean;
  @IsOptional()
  @IsArray()
  fav?: unknown[];
  @IsOptional()
  @IsArray()
  looks?: unknown[];
  @IsOptional()
  @IsArray()
  recent?: unknown[];
  @IsOptional()
  @IsString()
  span?: string;
}
