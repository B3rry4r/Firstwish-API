// Request validation for auth-code endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsIn, IsOptional, IsString } from "class-validator";
import { IsCanonEmail } from "../../common/validation/decorators";
import type { PostAuthCodesBody, PostAuthCodesVerifyBody } from "../types";

/** E-19 POST /v1/auth/codes (body). */
export class PostAuthCodesBodyDto implements PostAuthCodesBody {
  @IsCanonEmail()
  contact!: string;
  @IsOptional()
  @IsIn(["up", "in"])
  mode?: "up" | "in";
  @IsOptional()
  @IsIn(["email"])
  via?: "email";
}

/** E-20 POST /v1/auth/codes/verify (body). */
export class PostAuthCodesVerifyBodyDto implements PostAuthCodesVerifyBody {
  @IsString()
  code!: string;
  @IsString()
  contact!: string;
}
