import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import {
  GetAdminModerationQueryDto, PostAdminBansBodyDto, PostAdminModerationByIdDecideBodyDto, PostAdminModerationByIdDecideParamsDto,
  PostReportsBodyDto, PostWBySlugTakeDownParamsDto,
} from "../../contracts";
import { Public } from "../../common/auth/decorators";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { BansService } from "./bans.service";
import { ReportsService } from "./reports.service";

/** E-133's body: the registry gives `contact`; the code that proves the address travels in the same body (see the hand-back). */
export class TakeDownBodyDto {
  @IsString()
  @MaxLength(320)
  contact!: string;
  @IsOptional()
  @IsString()
  @MaxLength(12)
  code?: string;
}

/** Reports and bans: E-151 and E-133 (public), E-149 and E-150 (staff queues and decisions), E-21 (a ban). */
@Controller()
export class ModerationController {
  constructor(
    private readonly reports: ReportsService,
    private readonly bans: BansService,
  ) {}

  /** E-151. */
  @Public()
  @Post("reports")
  @HttpCode(201)
  report(@Body() b: PostReportsBodyDto, @Req() req: Request) {
    return this.reports.create(b, req.ip ?? null);
  }

  /** E-133. */
  @Public()
  @Post("w/:slug/take-down")
  @HttpCode(200)
  takeDown(@Param() p: PostWBySlugTakeDownParamsDto, @Body() b: TakeDownBodyDto, @Req() req: Request) {
    return this.reports.thisIsMe(p.slug, b, req.ip ?? null);
  }

  /** E-149. */
  @AdminRoute("/admin/moderation", "moderator", "ops", "owner")
  @Get("admin/moderation")
  queues(@Query() q: GetAdminModerationQueryDto) {
    return this.reports.list(q);
  }

  /** E-150. */
  @AdminRoute("/admin/moderation", "moderator", "ops", "owner")
  @Post("admin/moderation/:id/decide")
  @HttpCode(200)
  decide(@Param() p: PostAdminModerationByIdDecideParamsDto, @Body() b: PostAdminModerationByIdDecideBodyDto, @StaffActor() actor: AuditActor) {
    return this.reports.decide(p.id, b, actor);
  }

  /** E-21. */
  @AdminRoute("/admin/people", "moderator", "owner")
  @Post("admin/bans")
  @HttpCode(201)
  ban(@Body() b: PostAdminBansBodyDto, @StaffActor() actor: AuditActor) {
    return this.bans.create(b, actor);
  }
}
