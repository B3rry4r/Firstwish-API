import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import {
  GetAdminMessagesLogQueryDto, GetAdminMessagesTemplatesQueryDto, GetMeNoticesQueryDto, PatchMeNoticePrefsBodyDto, PostAdminMessagesByIdResendBodyDto,
  PostAdminMessagesByIdResendParamsDto, PutAdminMessagesTemplatesByKeyBodyDto, PutAdminMessagesTemplatesByKeyParamsDto,
} from "../../contracts";
import type { MessageDelivery, MessageTemplate, Notice, NoticePrefs } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { DEFAULT_LIMIT } from "../../common/pagination/cursor";
import type { Page } from "../../common/pagination/cursor";
import type { AuditActor } from "../audit/audit.service";
import { accountOf } from "../people/business-of";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { NoticesAdminService } from "./notices-admin.service";
import { NoticesMeService } from "./notices-me.service";

/** E-71 with the filter the page needs: ?status=failed. */
export class MessageLogQueryDto extends GetAdminMessagesLogQueryDto {
  @IsOptional()
  @IsIn(["queued", "sending", "sent", "delivered", "failed", "dropped"], { message: "Must be queued, sending, sent, delivered, failed or dropped." })
  status?: string;
}

@Controller()
export class NoticesController {
  constructor(
    private readonly admin: NoticesAdminService,
    private readonly me: NoticesMeService,
  ) {}

  /** E-75 */
  @AdminRoute("/admin/messages", "ops", "owner", "support")
  @Get("admin/messages/templates")
  templates(@Query() q: GetAdminMessagesTemplatesQueryDto): Promise<Page<MessageTemplate>> {
    return this.admin.templates(q.limit ?? DEFAULT_LIMIT, q.cursor);
  }

  /** E-76 */
  @AdminRoute("/admin/messages", "ops", "owner", "support")
  @Put("admin/messages/templates/:key")
  editTemplate(@Param() p: PutAdminMessagesTemplatesByKeyParamsDto, @Body() b: PutAdminMessagesTemplatesByKeyBodyDto, @StaffActor() actor: AuditActor): Promise<MessageTemplate> {
    return this.admin.edit(p.key, b, actor);
  }

  /** E-71 */
  @AdminRoute("/admin/messages", "ops", "owner", "support")
  @Get("admin/messages/log")
  log(@Query() q: MessageLogQueryDto): Promise<Page<MessageDelivery>> {
    return this.admin.log(q.limit ?? DEFAULT_LIMIT, q.cursor, q.status);
  }

  /** E-70 */
  @AdminRoute("/admin/messages", "ops", "owner", "support")
  @Post("admin/messages/:id/resend")
  @HttpCode(200)
  resend(@Param() p: PostAdminMessagesByIdResendParamsDto, @Body() b: PostAdminMessagesByIdResendBodyDto, @StaffActor() actor: AuditActor): Promise<MessageDelivery> {
    return this.admin.resend(p.id, b.reason, actor);
  }

  /** E-77 (registry auth: signed in, any side) */
  @Roles("person", "creator", "business")
  @Get("me/notices")
  mine(@Query() q: GetMeNoticesQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Page<Notice>> {
    return this.me.list(accountOf(p), q.limit ?? DEFAULT_LIMIT, q.cursor);
  }

  /** E-78 */
  @Roles("person", "creator", "business")
  @Patch("me/notice-prefs")
  prefs(@Body() b: PatchMeNoticePrefsBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<NoticePrefs> {
    return this.me.setMuted(accountOf(p), b.muted);
  }
}
