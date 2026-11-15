import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { createHash } from "node:crypto";
import { Public, Roles, StaffRoles } from "../../common/auth/decorators";
import {
  GetAdminPricesQueryDto,
  GetPriceBookQueryDto,
  GetTicketOffersQueryDto,
  PostAdminPriceBookVersionsBodyDto,
  PostAdminPriceBookVersionsByIdPublishBodyDto,
  PostAdminPriceBookVersionsByIdPublishParamsDto,
  PutAdminPricesByKeyBodyDto,
  PutAdminPricesByKeyParamsDto,
  type GetAdminPricesResponse,
  type GetTicketOffersResponse,
  type Price,
  type PriceBookVersion,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { PriceAdminService } from "./price-admin.service";
import { PublicBook, PublicBookService } from "./public-book.service";

@Controller()
export class PriceBookController {
  constructor(
    private readonly pub: PublicBookService,
    private readonly admin: PriceAdminService,
  ) {}

  /** E-125: public and cacheable; the ETag changes when the book or the price now changes (the promotion's end). */
  @Public()
  @Get("price-book")
  async book(@Query() q: GetPriceBookQueryDto, @Res({ passthrough: true }) res: Response): Promise<PublicBook> {
    const { body, maxAgeSeconds } = await this.pub.read(q);
    const etag = `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 32)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}, must-revalidate`);
    return body;
  }

  /** E-213 */
  @Roles("business")
  @Get("ticket-offers")
  offers(@Query() q: GetTicketOffersQueryDto): Promise<GetTicketOffersResponse> {
    return this.pub.ticketOffers(q);
  }

  /**
   * E-123: the registry lets ops read the prices (finance, ops, owner), while the role table does not open /admin/prices
   * to ops; the registry's roles decide this read, so no section check here.
   */
  @StaffRoles("finance", "ops", "owner")
  @Get("admin/prices")
  list(@Query() q: GetAdminPricesQueryDto): Promise<GetAdminPricesResponse> {
    return this.admin.list(q);
  }

  /** E-124 */
  @AdminRoute("/admin/prices", "finance", "owner")
  @Put("admin/prices/:key")
  change(@Param() p: PutAdminPricesByKeyParamsDto, @Body() body: PutAdminPricesByKeyBodyDto, @StaffActor() actor: AuditActor): Promise<Price> {
    return this.admin.change(p.key, body, actor);
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
