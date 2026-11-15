import { Body, Controller, Patch } from "@nestjs/common";
import { Business, PatchBusinessBodyDto } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { BusinessService } from "./business.service";

/** E-26 PATCH /v1/business (registry auth: the business side). */
@Controller("business")
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Roles("business")
  @Patch()
  patch(@Body() body: PatchBusinessBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<Business["brand"]> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    return this.business.patchBrand(p.accountId, body);
  }
}
