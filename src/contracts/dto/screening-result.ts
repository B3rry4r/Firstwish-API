// Request validation for screening-result endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { Allow, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminScreeningResultsQuery, InternalScreeningResultsScreenFileBody, InternalScreeningResultsScreenFileParams, PostAdminScreeningResultsByIdDecisionBody, PostAdminScreeningResultsByIdDecisionParams } from "../types";

/** E-237 GET /v1/admin/screening-results (query). */
export class GetAdminScreeningResultsQueryDto implements GetAdminScreeningResultsQuery {
  @IsOptional()
  @IsIn(["pass", "review", "reject"])
  verdict?: "pass" | "review" | "reject";
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

/** E-157 POST /v1/admin/screening-results/:id/decision (body). */
export class PostAdminScreeningResultsByIdDecisionBodyDto implements PostAdminScreeningResultsByIdDecisionBody {
  @Allow()
  finalVerdict!: unknown;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class PostAdminScreeningResultsByIdDecisionParamsDto implements PostAdminScreeningResultsByIdDecisionParams {
  @IsString()
  id!: string;
}

/** E-158 INTERNAL port:screening-results#screenFile (body). */
export class InternalScreeningResultsScreenFileBodyDto implements InternalScreeningResultsScreenFileBody {
  @IsString()
  fileId!: string;
}
export class InternalScreeningResultsScreenFileParamsDto implements InternalScreeningResultsScreenFileParams {
  @IsString()
  screening!: string;
}
