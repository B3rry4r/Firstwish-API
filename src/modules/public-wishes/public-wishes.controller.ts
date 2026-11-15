import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res, UseFilters } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  GetWBySlugParamsDto,
  PostWBySlugFavouritesBodyDto,
  PostWBySlugFavouritesParamsDto,
  PostWBySlugOpensParamsDto,
  PostWBySlugReactionBodyDto,
  PostWBySlugReactionParamsDto,
  PostWBySlugUnlockBodyDto,
  PostWBySlugUnlockParamsDto,
} from "../../contracts";
import type { PublicWishView } from "../../contracts";
import { Public } from "../../common/auth/decorators";
import { withRetryAfter } from "../../common/errors/rate-limited";
import { SlugControlFilter } from "./slug-escapes";
import { Caller, PublicWishesService } from "./public-wishes.service";

/**
 * The receiver's link: E-129 read, E-134 unlock, E-131 opens, E-132 reaction, E-130 favourites. No sign-in. The unlock token
 * travels in x-unlock-token and the opening session in x-wish-session (both held in the page's memory only, R10).
 */
@UseFilters(SlugControlFilter)
@Controller("w/:slug")
export class PublicWishesController {
  constructor(private readonly wishes: PublicWishesService) {}

  private caller(req: Request, token?: string, session?: string): Caller {
    return { address: req.ip ?? null, head: req.method === "HEAD", userAgent: req.headers["user-agent"] ?? null, token, session };
  }

  @Public()
  @Get()
  async read(@Param() p: GetWBySlugParamsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string, @Headers("x-wish-session") session?: string): Promise<PublicWishView> {
    res.setHeader("Cache-Control", "no-store");
    return this.wishes.view(p.slug, this.caller(req, token, session)).catch((e: unknown) => withRetryAfter(res, e));
  }

  @Public()
  @Post("unlock")
  @HttpCode(200)
  async unlock(@Param() p: PostWBySlugUnlockParamsDto, @Body() b: PostWBySlugUnlockBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Record<string, unknown>> {
    res.setHeader("Cache-Control", "no-store");
    return this.wishes.unlock(p.slug, this.caller(req), b).catch((e: unknown) => withRetryAfter(res, e));
  }

  @Public()
  @Post("opens")
  @HttpCode(200)
  async opens(@Param() p: PostWBySlugOpensParamsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string, @Headers("x-wish-session") session?: string): Promise<PublicWishView> {
    res.setHeader("Cache-Control", "no-store");
    return this.wishes.open(p.slug, this.caller(req, token, session)).catch((e: unknown) => withRetryAfter(res, e));
  }

  @Public()
  @Post("reaction")
  @HttpCode(200)
  async reaction(@Param() p: PostWBySlugReactionParamsDto, @Body() b: PostWBySlugReactionBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string, @Headers("x-wish-session") session?: string): Promise<{ reaction: string; counts: Record<string, number> }> {
    return this.wishes.react(p.slug, this.caller(req, token, session), b).catch((e: unknown) => withRetryAfter(res, e));
  }

  @Public()
  @Post("favourites")
  @HttpCode(204)
  async favourites(@Param() p: PostWBySlugFavouritesParamsDto, @Body() b: PostWBySlugFavouritesBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string, @Headers("x-wish-session") session?: string): Promise<void> {
    await this.wishes.favourites(p.slug, this.caller(req, token, session), b).catch((e: unknown) => withRetryAfter(res, e));
  }
}
