import { Body, Controller, Get, Patch, Query } from "@nestjs/common";
import { GetMeQueryDto, PatchMeBodyDto } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { AccountsService, MeView } from "./accounts.service";

function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

/** E-6 and E-7: the signed-in person's own account (registry auth: business; creator; signed in, so any side). */
@Controller("me")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Roles("person", "creator", "business")
  @Get()
  get(@Query() _q: GetMeQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<MeView> {
    return this.accounts.me(accountOf(p));
  }

  @Roles("person", "creator", "business")
  @Patch()
  patch(@Body() body: PatchMeBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<MeView> {
    return this.accounts.patch(accountOf(p), body);
  }
}
