// Request validation for login endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { DeleteBusinessLoginsByIdParams, GetBusinessLoginsQuery, PostBusinessLoginsBody } from "../types";

/** E-66 GET /v1/business/logins (query). */
export class GetBusinessLoginsQueryDto implements GetBusinessLoginsQuery {
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

/** E-67 POST /v1/business/logins (body). */
export class PostBusinessLoginsBodyDto implements PostBusinessLoginsBody {
  @IsString()
  contact!: string;
}

/** E-68 DELETE /v1/business/logins/:id (body). */
export class DeleteBusinessLoginsByIdBodyDto {}
export class DeleteBusinessLoginsByIdParamsDto implements DeleteBusinessLoginsByIdParams {
  @IsString()
  id!: string;
}
