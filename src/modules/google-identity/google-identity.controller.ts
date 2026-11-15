import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { DeleteMeGoogleBodyDto, GetAuthGoogleCallbackQueryDto, PostAuthGoogleStartBodyDto, PostMeGoogleBodyDto, type Empty } from "../../contracts";
import { CurrentPrincipal, Public } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";
import { clientMeta } from "../sessions/sessions.controller";
import { setRefreshCookie } from "../sessions/refresh-cookie";
import { SessionsService, SignedIn } from "../sessions/sessions.service";
import { ExternalIdentityView, GoogleIdentityService, GoogleStart } from "./google-identity.service";

function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

@Controller()
export class GoogleIdentityController {
  constructor(
    private readonly google: GoogleIdentityService,
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E-54: where the browser goes to sign in with Google. */
  @Public()
  @Post("auth/google/start")
  @HttpCode(200)
  start(@Body() body: PostAuthGoogleStartBodyDto): Promise<GoogleStart> {
    return this.google.start(body.returnTo);
  }

  /** E-53: the web page Google returns to passes on code and state; the answer is a session, like a code sign-in. */
  @Public()
  @Get("auth/google/callback")
  async callback(@Query() q: GetAuthGoogleCallbackQueryDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignedIn> {
    const { started, email, isNew, returnTo } = await this.google.callback(q.code, q.state, clientMeta(req));
    setRefreshCookie(res, this.env, started.cookie, started.row.expiresAt, this.clock.now());
    return this.sessions.signedIn(started, email, isNew, returnTo);
  }

  /** E-56: link a Google account to this account. */
  @Post("me/google")
  @HttpCode(200)
  link(@Body() body: PostMeGoogleBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<ExternalIdentityView> {
    return this.google.link(accountOf(p), body.code, body.state);
  }

  /** E-55: unlink a Google account. */
  @Delete("me/google")
  @HttpCode(200)
  async unlink(@Body() body: DeleteMeGoogleBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<Empty> {
    await this.google.unlink(accountOf(p), body.id);
    return {};
  }
}
