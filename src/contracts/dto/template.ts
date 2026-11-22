// Request validation for template endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetStudioTemplatesQuery } from "../types";

/** E-212 GET /v1/studio/templates (query). */
export class GetStudioTemplatesQueryDto implements GetStudioTemplatesQuery {
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
