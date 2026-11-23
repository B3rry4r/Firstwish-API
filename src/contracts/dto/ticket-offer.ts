// Request validation for ticket-offer endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsArray, IsOptional, IsString } from "class-validator";
import type { GetTicketOffersQuery } from "../types";

/** E-213 GET /v1/ticket-offers (query). */
export class GetTicketOffersQueryDto implements GetTicketOffersQuery {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras?: string[];
  /** IL3: required unless `wish` names the person's own wish (then the answer lists every ticket); the service asks for it after the business gate. */
  @IsOptional()
  @IsString()
  ticket?: string;
  @IsOptional()
  @IsString()
  wish?: string;
}
