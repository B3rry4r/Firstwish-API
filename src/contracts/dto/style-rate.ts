// Request validation for style-rate endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetAdminStylesPreviewToPaidQuery } from "../types";

/** E-199 GET /v1/admin/styles/preview-to-paid (query). */
export class GetAdminStylesPreviewToPaidQueryDto implements GetAdminStylesPreviewToPaidQuery {
  @IsString()
  quarter!: string;
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
