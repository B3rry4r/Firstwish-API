import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Page } from "../../common/pagination/cursor";
import {
  GetAdminStylesPreviewToPaidQueryDto,
  GetAdminStylesQueryDto,
  PostAdminStylesBySlugSwitchBodyDto,
  PostAdminStylesBySlugSwitchParamsDto,
  PutAdminStylesBySlugLevelBodyDto,
  PutAdminStylesBySlugLevelParamsDto,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import type { StyleOut } from "./style-view";
import { StyleRateOut, StylesService } from "./styles.service";

/** E-193's query plus the level filter the staff Styles page uses (brief case 5; asked of the lead for the contract). */
export class AdminStylesQueryDto extends GetAdminStylesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  level?: string;
}

@Controller("admin/styles")
export class AdminStylesController {
  constructor(private readonly styles: StylesService) {}

  /** E-193 */
  @AdminRoute("/admin/styles", "ops", "owner", "reviewer")
  @Get()
  list(@Query() q: AdminStylesQueryDto): Promise<Page<StyleOut>> {
    return this.styles.adminList(q);
  }

  /** E-199 */
  @AdminRoute("/admin/styles", "owner", "reviewer")
  @Get("preview-to-paid")
  previewToPaid(@Query() q: GetAdminStylesPreviewToPaidQueryDto): Promise<Page<StyleRateOut>> {
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
  move(@Param() p: PutAdminStylesBySlugLevelParamsDto, @Body() body: PutAdminStylesBySlugLevelBodyDto, @StaffActor() actor: AuditActor): Promise<StyleOut> {
    return this.styles.moveLevel(p.slug, body, actor);
  }
}
