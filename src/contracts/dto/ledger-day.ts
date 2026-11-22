// Request validation for ledger-day endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsOptional } from "class-validator";
import { IsDateOnly } from "../../common/validation/decorators";
import type { GetAdminLedgerQuery, DateOnly } from "../types";

/** E-63 GET /v1/admin/ledger (query). */
export class GetAdminLedgerQueryDto implements GetAdminLedgerQuery {
  @IsOptional()
  @IsDateOnly()
  day?: DateOnly;
}
