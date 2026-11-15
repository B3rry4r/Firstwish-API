import { Body, Controller, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PostAuthCodesBodyDto, PostAuthCodesVerifyBodyDto } from "../../contracts";
import { Public } from "../../common/auth/decorators";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";
import { clientMeta } from "../sessions/sessions.controller";
import { setRefreshCookie } from "../sessions/refresh-cookie";
import { SessionsService, SignedIn } from "../sessions/sessions.service";
import { AuthCodesService, CodeSent } from "./auth-codes.service";
import { withRetryAfter } from "./rate-limited";

@Controller("auth/codes")
export class AuthCodesController {
  constructor(
    private readonly codes: AuthCodesService,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E-19: a sign-in code to an email (R11: email only). */
  @Public()
  @Post()
  @HttpCode(200)
  async request(@Body() body: PostAuthCodesBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CodeSent> {
    try {
      return await this.codes.request(body.contact, body.mode, req.ip ?? null);
    } catch (e) {
      return withRetryAfter(res, e);
    }
  }

  /** E-20: the code signs in, making the account on first sign-in; the refresh token goes in the httpOnly cookie. */
  @Public()
  @Post("verify")
  @HttpCode(200)
  async verify(@Body() body: PostAuthCodesVerifyBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignedIn> {
    const { started, email, isNew } = await this.codes.verify(body.contact, body.code, clientMeta(req));
    setRefreshCookie(res, this.env, started.cookie, started.row.expiresAt, this.clock.now());
    return this.sessions.signedIn(started, email, isNew);
  }
}
