import { Body, Controller, Headers, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PostWishesByIdKeepBodyDto, PostWishesByIdKeepParamsDto, PostWishesByIdWakeBodyDto, PostWishesByIdWakeParamsDto } from "../../contracts";
import type { PostWishesByIdKeepResponse } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { withRetryAfter } from "../../common/errors/rate-limited";
import { accountOf } from "../people/business-of";
import { WishKeepsService, type LinkHold } from "./wish-keeps.service";

/**
 * E-228 keep a wish and E-232 wake it: the owner, or (HA1, HA3) a signed-in receiver who holds the wish's link. The link travels in
 * x-wish-link (its slug) with x-unlock-token (the link's own token, where the wish has a passcode); the registry's bodies cannot
 * carry it. A stranger is refused, and signing in comes first (DD1).
 */
const holdOf = (req: Request, slug: string | undefined, token: string | undefined): LinkHold => ({ slug: slug?.trim() || undefined, token, address: req.ip ?? null });

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
    @Req() req: Request,
    @Headers("x-wish-link") slug?: string,
    @Headers("x-unlock-token") token?: string,
  ): Promise<PostWishesByIdKeepResponse> {
    const r = await this.keeps.keep(accountOf(p), params.id, body, key?.trim() || undefined, holdOf(req, slug, token)).catch((e: unknown) => withRetryAfter(res, e));
    res.status(r.status);
    return r.answer;
  }

  @Roles("person", "creator", "business")
  @Post(":id/wake")
  @HttpCode(204)
  async wake(
    @Param() params: PostWishesByIdWakeParamsDto,
    @Body() body: PostWishesByIdWakeBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Headers("x-wish-link") slug?: string,
    @Headers("x-unlock-token") token?: string,
  ): Promise<void> {
    await this.keeps.wake(accountOf(p), params.id, body.wishId, holdOf(req, slug, token)).catch((e: unknown) => withRetryAfter(res, e));
  }
}
