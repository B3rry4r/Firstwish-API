// Request validation for saved-reply endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { DeleteAdminSupportSavedRepliesByIdBody, DeleteAdminSupportSavedRepliesByIdParams, GetAdminSupportSavedRepliesQuery, PatchAdminSupportSavedRepliesByIdBody, PatchAdminSupportSavedRepliesByIdParams, PostAdminSupportSavedRepliesBody } from "../types";

/** E-250 GET /v1/admin/support/saved-replies (query). */
export class GetAdminSupportSavedRepliesQueryDto implements GetAdminSupportSavedRepliesQuery {
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

/** E-251 POST /v1/admin/support/saved-replies (body). */
export class PostAdminSupportSavedRepliesBodyDto implements PostAdminSupportSavedRepliesBody {
  @IsString()
  name!: string;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsString()
  @MinTrimmed(1)
  text!: string;
}

/** E-252 DELETE /v1/admin/support/saved-replies/:id (body). */
export class DeleteAdminSupportSavedRepliesByIdBodyDto implements DeleteAdminSupportSavedRepliesByIdBody {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class DeleteAdminSupportSavedRepliesByIdParamsDto implements DeleteAdminSupportSavedRepliesByIdParams {
  @IsString()
  id!: string;
}

/** E-253 PATCH /v1/admin/support/saved-replies/:id (body). */
export class PatchAdminSupportSavedRepliesByIdBodyDto implements PatchAdminSupportSavedRepliesByIdBody {
  @IsOptional()
  @IsString()
  name?: string;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsOptional()
  @IsString()
  text?: string;
}
export class PatchAdminSupportSavedRepliesByIdParamsDto implements PatchAdminSupportSavedRepliesByIdParams {
  @IsString()
  id!: string;
}
