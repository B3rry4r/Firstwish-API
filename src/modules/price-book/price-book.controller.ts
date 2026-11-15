import { Body, Controller, createParamDecorator, ExecutionContext, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { createHash } from "node:crypto";
import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsOptional, IsString } from "class-validator";
import type { Principal } from "../../common/auth/principal";
import { Public, Roles } from "../../common/auth/decorators";
import {
  GetAdminPricesQueryDto,
  GetPriceBookQueryDto,
  PostAdminPriceBookVersionsBodyDto,
  PostAdminPriceBookVersionsByIdPublishBodyDto,
  PostAdminPriceBookVersionsByIdPublishParamsDto,
  PutAdminPricesByKeyBodyDto,
  PutAdminPricesByKeyParamsDto,
  type GetAdminPricesResponse,
  type Price,
  type PriceBook,
  type PriceBookVersion,
  type TicketQuote,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { PriceAdminService } from "./price-admin.service";
import { PublicBookService } from "./public-book.service";

/** E-213 (X13): ?ticket=ticket.single&extras=extra.a&extras=extra.b. One extra arrives as a string; it is read as a list of one. */
export class TicketQuoteQueryDto {
  @IsString()
  ticket!: string;
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  extras?: string[];
}

/** X19: whether the signed-in staff member holds the owner role (the audit actor carries no role). */
const IsOwnerCaller = createParamDecorator((_: unknown, ctx: ExecutionContext): boolean => {
  const p = ctx.switchToHttp().getRequest<{ principal?: Principal }>().principal;
  return !!p && p.kind === "staff" && p.roles.includes("owner");
});

@Controller()
export class PriceBookController {
  constructor(
    private readonly pub: PublicBookService,
    private readonly admin: PriceAdminService,
  ) {}

  /** E-125: public and cacheable; the ETag changes when the book or the price now changes (the promotion's end). */
  @Public()
  @Get("price-book")
  async book(@Query() q: GetPriceBookQueryDto, @Res({ passthrough: true }) res: Response): Promise<PriceBook> {
    const { body, maxAgeSeconds } = await this.pub.read(q);
    const etag = `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 32)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}, must-revalidate`);
    return body;
  }

  /** E-213 (X13): one quote for a ticket and its extras, priced by the server from the book. */
  @Roles("business")
  @Get("ticket-offers")
  offers(@Query() q: TicketQuoteQueryDto): Promise<TicketQuote> {
    return this.pub.quoteTicket(q.ticket, q.extras ?? []);
  }

  /** E-123 (X16): ops reads too; the role table opens /admin/prices to ops, read only. */
  @AdminRoute("/admin/prices", "finance", "ops", "owner")
  @Get("admin/prices")
  list(@Query() q: GetAdminPricesQueryDto): Promise<GetAdminPricesResponse> {
    return this.admin.list(q);
  }

  /** E-124 */
  @AdminRoute("/admin/prices", "finance", "owner")
  @Put("admin/prices/:key")
  change(@Param() p: PutAdminPricesByKeyParamsDto, @Body() body: PutAdminPricesByKeyBodyDto, @StaffActor() actor: AuditActor, @IsOwnerCaller() owner: boolean): Promise<Price> {
    return this.admin.change(p.key, body, actor, owner);
  }

  /** E-126 */
  @AdminRoute("/admin/prices", "finance", "owner")
  @Post("admin/price-book-versions")
  @HttpCode(201)
  draft(@Body() body: PostAdminPriceBookVersionsBodyDto, @StaffActor() actor: AuditActor): Promise<PriceBookVersion> {
    return this.admin.draft(body, actor);
  }

  /** E-127 */
  @AdminRoute("/admin/prices", "owner")
  @Post("admin/price-book-versions/:id/publish")
  @HttpCode(200)
  publish(
    @Param() p: PostAdminPriceBookVersionsByIdPublishParamsDto,
    @Body() body: PostAdminPriceBookVersionsByIdPublishBodyDto,
    @StaffActor() actor: AuditActor,
  ): Promise<PriceBookVersion> {
    return this.admin.publish(p.id, body, actor);
  }
}
