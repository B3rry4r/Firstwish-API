import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import type { Page } from "../../common/pagination/cursor";
import {
  GetAdminStylesPreviewToPaidQueryDto,
  GetAdminStylesQueryDto,
  PostAdminStylesBySlugSwitchBodyDto,
  PostAdminStylesBySlugSwitchParamsDto,
  PutAdminStylesBySlugLevelBodyDto,
  PutAdminStylesBySlugLevelParamsDto,
  type StyleRate,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import type { StyleOut } from "./style-view";
import { StylesService } from "./styles.service";

@Controller("admin/styles")
export class AdminStylesController {
  constructor(private readonly styles: StylesService) {}

  /** E-193 */
  @AdminRoute("/admin/styles", "ops", "owner", "reviewer")
  @Get()
  list(@Query() q: GetAdminStylesQueryDto): Promise<Page<StyleOut>> {
    return this.styles.adminList(q);
  }

  /** E-199 */
  @AdminRoute("/admin/styles", "owner", "reviewer")
  @Get("preview-to-paid")
  previewToPaid(@Query() q: GetAdminStylesPreviewToPaidQueryDto): Promise<Page<StyleRate>> {
    return this.styles.previewToPaid(q);
  }

  /** E-194 */
  @AdminRoute("/admin/styles", "ops", "owner", "reviewer")
  @Post(":slug/switch")
  @HttpCode(200)
  switch(@Param() p: PostAdminStylesBySlugSwitchParamsDto, @Body() body: PostAdminStylesBySlugSwitchBodyDto, @StaffActor() actor: AuditActor): Promise<StyleOut> {
    return this.styles.switchStyle(p.slug, body, actor);
  }

  /** E-197 */
  @AdminRoute("/admin/styles", "ops", "owner", "reviewer")
  @Put(":slug/level")
  moveLevel(@Param() p: PutAdminStylesBySlugLevelParamsDto, @Body() body: PutAdminStylesBySlugLevelBodyDto, @StaffActor() actor: AuditActor): Promise<StyleOut> {
    return this.styles.moveLevel(p.slug, body, actor);
  }
}
