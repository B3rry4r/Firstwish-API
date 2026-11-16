import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import type { Page } from "../../common/pagination/cursor";
import {
  GetAdminStylesReviewQueryDto,
  PostAdminStylesReviewByIdDecideBodyDto,
  PostAdminStylesReviewByIdDecideParamsDto,
  type StyleSubmission,
  type SubmissionView,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { SubmissionsService } from "./submissions.service";

/** E-200 and E-201: staff review of creators' styles (registry roles: ops, owner, reviewer). */
@Controller("admin/styles/review")
export class StyleReviewController {
  constructor(private readonly submissions: SubmissionsService) {}

  /** E-200 */
  @AdminRoute("/admin/styles/review", "ops", "owner", "reviewer")
  @Get()
  queue(@Query() q: GetAdminStylesReviewQueryDto): Promise<Page<SubmissionView>> {
    return this.submissions.queue(q);
  }

  /** E-201 */
  @AdminRoute("/admin/styles/review", "ops", "owner", "reviewer")
  @Post(":id/decide")
  @HttpCode(200)
  decide(@Param() params: PostAdminStylesReviewByIdDecideParamsDto, @Body() body: PostAdminStylesReviewByIdDecideBodyDto, @StaffActor() actor: AuditActor): Promise<StyleSubmission> {
    return this.submissions.decide(params.id, body, actor);
  }
}
