import { Controller, Get, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { GetBusinessVaultFilesQueryDto, type GetBusinessVaultFilesResponse } from "../../contracts";
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
}
