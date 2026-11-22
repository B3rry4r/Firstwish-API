// Request validation for notice endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetAdminMessagesTemplatesQuery, GetMeNoticesQuery, PutAdminMessagesTemplatesByKeyBody, PutAdminMessagesTemplatesByKeyParams } from "../types";

/** E-75 GET /v1/admin/messages/templates (query). */
export class GetAdminMessagesTemplatesQueryDto implements GetAdminMessagesTemplatesQuery {
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

/** E-76 PUT /v1/admin/messages/templates/:key (body). */
export class PutAdminMessagesTemplatesByKeyBodyDto implements PutAdminMessagesTemplatesByKeyBody {
  @IsString()
  @MinTrimmed(1)
  body!: string;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsString()
  @MinTrimmed(1)
  subject!: string;
}
export class PutAdminMessagesTemplatesByKeyParamsDto implements PutAdminMessagesTemplatesByKeyParams {
  @IsString()
  key!: string;
}

/** E-77 GET /v1/me/notices (query). */
export class GetMeNoticesQueryDto implements GetMeNoticesQuery {
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
