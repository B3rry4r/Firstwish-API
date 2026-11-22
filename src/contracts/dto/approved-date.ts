// Request validation for approved-date endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { DeleteBusinessApprovedDatesBody, GetBusinessApprovedDatesQuery, PostBusinessApprovedDatesBody } from "../types";

/** E-238 DELETE /v1/business/approved-dates (body). */
export class DeleteBusinessApprovedDatesBodyDto implements DeleteBusinessApprovedDatesBody {
  @IsIn(["b", "s"])
  kind!: "b" | "s";
  @IsString()
  personId!: string;
  @IsInt()
  year!: number;
}

/** E-17 GET /v1/business/approved-dates (query). */
export class GetBusinessApprovedDatesQueryDto implements GetBusinessApprovedDatesQuery {
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

/** E-239 POST /v1/business/approved-dates (body). */
export class PostBusinessApprovedDatesBodyDto implements PostBusinessApprovedDatesBody {
  @IsIn(["b", "s"])
  kind!: "b" | "s";
  @IsString()
  personId!: string;
  @IsInt()
  year!: number;
}
