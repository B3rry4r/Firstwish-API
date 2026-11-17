import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../../common/auth/decorators";
import { withRetryAfter } from "../../common/errors/rate-limited";
import { PostRByCodeFavouritesBodyDto } from "../../contracts";
import { RevealsPublicService, RevealView } from "./reveals-public.service";

/**
 * The client's link to a reveal: GET /v1/r/:code and POST /v1/r/:code/unlock. No sign-in. The unlock token travels in x-unlock-token and
 * the visit's own id in x-reveal-session, both held in the page's memory only (R10). The registry lists no endpoint for these yet.
 */
@Controller("r/:code")
export class RevealPublicController {
  constructor(private readonly reveals: RevealsPublicService) {}

  @Public()
  @Get()
  async read(@Param("code") code: string, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string, @Headers("x-reveal-session") session?: string): Promise<RevealView> {
    res.setHeader("Cache-Control", "no-store");
    return this.reveals.view(code, { address: req.ip ?? null, token, session }).catch((e: unknown) => withRetryAfter(res, e));
  }

  @Public()
  @Post("unlock")
  @HttpCode(200)
  async unlock(@Param("code") code: string, @Body() body: { passcode?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: boolean; token?: string; expiresAt?: string; error?: string }> {
    res.setHeader("Cache-Control", "no-store");
    return this.reveals.unlock(code, body?.passcode, { address: req.ip ?? null }).catch((e: unknown) => withRetryAfter(res, e));
  }

  /** IB1: the positions the client marked. */
  @Public()
  @Get("favourites")
  async favourites(@Param("code") code: string, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string): Promise<{ hearts: number[] }> {
    res.setHeader("Cache-Control", "no-store");
    return this.reveals.favourites(code, { address: req.ip ?? null, token }).catch((e: unknown) => withRetryAfter(res, e));
  }

  /** IB1: mark or unmark one photo position. */
  @Public()
  @Post("favourites")
  @HttpCode(200)
  async mark(@Param("code") code: string, @Body() body: PostRByCodeFavouritesBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Headers("x-unlock-token") token?: string): Promise<{ hearts: number[] }> {
    res.setHeader("Cache-Control", "no-store");
    return this.reveals.mark(code, body.position, body.marked, { address: req.ip ?? null, token }).catch((e: unknown) => withRetryAfter(res, e));
  }
}
