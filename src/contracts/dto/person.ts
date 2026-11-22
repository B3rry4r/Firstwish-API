// Request validation for person endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { Allow, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { IsCanonPhone, IsDateOnly } from "../../common/validation/decorators";
import type { DeleteBusinessPeopleByIdParams, GetBusinessPeopleQuery, PatchBusinessPeopleByIdBody, PatchBusinessPeopleByIdParams, PostBusinessPeopleBody, PostBusinessPeopleImportBody, DateOnly } from "../types";

/** E-117 GET /v1/business/people (query). */
export class GetBusinessPeopleQueryDto implements GetBusinessPeopleQuery {
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

/** E-118 POST /v1/business/people (body). */
export class PostBusinessPeopleBodyDto implements PostBusinessPeopleBody {
  @IsOptional()
  @ValidateIf((o: Record<string, unknown>) => o["birthday"] !== "")
  @IsDateOnly()
  birthday?: DateOnly;
  @IsString()
  name!: string;
  @IsCanonPhone()
  phone!: string;
  @IsOptional()
  @ValidateIf((o: Record<string, unknown>) => o["start"] !== "")
  @IsDateOnly()
  start?: DateOnly;
  @IsString()
  team!: string;
}

/** E-119 DELETE /v1/business/people/:id (body). */
export class DeleteBusinessPeopleByIdBodyDto {}
export class DeleteBusinessPeopleByIdParamsDto implements DeleteBusinessPeopleByIdParams {
  @IsString()
  id!: string;
}

/** E-120 PATCH /v1/business/people/:id (body). */
export class PatchBusinessPeopleByIdBodyDto implements PatchBusinessPeopleByIdBody {
  @IsOptional()
  @ValidateIf((o: Record<string, unknown>) => o["birthday"] !== "")
  @IsDateOnly()
  birthday?: DateOnly;
  @IsString()
  name!: string;
  @IsCanonPhone()
  phone!: string;
  @IsOptional()
  @ValidateIf((o: Record<string, unknown>) => o["start"] !== "")
  @IsDateOnly()
  start?: DateOnly;
  @IsString()
  team!: string;
}
export class PatchBusinessPeopleByIdParamsDto implements PatchBusinessPeopleByIdParams {
  @IsString()
  id!: string;
}

/** E-121 POST /v1/business/people/import (body). */
export class PostBusinessPeopleImportBodyDto implements PostBusinessPeopleImportBody {
  @Allow()
  rows!: unknown;
}
