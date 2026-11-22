// Request validation for invoice endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import type { GetBusinessInvoicesByIdFileParams, GetBusinessInvoicesQuery } from "../types";

/** E-59 GET /v1/business/invoices (query). */
export class GetBusinessInvoicesQueryDto implements GetBusinessInvoicesQuery {
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

/** E-60 GET /v1/business/invoices/:id/file (query). */
export class GetBusinessInvoicesByIdFileQueryDto {}
export class GetBusinessInvoicesByIdFileParamsDto implements GetBusinessInvoicesByIdFileParams {
  @IsString()
  id!: string;
}
