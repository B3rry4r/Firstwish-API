import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res, UseFilters } from "@nestjs/common";
import type { Request, Response } from "express";
import { GetWBySlugKeepByReferenceParamsDto, PostWBySlugKeepBodyDto, PostWBySlugKeepParamsDto, PostWBySlugWakeBodyDto, PostWBySlugWakeParamsDto } from "../../contracts";
import type { GetWBySlugKeepByReferenceResponse, PostWBySlugKeepResponse } from "../../contracts";
import { Public } from "../../common/auth/decorators";
import { withRetryAfter } from "../../common/errors/rate-limited";
import { SlugControlFilter } from "../public-wishes/slug-escapes";
import { WishKeepsService, type LinkProof } from "./wish-keeps.service";

/**
 * HS2: keep and wake by the link, with no account. E-257 starts a keep (a wake on a resting wish), E-259 wakes a resting wish a paid keep covers,
 * E-258 reads a keep payment's result back. The holder sends the link in the address, x-unlock-token (where the wish has a passcode) and
 * x-wish-proof (the signed proof the public view gave): the same three for each call. Held in the page's memory only (R10).
 */
@UseFilters(SlugControlFilter)
@Controller("w/:slug")
export class ReceiverKeepsController {
  constructor(private readonly keeps: WishKeepsService) {}

  private hold(req: Request, token?: string, proof?: string): LinkProof {
    return { slug: undefined, token, proof, address: req.ip ?? null };
  }

  @Public()
  @Post("keep")
  @HttpCode(201)
  async keep(
    @Param() p: PostWBySlugKeepParamsDto,
    @Body() body: PostWBySlugKeepBodyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") key?: string,
    @Headers("x-unlock-token") token?: string,
    @Headers("x-wish-proof") proof?: string,
  ): Promise<PostWBySlugKeepResponse> {
    res.setHeader("Cache-Control", "no-store");
    const r = await this.keeps.keepByLink(p.slug, body, key?.trim() || undefined, this.hold(req, token, proof)).catch((e: unknown) => withRetryAfter(res, e));
    res.status(r.status);
    return r.answer;
  }

  @Public()
  @Post("wake")
  @HttpCode(204)
  async wake(
    @Param() p: PostWBySlugWakeParamsDto,
    @Body() _body: PostWBySlugWakeBodyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers("x-unlock-token") token?: string,
    @Headers("x-wish-proof") proof?: string,
  ): Promise<void> {
    res.setHeader("Cache-Control", "no-store");
    await this.keeps.wakeByLink(p.slug, this.hold(req, token, proof)).catch((e: unknown) => withRetryAfter(res, e));
  }

  @Public()
  @Get("keep/:reference")
  async result(
    @Param() p: GetWBySlugKeepByReferenceParamsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers("x-unlock-token") token?: string,
    @Headers("x-wish-proof") proof?: string,
  ): Promise<GetWBySlugKeepByReferenceResponse> {
    res.setHeader("Cache-Control", "no-store");
    return this.keeps.keepResult(p.slug, p.reference, this.hold(req, token, proof)).catch((e: unknown) => withRetryAfter(res, e));
  }
}
