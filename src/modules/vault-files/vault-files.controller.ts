import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { GetBusinessVaultFilesQueryDto, PatchBusinessVaultFilesByIdBodyDto, PatchBusinessVaultFilesByIdParamsDto, type GetBusinessVaultFilesResponse, type PatchBusinessVaultFilesByIdResponse } from "../../contracts";
import { userOf } from "../stored-files/principal";
import { VaultFilesService } from "./vault-files.service";

@Controller("business/vault-files")
export class VaultFilesController {
  constructor(private readonly vault: VaultFilesService) {}

  /** E-214 (registry auth: business). */
  @Roles("business")
  @Get()
  list(@Query() q: GetBusinessVaultFilesQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<GetBusinessVaultFilesResponse> {
    return this.vault.list(userOf(p), q);
  }

  /** E-278 (IB3): rename a Vault file. */
  @Roles("person", "business")
  @Patch(":id")
  rename(@Param() params: PatchBusinessVaultFilesByIdParamsDto, @Body() body: PatchBusinessVaultFilesByIdBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<PatchBusinessVaultFilesByIdResponse> {
    return this.vault.rename(userOf(p), params.id, body.name);
  }
}
