// Request validation for payout endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { MinTrimmed } from "../../common/validation/decorators";
import type { GetCreatorPayoutsQuery, PostAdminCreatorsPayoutsByCreatorPaidBody, PostAdminCreatorsPayoutsByCreatorPaidParams, PostAdminPayoutRunsByIdApproveBody, PostAdminPayoutRunsByIdApproveParams } from "../types";

/** E-114 POST /v1/admin/creators/payouts/:creator/paid (body). */
export class PostAdminCreatorsPayoutsByCreatorPaidBodyDto implements PostAdminCreatorsPayoutsByCreatorPaidBody {
  @IsString()
  month!: string;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class PostAdminCreatorsPayoutsByCreatorPaidParamsDto implements PostAdminCreatorsPayoutsByCreatorPaidParams {
  @IsString()
  creator!: string;
}

/** E-115 POST /v1/admin/payout-runs/:id/approve (body). */
export class PostAdminPayoutRunsByIdApproveBodyDto implements PostAdminPayoutRunsByIdApproveBody {
  @IsString()
  month!: string;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
export class PostAdminPayoutRunsByIdApproveParamsDto implements PostAdminPayoutRunsByIdApproveParams {
  @IsString()
  id!: string;
}

/** E-116 GET /v1/creator/payouts (query). */
export class GetCreatorPayoutsQueryDto implements GetCreatorPayoutsQuery {
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
