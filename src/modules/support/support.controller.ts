import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, Query, Req, Res } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import {
  GetAdminSupportThreadsByIdParamsDto, GetAdminSupportThreadsQueryDto, PostAdminSupportThreadsByIdAssigneeBodyDto, PostAdminSupportThreadsByIdAssigneeParamsDto,
  PostAdminSupportThreadsByIdReplyBodyDto, PostAdminSupportThreadsByIdReplyParamsDto, PostAdminSupportThreadsByIdStateBodyDto, PostAdminSupportThreadsByIdStateParamsDto,
  PostSupportMessagesBodyDto, PostSupportThreadsBodyDto,
} from "../../contracts";
import type { SavedReply, SupportMessage, SupportThread, ThreadCounts } from "../../contracts";
import { CurrentPrincipal, Public, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { withRetryAfter } from "../../common/errors/rate-limited";
import { DEFAULT_LIMIT } from "../../common/pagination/cursor";
import type { Page } from "../../common/pagination/cursor";
import type { AuditActor } from "../audit/audit.service";
import { accountOf } from "../people/business-of";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { EmailWebhookService } from "./email-webhook.service";
import { SECTION, SupportService, type ThreadDetail } from "./support.service";

/** E-206 with the filters the inbox needs: ?status=open|waiting|closed and ?assigneeId=. */
export class SupportThreadsQueryDto extends GetAdminSupportThreadsQueryDto {
  @IsOptional()
  @IsIn(["open", "waiting", "closed"], { message: "Must be open, waiting or closed." })
  status?: string;
  @IsOptional()
  @IsString()
  assigneeId?: string;
}

/** The contact page: a person who is not signed in writes in with an email. */
export class PostSupportContactBodyDto {
  @IsString()
  @MaxLength(300)
  email!: string;
  @IsString()
  subject!: string;
  @IsString()
  body!: string;
}

@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** E-210. Signed in, any side. */
  @Roles("person", "creator", "business")
  @Post("support-threads")
  async open(@Body() b: PostSupportThreadsBodyDto, @CurrentPrincipal() p: Principal | undefined, @Ip() ip: string, @Res({ passthrough: true }) res: Response): Promise<ThreadDetail> {
    return this.support.open(accountOf(p), b.subject, b.body, ip).catch((e: unknown) => withRetryAfter(res, e));
  }

  /** The contact page (not in the registry: HALT 3). Public; counted per network and per email, 5 a day each. */
  @Public()
  @Post("support-threads/contact")
  async contact(@Body() b: PostSupportContactBodyDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response): Promise<ThreadDetail> {
    return this.support.openFromContact(b.email, b.subject, b.body, ip).catch((e: unknown) => withRetryAfter(res, e));
  }

  /** E-203. */
  @Roles("person", "creator", "business")
  @Post("support-messages")
  message(@Body() b: PostSupportMessagesBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<SupportMessage> {
    return this.support.customerMessage(accountOf(p), b.threadId, b.body);
  }

  /** E-205 */
  @AdminRoute(SECTION, "ops", "owner", "support")
  @Get("admin/support/counts")
  counts(): Promise<ThreadCounts> {
    return this.support.counts();
  }

  /** E-206 */
  @AdminRoute(SECTION, "ops", "owner", "support")
  @Get("admin/support/threads")
  list(@Query() q: SupportThreadsQueryDto): Promise<Page<SupportThread>> {
    return this.support.list(q.limit ?? DEFAULT_LIMIT, q.cursor, { status: q.status, assigneeId: q.assigneeId });
  }

  /** The saved replies (not in the registry: HALT 3). */
  @AdminRoute(SECTION, "ops", "owner", "support")
  @Get("admin/support/saved-replies")
  saved(): Promise<{ items: SavedReply[]; nextCursor: null }> {
    return this.support.savedReplies().then((items) => ({ items, nextCursor: null }));
  }

  /** E-207 */
  @AdminRoute(SECTION, "ops", "owner", "support")
  @Get("admin/support/threads/:id")
  one(@Param() p: GetAdminSupportThreadsByIdParamsDto): Promise<ThreadDetail> {
    return this.support.get(p.id);
  }

  /** E-208 */
  @AdminRoute(SECTION, "ops", "owner", "support")
  @Post("admin/support/threads/:id/reply")
  @HttpCode(200)
  reply(@Param() p: PostAdminSupportThreadsByIdReplyParamsDto, @Body() b: PostAdminSupportThreadsByIdReplyBodyDto, @StaffActor() actor: AuditActor): Promise<ThreadDetail> {
    return this.support.reply(p.id, b.text, b.reason, actor);
  }

  /** E-209 */
  @AdminRoute(SECTION, "ops", "owner", "support")
  @Post("admin/support/threads/:id/state")
  @HttpCode(200)
  state(@Param() p: PostAdminSupportThreadsByIdStateParamsDto, @Body() b: PostAdminSupportThreadsByIdStateBodyDto, @StaffActor() actor: AuditActor): Promise<ThreadDetail> {
    return this.support.setState(p.id, b.state, b.reason, actor);
  }

  /** E-204: owner and support only (the registry). */
  @AdminRoute(SECTION, "owner", "support")
  @Post("admin/support-threads/:id/assignee")
  @HttpCode(200)
  assign(@Param() p: PostAdminSupportThreadsByIdAssigneeParamsDto, @Body() b: PostAdminSupportThreadsByIdAssigneeBodyDto, @StaffActor() actor: AuditActor): Promise<SupportThread> {
    return this.support.assign(p.id, b.assigneeId, b.reason, actor);
  }
}

/** E-72 (delivery news) and E-211 (inbound mail): Resend's signed stream. The signature is checked inside, by svix (the kernel's webhook guard knows Paystack only). */
@Controller("webhooks/email")
export class EmailWebhookController {
  constructor(private readonly hooks: EmailWebhookService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async news(@Req() req: Request & { rawBody?: Buffer }, @Headers("svix-id") id?: string, @Headers("svix-timestamp") timestamp?: string, @Headers("svix-signature") signature?: string): Promise<Record<string, never>> {
    await this.hooks.receive(req.rawBody, { id, timestamp, signature });
    return {};
  }

  @Public()
  @Post("inbound")
  @HttpCode(200)
  async inbound(@Req() req: Request & { rawBody?: Buffer }, @Headers("svix-id") id?: string, @Headers("svix-timestamp") timestamp?: string, @Headers("svix-signature") signature?: string): Promise<Record<string, never>> {
    await this.hooks.receive(req.rawBody, { id, timestamp, signature });
    return {};
  }
}
