import { Body, Controller, Patch } from "@nestjs/common";
import { Business, PatchBusinessBodyDto } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { BusinessOf } from "../people/business-of";
import { BusinessHeader } from "../pro-business/pro-access";
import { BusinessService } from "./business.service";

/** E-26 PATCH /v1/business (registry auth: the business side). */
@Controller("business")
export class BusinessController {
  constructor(
    private readonly business: BusinessService,
    private readonly access: BusinessOf,
  ) {}

  @Roles("business")
  @Patch()
  async patch(@Body() body: PatchBusinessBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Business["brand"]> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    // HR3: the brand belongs to the business the header names, and only its owner sets it
    const named = h === undefined ? undefined : (await this.access.named(p, h, { ownerOnly: true, words: "Only the owner of the business can change its brand." })).businessId;
    return this.business.patchBrand(p.accountId, body, named);
  }
}
