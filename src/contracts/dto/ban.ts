// Request validation for ban endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import { MinTrimmed } from "../../common/validation/decorators";
import type { DeleteAdminBansByIdBody, DeleteAdminBansByIdParams, PostAdminBansBody } from "../types";

/** E-21 POST /v1/admin/bans (body). */
export class PostAdminBansBodyDto implements PostAdminBansBody {
  @IsString()
  accountId!: string;
  @IsString()
  reason!: string;
  @IsString()
  scope!: string;
}

/** E-242 DELETE /v1/admin/bans/:id (body). */
export class DeleteAdminBansByIdBodyDto implements DeleteAdminBansByIdBody {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class DeleteAdminBansByIdParamsDto implements DeleteAdminBansByIdParams {
  @IsString()
  id!: string;
}
