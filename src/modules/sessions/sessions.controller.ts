import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  GetSessionsQueryDto,
  PostAuthRefreshBodyDto,
  PostAuthSignOutBodyDto,
  PostAuthSignOutEverywhereBodyDto,
  type AuthResult,
  type Empty,
} from "../../contracts";
import { CookieOriginCheck } from "../../common/auth/cookie-origin";
import { CookieAuth, CurrentPrincipal } from "../../common/auth/decorators";
import type { Principal, UserPrincipal } from "../../common/auth/principal";
import type { ClientMeta } from "../../common/auth/session-families";
import { AppError } from "../../common/errors/app-error";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie";
import { SessionsService, SessionView } from "./sessions.service";
import type { Page } from "../../common/pagination/cursor";

export function clientMeta(req: Request): ClientMeta {
  const ua = req.headers["user-agent"];
  return { ip: req.ip ?? null, userAgent: typeof ua === "string" ? ua : null };
}

function userOf(p: Principal | undefined): UserPrincipal {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p;
}

@Controller("auth")
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * E-159 (T3: public by its cookie, no bearer). After a page load the access token is gone from memory (R10), so this route is
   * the way back to one. A repeat with the same old cookie inside 10 seconds gets the same new session (V2); the cookie is
   * cleared only when the session has really ended.
   */
  @CookieAuth()
  @CookieOriginCheck()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() _body: PostAuthRefreshBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResult> {
    try {
      const started = await this.sessions.refresh(readRefreshCookie(req), clientMeta(req));
      setRefreshCookie(res, this.env, started.cookie, started.row.expiresAt, this.clock.now());
      return this.sessions.authResult(started, false);
    } catch (e) {
      if (e instanceof AppError && e.getStatus() === 401) clearRefreshCookie(res, this.env);
      throw e;
    }
  }

  /** E-160: ends this device's session family. */
  @CookieOriginCheck()
  @Post("sign-out")
  @HttpCode(204)
  async signOut(@Body() _body: PostAuthSignOutBodyDto, @CurrentPrincipal() p: Principal | undefined, @Res({ passthrough: true }) res: Response): Promise<void> {
    const u = userOf(p);
    if (u.familyId) await this.sessions.signOut(u.accountId, u.familyId);
    clearRefreshCookie(res, this.env);
  }

  /** E-161: ends every session of the account. */
  @Post("sign-out-everywhere")
  @HttpCode(200)
  async signOutEverywhere(
    @Body() _body: PostAuthSignOutEverywhereBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Empty> {
    await this.sessions.signOutEverywhere(userOf(p).accountId);
    clearRefreshCookie(res, this.env);
    return {};
  }
}

@Controller("sessions")
export class SessionsListController {
  constructor(private readonly sessions: SessionsService) {}

  /** E-162: the account's live sessions; `current` marks this device's. */
  @Get()
  list(@Query() q: GetSessionsQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Page<SessionView>> {
    const u = userOf(p);
    return this.sessions.list(u.accountId, u.familyId ?? null, q.cursor, q.limit);
  }
}
