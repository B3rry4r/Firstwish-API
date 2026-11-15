import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  GetAdminScreeningResultsQueryDto,
  type GetAdminScreeningResultsResponse,
  PostAdminScreeningResultsByIdDecisionBodyDto, PostAdminScreeningResultsByIdDecisionParamsDto,
  type ScreeningResult,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { ScreeningResultsService } from "./screening-results.service";

@Controller("admin/screening-results")
export class ScreeningResultsController {
  constructor(private readonly results: ScreeningResultsService) {}

  /** E-237 (registry auth: owner, ops, moderator; section /admin/moderation): the screening queue, newest first. */
  @AdminRoute("/admin/moderation", "owner", "ops", "moderator")
  @Get()
  list(@Query() q: GetAdminScreeningResultsQueryDto): Promise<GetAdminScreeningResultsResponse> {
    return this.results.list(q);
  }

  /** E-157 (registry auth: moderator; section /admin/moderation). */
  @AdminRoute("/admin/moderation", "moderator")
  @Post(":id/decision")
  @HttpCode(200)
  decide(
    @Param() params: PostAdminScreeningResultsByIdDecisionParamsDto,
    @Body() body: PostAdminScreeningResultsByIdDecisionBodyDto,
    @StaffActor() actor: AuditActor,
  ): Promise<ScreeningResult> {
    return this.results.decide(params.id, body, actor);
  }
}
