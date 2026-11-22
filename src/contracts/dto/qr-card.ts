// Request validation for qr-card endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsArray, IsOptional, IsString } from "class-validator";
import type { PostQrCardsBody } from "../types";

/** E-141 POST /v1/qr-cards (body). */
export class PostQrCardsBodyDto implements PostQrCardsBody {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  names?: string[];
  @IsOptional()
  @IsString()
  wishId?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wishIds?: string[];
}
