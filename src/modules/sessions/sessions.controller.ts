import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  GetSessionsQueryDto,
  PostAuthRefreshBodyDto,
  PostAuthSignOutBodyDto,
  PostAuthSignOutEverywhereBodyDto,
  type Empty,
} from "../../contracts";
import { CurrentPrincipal, Public } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";
import { AccessTokens } from "./access-tokens";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie";
import { ClientMeta, SessionsService, SessionView, SignedIn } from "./sessions.service";
import type { Page } from "../../common/pagination/cursor";

export function clientMeta(req: Request): ClientMeta {
  const ua = req.headers["user-agent"];
  return { ip: req.ip ?? null, userAgent: typeof ua === "string" ? ua : null };
}

function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

@Controller("auth")
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly tokens: AccessTokens,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * E-159. The credential is the httpOnly refresh cookie, not a bearer token: after a page load the access token is gone
   * from memory (R10), so this route is the way back to one.
   */
  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() _body: PostAuthRefreshBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignedIn> {
    try {
      const { started, contact } = await this.sessions.refresh(readRefreshCookie(req), clientMeta(req));
      setRefreshCookie(res, this.env, started.cookie, started.row.expiresAt, this.clock.now());
      return this.sessions.signedIn(started, contact, false);
    } catch (e) {
      clearRefreshCookie(res, this.env);
      throw e;
    }
  }

  /** E-160: ends this device's session. */
  @Post("sign-out")
  @HttpCode(204)
  async signOut(
    @Body() _body: PostAuthSignOutBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const accountId = accountOf(p);
    const sid = this.sessionIdOf(req);
    if (sid) await this.sessions.signOut(accountId, sid);
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
    await this.sessions.signOutEverywhere(accountOf(p));
    clearRefreshCookie(res, this.env);
    return {};
  }

  private sessionIdOf(req: Request): string | null {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    return m ? (this.tokens.read(m[1])?.sid ?? null) : null;
  }
}

@Controller("sessions")
export class SessionsListController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly tokens: AccessTokens,
  ) {}

  /** E-162: the account's live sessions; `current` marks this device's. */
  @Get()
  list(@Query() q: GetSessionsQueryDto, @CurrentPrincipal() p: Principal | undefined, @Req() req: Request): Promise<Page<SessionView>> {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    const sid = m ? (this.tokens.read(m[1])?.sid ?? null) : null;
    return this.sessions.list(accountOf(p), sid, q.cursor, q.limit);
  }
}
