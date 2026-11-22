// Request validation for numbers endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsIn, IsString } from "class-validator";
import { IsKobo, MinTrimmed } from "../../common/validation/decorators";
import type { PutAdminNumbersTargetsBody, Kobo } from "../types";

/** E-79 GET /v1/admin/numbers (query). */
export class GetAdminNumbersQueryDto {}

/** E-80 PUT /v1/admin/numbers/targets (body). */
export class PutAdminNumbersTargetsBodyDto implements PutAdminNumbersTargetsBody {
  @IsIn(["tickets", "extras", "keeps", "pass", "pro_plans", "vault_space", "concierge", "creator_plans"])
  line!: "tickets" | "extras" | "keeps" | "pass" | "pro_plans" | "vault_space" | "concierge" | "creator_plans";
  @IsIn(["month"])
  period!: "month";
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsKobo()
  targetKobo!: Kobo;
}
