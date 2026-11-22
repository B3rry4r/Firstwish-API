// Request validation for settings endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsBoolean, IsIn, IsString } from "class-validator";
import type { PutAdminSettingsStorageBody, PutAdminSettingsSwitchesByKeyBody, PutAdminSettingsSwitchesByKeyParams } from "../types";

/** E-163 GET /v1/admin/settings (query). */
export class GetAdminSettingsQueryDto {}

/** E-164 PUT /v1/admin/settings/storage (body). */
export class PutAdminSettingsStorageBodyDto implements PutAdminSettingsStorageBody {
  @IsIn(["r2", "spaces"])
  choice!: "r2" | "spaces";
  @IsString()
  reason!: string;
}

/** E-165 PUT /v1/admin/settings/switches/:key (body). */
export class PutAdminSettingsSwitchesByKeyBodyDto implements PutAdminSettingsSwitchesByKeyBody {
  @IsBoolean()
  on!: boolean;
  @IsString()
  reason!: string;
}
export class PutAdminSettingsSwitchesByKeyParamsDto implements PutAdminSettingsSwitchesByKeyParams {
  @IsString()
  key!: string;
}
