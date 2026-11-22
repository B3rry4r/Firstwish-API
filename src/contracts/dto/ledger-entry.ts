// Request validation for ledger-entry endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsDateOnly } from "../../common/validation/decorators";
import type { GetAdminLedgerEntriesQuery, InternalLedgerDailySettlementParams, DateOnly } from "../types";

/** E-64 GET /v1/admin/ledger-entries (query). */
export class GetAdminLedgerEntriesQueryDto implements GetAdminLedgerEntriesQuery {
  @IsOptional()
  @IsString()
  account?: string;
  @IsDateOnly()
  from!: DateOnly;
  @IsDateOnly()
  to!: DateOnly;
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

/** E-65 INTERNAL port:ledger#daily-settlement (body). */
export class InternalLedgerDailySettlementBodyDto {}
export class InternalLedgerDailySettlementParamsDto implements InternalLedgerDailySettlementParams {
  @IsString()
  ledger!: string;
}
