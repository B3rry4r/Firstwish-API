import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { CurrentPrincipal, Public, StaffRoles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { AppError } from "../../common/errors/app-error";
import { requestIdOf } from "../../common/http/request-id";
import {
  GetAdminTeamQueryDto,
  PatchAdminStaffAccountsByIdBodyDto,
  PatchAdminStaffAccountsByIdParamsDto,
  PostAdminAuthCodeBodyDto,
  PostAdminAuthSignOutBodyDto,
  PostAdminAuthVerifyBodyDto,
  PostAdminStaffAccountsByIdSuspendBodyDto,
  PostAdminStaffAccountsByIdSuspendParamsDto,
  PostAdminTeamByIdRemoveBodyDto,
  PostAdminTeamByIdRemoveParamsDto,
  PostAdminTeamInviteBodyDto,
  type GetAdminTeamResponse,
  type StaffAccount,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { RequestInfo, StaffAuthService } from "./staff-auth.service";
import { StaffAccountsService } from "./staff-accounts.service";
import { STAFF_REFRESH_COOKIE, STAFF_REFRESH_PATH, STAFF_REFRESH_SECONDS, StaffSessionPrincipal } from "./staff-tokens";

const infoOf = (req: Request): RequestInfo => ({
  ip: req.ip ?? null,
  userAgent: req.header("user-agent") ?? null,
  requestId: requestIdOf(req),
});

/** E-176's answer: the staff account, plus the staff access token the page keeps in memory (R10). */
export type StaffVerifyResponse = StaffAccount & { accessToken: string; accessTokenExpiresAt: string };

@Controller("admin")
export class StaffAccountsController {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly team: StaffAccountsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E-174 */
  @Public()
  @Post("auth/code")
  @HttpCode(204)
  async code(@Body() body: PostAdminAuthCodeBodyDto, @Req() req: Request): Promise<void> {
    await this.auth.requestCode(body.email, infoOf(req));
  }

  /** E-176 */
  @Public()
  @Post("auth/verify")
  @HttpCode(200)
  async verify(@Body() body: PostAdminAuthVerifyBodyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StaffVerifyResponse> {
    const r = await this.auth.verify(body.email, body.code, infoOf(req));
    res.cookie(STAFF_REFRESH_COOKIE, r.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: STAFF_REFRESH_PATH,
      domain: this.env.COOKIE_DOMAIN,
      maxAge: STAFF_REFRESH_SECONDS * 1000,
    });
    return { ...r.staff, accessToken: r.accessToken, accessTokenExpiresAt: r.accessTokenExpiresAt };
  }

  /** E-175: any staff role. */
  @StaffRoles("finance", "maker", "moderator", "ops", "owner", "reviewer", "support")
  @Post("auth/sign-out")
  @HttpCode(204)
  async signOut(
    @Body() _body: PostAdminAuthSignOutBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (!p || p.kind !== "staff" || typeof (p as Partial<StaffSessionPrincipal>).sessionId !== "string") throw AppError.unauthorized();
    await this.auth.signOut(p as StaffSessionPrincipal, infoOf(req));
    res.clearCookie(STAFF_REFRESH_COOKIE, { path: STAFF_REFRESH_PATH, domain: this.env.COOKIE_DOMAIN, httpOnly: true, secure: true, sameSite: "lax" });
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
    return this.team.invite(body, actor, actor.ip ?? null);
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
