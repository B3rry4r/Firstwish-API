import { Type } from "class-transformer";
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * E-225 PATCH /v1/wishes/:id. The registry body is the web app's old whole-wish write; the draft is saved in parts, and a stale
 * write needs the `version` the page last read, so this is the body (listed in the hand-back as a registry gap).
 */
export class PatchWishBodyDto {
  @IsInt()
  @Min(0)
  version!: number;
  @IsOptional() @IsString() @MaxLength(60) kind?: string;
  @IsOptional() @IsString() @MaxLength(60) occasion?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(80) style?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(40) opensAt?: string | null;
  @IsOptional() @IsString() @MaxLength(60) timeZone?: string;
  @IsOptional() @IsIn(["month", "half", "year"]) keep?: "month" | "half" | "year" | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5) step?: number;
  @IsOptional() @IsString() @MaxLength(80) passcode?: string | null;
}

/** E-231 POST /v1/wishes/:id/seal (the registry's pay-and-seal body carries a ticket and a way to pay; payment is the payments bundle's). */
export class SealWishBodyDto {
  @IsOptional() @IsInt() @Min(0) version?: number;
  @IsOptional() @IsString() @MaxLength(40) opensAt?: string;
  @IsOptional() @IsString() @MaxLength(60) timeZone?: string;
}
