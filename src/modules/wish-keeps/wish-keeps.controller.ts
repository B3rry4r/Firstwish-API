import { Body, Controller, Headers, HttpCode, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { PostWishesByIdKeepBodyDto, PostWishesByIdKeepParamsDto, PostWishesByIdWakeBodyDto, PostWishesByIdWakeParamsDto } from "../../contracts";
import type { PostWishesByIdKeepResponse } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { accountOf } from "../people/business-of";
import { WishKeepsService } from "./wish-keeps.service";

/**
 * E-228 keep a wish and E-232 wake it (the owner, signed in on any side). The registry lists no public caller for the wake: a
 * stranger cannot be told from the owner, so the route needs a signed-in owner (default-deny; DD1: whoever pays signs in first).
 */
@Controller("wishes")
export class WishKeepsController {
  constructor(private readonly keeps: WishKeepsService) {}

  /** {payment, item}: 201 for a new payment, 200 for a repeat. The price comes from the price book; the body never carries money. */
  @Roles("person", "creator", "business")
  @Post(":id/keep")
  @HttpCode(201)
  async keep(
    @Param() params: PostWishesByIdKeepParamsDto,
    @Body() body: PostWishesByIdKeepBodyDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentPrincipal() p: Principal | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PostWishesByIdKeepResponse> {
    const r = await this.keeps.keep(accountOf(p), params.id, body, key?.trim() || undefined);
    res.status(r.status);
    return r.answer;
  }

  @Roles("person", "creator", "business")
  @Post(":id/wake")
  @HttpCode(204)
  async wake(@Param() params: PostWishesByIdWakeParamsDto, @Body() body: PostWishesByIdWakeBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<void> {
    await this.keeps.wake(accountOf(p), params.id, body.wishId);
  }
}
