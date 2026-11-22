// Request validation for notice-prefs endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsArray, IsString } from "class-validator";
import type { PatchMeNoticePrefsBody } from "../types";

/** E-78 PATCH /v1/me/notice-prefs (body). */
export class PatchMeNoticePrefsBodyDto implements PatchMeNoticePrefsBody {
  @IsArray()
  @IsString({ each: true })
  muted!: string[];
}
