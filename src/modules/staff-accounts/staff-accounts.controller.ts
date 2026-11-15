import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { CookieOriginCheck } from "../../common/auth/cookie-origin";
import { CookieAuth, CurrentPrincipal, Public, StaffRoles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { ENV } from "../../common/env/env.module";
import { Clock } from "../../common/ports/clock.port";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { requestIdOf } from "../../common/http/request-id";
import {
  GetAdminTeamQueryDto,
  PatchAdminStaffAccountsByIdBodyDto,
  PatchAdminStaffAccountsByIdParamsDto,
  PostAdminAuthCodeBodyDto,
  PostAdminAuthRefreshBodyDto,
  PostAdminAuthSignOutBodyDto,
  PostAdminAuthVerifyBodyDto,
  PostAdminStaffAccountsByIdSuspendBodyDto,
  PostAdminStaffAccountsByIdSuspendParamsDto,
  PostAdminTeamByIdRemoveBodyDto,
  PostAdminTeamByIdRemoveParamsDto,
  PostAdminTeamInviteBodyDto,
  type GetAdminTeamResponse,
  type StaffAccount,
  type StaffAuthResult,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { RequestInfo, StaffAuthService } from "./staff-auth.service";
import { StaffAccountsService } from "./staff-accounts.service";
import { clearStaffCookie, readStaffCookie, setStaffCookie } from "./staff-session";

const infoOf = (req: Request): RequestInfo => ({
  ip: req.ip ?? null,
  userAgent: req.header("user-agent") ?? null,
  requestId: requestIdOf(req),
});

@Controller("admin")
export class StaffAccountsController {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly team: StaffAccountsService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E-174 */
  @Public()
  @Post("auth/code")
  @HttpCode(204)
  async code(@Body() body: PostAdminAuthCodeBodyDto, @Req() req: Request): Promise<void> {
    await this.auth.requestCode(body.email, infoOf(req));
  }

  /** E-176: the staff refresh cookie goes in the httpOnly cookie, the access token in the body (R10). */
  @Public()
  @Post("auth/verify")
  @HttpCode(200)
  async verify(@Body() body: PostAdminAuthVerifyBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StaffAuthResult> {
    const { result, started } = await this.auth.verify(body.email, body.code, infoOf(req));
    setStaffCookie(res, this.env, started.cookie, started.row.expiresAt, this.clock.now());
    return result;
  }

  /** E-234 (S5, T3): public by the staff cookie; rotates it (10-second grace, V2); the cookie is cleared only when ended. */
  @CookieAuth()
  @CookieOriginCheck()
  @Post("auth/refresh")
  @HttpCode(200)
  async refresh(@Body() _body: PostAdminAuthRefreshBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StaffAuthResult> {
    try {
      const { result, started } = await this.auth.refresh(readStaffCookie(req), infoOf(req));
      setStaffCookie(res, this.env, started.cookie, started.row.expiresAt, this.clock.now());
      return result;
    } catch (e) {
      if (e instanceof AppError && e.getStatus() === 401) clearStaffCookie(res, this.env);
      throw e;
    }
  }

  /** E-175: any staff role; ends this session family. */
  @CookieOriginCheck()
  @StaffRoles("finance", "maker", "moderator", "ops", "owner", "reviewer", "support")
  @Post("auth/sign-out")
  @HttpCode(204)
  async signOut(
    @Body() _body: PostAdminAuthSignOutBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (!p || p.kind !== "staff") throw AppError.unauthorized();
    await this.auth.signOut(p, infoOf(req));
    clearStaffCookie(res, this.env);
  }

  /** E-179 */
  @AdminRoute("/admin/team", "owner")
  @Get("team")
  list(@Query() q: GetAdminTeamQueryDto): Promise<GetAdminTeamResponse> {
    return this.team.team(q);
  }

  /** E-181 */
  @AdminRoute("/admin/team", "owner")
  @Post("team/invite")
  @HttpCode(201)
  invite(@Body() body: PostAdminTeamInviteBodyDto, @StaffActor() actor: AuditActor): Promise<StaffAccount> {
    return this.team.invite(body, actor);
  }

  /** E-180 */
  @AdminRoute("/admin/team", "owner")
  @Post("team/:id/remove")
  @HttpCode(204)
  remove(@Param() params: PostAdminTeamByIdRemoveParamsDto, @Body() body: PostAdminTeamByIdRemoveBodyDto, @StaffActor() actor: AuditActor): Promise<void> {
    return this.team.remove(params.id, body, actor);
  }

  /** E-177 */
  @AdminRoute("/admin/team", "owner")
  @Patch("staff-accounts/:id")
  changeRoles(
    @Param() params: PatchAdminStaffAccountsByIdParamsDto,
    @Body() body: PatchAdminStaffAccountsByIdBodyDto,
    @StaffActor() actor: AuditActor,
  ): Promise<StaffAccount> {
    return this.team.changeRoles(params.id, body, actor);
  }

  /** E-178 */
  @AdminRoute("/admin/team", "owner")
  @Post("staff-accounts/:id/suspend")
  @HttpCode(200)
  suspend(
    @Param() params: PostAdminStaffAccountsByIdSuspendParamsDto,
    @Body() body: PostAdminStaffAccountsByIdSuspendBodyDto,
    @StaffActor() actor: AuditActor,
  ): Promise<StaffAccount> {
    return this.team.suspend(params.id, body, actor);
  }
}
