import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { GetMeQueryDto, PatchMeBodyDto, PostMeEraseBodyDto } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { requestIdOf } from "../../common/http/request-id";
import { AccountErasureService } from "./account-erasure.service";
import { AccountsService, MeView } from "./accounts.service";

function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

/** E-6 and E-7: the signed-in person's own account (registry auth: business; creator; signed in, so any side). */
@Controller("me")
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly erasure: AccountErasureService,
  ) {}

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

  /**
   * E-235 (X7): erase my own account. Needs a sign-in from the last 10 minutes (the session family's first session), else 403
   * fresh_sign_in_needed; the body must be {confirm: "erase"}. Ends every session. Answers 204.
   */
  @Roles("person", "creator", "business")
  @Post("erase")
  @HttpCode(204)
  async erase(@Body() _body: PostMeEraseBodyDto, @CurrentPrincipal() p: Principal | undefined, @Req() req: Request): Promise<void> {
    const accountId = accountOf(p);
    await this.erasure.erase(accountId, {
      actor: { type: "account", id: accountId, ip: req.ip ?? null, requestId: requestIdOf(req) },
      reason: null,
      // A token with no session family (a test token) is not a fresh sign-in: the service finds no family and refuses.
      freshFamilyId: p?.kind === "user" ? (p.familyId ?? "") : "",
    });
  }
}
