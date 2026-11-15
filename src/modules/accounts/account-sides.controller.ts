import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  DeleteMeBusinessBodyDto,
  DeleteMeCreatorBodyDto,
  GetHandlesByHandleParamsDto,
  GetHandlesByHandleQueryDto,
  HandleCheck,
  PostMeBusinessBodyDto,
  PostMeCreatorBodyDto,
} from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { AccountSidesService } from "./account-sides.service";
import type { MeView } from "./accounts.service";

function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

/** E-5: registry auth is the creator side only. */
@Controller("handles")
export class HandlesController {
  constructor(private readonly sides: AccountSidesService) {}

  @Roles("creator")
  @Get(":handle")
  check(@Param() params: GetHandlesByHandleParamsDto, @Query() _q: GetHandlesByHandleQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<HandleCheck> {
    return this.sides.checkHandle(accountOf(p), params.handle);
  }
}

/** E-8 to E-11: the sides of the signed-in person's own account (registry auth: business; creator; signed in, so any side). */
@Controller("me")
export class AccountSidesController {
  constructor(private readonly sides: AccountSidesService) {}

  @Roles("person", "creator", "business")
  @Post("creator")
  @HttpCode(200)
  creatorOn(@Body() body: PostMeCreatorBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<MeView> {
    return this.sides.creatorOn(accountOf(p), body);
  }

  @Roles("person", "creator", "business")
  @Delete("creator")
  creatorOff(@Body() _body: DeleteMeCreatorBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<MeView> {
    return this.sides.creatorOff(accountOf(p));
  }

  @Roles("person", "creator", "business")
  @Post("business")
  @HttpCode(200)
  businessOn(@Body() body: PostMeBusinessBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<MeView> {
    return this.sides.businessOn(accountOf(p), body);
  }

  @Roles("person", "creator", "business")
  @Delete("business")
  businessOff(@Body() _body: DeleteMeBusinessBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<MeView> {
    return this.sides.businessOff(accountOf(p));
  }
}
