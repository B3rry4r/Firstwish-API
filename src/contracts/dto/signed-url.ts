// Request validation for signed-url endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsOptional, IsString } from "class-validator";
import type { InternalSignedUrlsSignedReadBody, InternalSignedUrlsSignedReadParams } from "../types";

/** E-173 INTERNAL port:signed-urls#signedRead (body). */
export class InternalSignedUrlsSignedReadBodyDto implements InternalSignedUrlsSignedReadBody {
  @IsString()
  fileId!: string;
  @IsOptional()
  @IsString()
  variant?: string;
}
export class InternalSignedUrlsSignedReadParamsDto implements InternalSignedUrlsSignedReadParams {
  @IsString()
  signed!: string;
}
