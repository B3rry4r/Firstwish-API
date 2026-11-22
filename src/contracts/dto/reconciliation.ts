// Request validation for reconciliation endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import { IsDateOnly, MinTrimmed } from "../../common/validation/decorators";
import type { PostAdminReconciliationsBody, DateOnly } from "../types";

/** E-144 POST /v1/admin/reconciliations (body). */
export class PostAdminReconciliationsBodyDto implements PostAdminReconciliationsBody {
  @IsDateOnly()
  day!: DateOnly;
  @IsString()
  @MinTrimmed(4)
  reason!: string;
}
