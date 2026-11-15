import { Body, Controller, Delete, Param, Put } from "@nestjs/common";
import {
  DeleteCreatorsByHandleFollowBodyDto,
  DeleteCreatorsByHandleFollowParamsDto,
  FollowResponse,
  PutCreatorsByHandleFollowBodyDto,
  PutCreatorsByHandleFollowParamsDto,
} from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { FollowsService } from "./follows.service";

function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

/** E-57, E-58 (registry auth: business; creator; signed in, so any side). */
@Controller("creators/:handle/follow")
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Roles("person", "creator", "business")
  @Put()
  follow(@Param() params: PutCreatorsByHandleFollowParamsDto, @Body() _b: PutCreatorsByHandleFollowBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<FollowResponse> {
    return this.follows.follow(accountOf(p), params.handle);
  }

  @Roles("person", "creator", "business")
  @Delete()
  unfollow(@Param() params: DeleteCreatorsByHandleFollowParamsDto, @Body() _b: DeleteCreatorsByHandleFollowBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<FollowResponse> {
    return this.follows.unfollow(accountOf(p), params.handle);
  }
}
