import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  DeleteBusinessLoginsByIdParamsDto,
  GetAdminBusinessesByIdParamsDto,
  GetAdminBusinessesQueryDto,
  GetBusinessClientWishesByIdParamsDto,
  GetBusinessClientWishesQueryDto,
  GetBusinessInvoicesByIdFileParamsDto,
  GetBusinessInvoicesQueryDto,
  GetBusinessLoginsQueryDto,
  PostBusinessClientWishesBodyDto,
  PostBusinessClientWishesByIdApproveDateBodyDto,
  PostBusinessClientWishesByIdApproveDateParamsDto,
  PostBusinessLoginsBodyDto,
} from "../../contracts";
import type { Business, ClientWish, Invoice, InvoiceFile, Login } from "../../contracts";
import { CurrentPrincipal, Roles, StaffRoles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { DEFAULT_LIMIT, Page } from "../../common/pagination/cursor";
import { ClientWishesService } from "./client-wishes.service";
import { InvoicesService } from "./invoices.service";
import { LoginsService } from "./logins.service";
import { PendingPlan, PlanOffer, PlanState } from "./plan-view";
import { BusinessHeader, ProAccess } from "./pro-access";
import { AdminBusiness, ProBusinessService, UsageAnswer } from "./pro-business.service";

/** The business side: E-25 (the business), E-27 and E-128 (plan and usage), E-29 to E-32 (client wishes), E-59 and E-60 (invoices), E-66 to E-68 (logins). */
@Controller("business")
export class ProBusinessController {
  constructor(
    private readonly access: ProAccess,
    private readonly business: ProBusinessService,
    private readonly wishes: ClientWishesService,
    private readonly invoices: InvoicesService,
    private readonly logins: LoginsService,
  ) {}

  @Roles("person", "business")
  @Get()
  async one(@CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Business> {
    const c = await this.access.require(p, h);
    return this.business.view(c.businessId, c.owner);
  }

  @Roles("person", "business")
  @Get("plan")
  async plan(@CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<UsageAnswer & { offers: PlanOffer[]; pending: PendingPlan | null }> {
    return this.business.planOf((await this.access.require(p, h)).businessId);
  }

  @Roles("person", "business")
  @Get("usage")
  async usage(@CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<UsageAnswer> {
    return this.business.usageOf((await this.access.require(p, h)).businessId);
  }

  @Roles("person", "business")
  @Get("client-wishes")
  async listWishes(@Query() q: GetBusinessClientWishesQueryDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Page<ClientWish>> {
    return this.wishes.list((await this.access.require(p, h)).businessId, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("person", "business")
  @Post("client-wishes")
  async makeWish(@Body() body: PostBusinessClientWishesBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<ClientWish> {
    const c = await this.access.require(p, h);
    return this.wishes.create(c.accountId, c.businessId, body);
  }

  @Roles("person", "business")
  @Get("client-wishes/:id")
  async oneWish(@Param() params: GetBusinessClientWishesByIdParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<ClientWish> {
    return this.wishes.get((await this.access.require(p, h)).businessId, params.id);
  }

  @Roles("person", "business")
  @Post("client-wishes/:id/approve-date")
  async approveDate(
    @Param() params: PostBusinessClientWishesByIdApproveDateParamsDto,
    @Body() body: PostBusinessClientWishesByIdApproveDateBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<ClientWish> {
    const c = await this.access.require(p, h);
    return this.wishes.approveDate(c.accountId, c.businessId, params.id, body);
  }

  @Roles("person", "business")
  @Get("invoices")
  async listInvoices(@Query() q: GetBusinessInvoicesQueryDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Page<Invoice>> {
    return this.invoices.list((await this.access.requireOwner(p, h)).businessId, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("person", "business")
  @Get("invoices/:id/file")
  async invoiceFile(@Param() params: GetBusinessInvoicesByIdFileParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<InvoiceFile> {
    return this.invoices.file((await this.access.requireOwner(p, h)).businessId, params.id);
  }

  @Roles("person", "business")
  @Get("logins")
  async listLogins(@Query() q: GetBusinessLoginsQueryDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Page<Login>> {
    return this.logins.list((await this.access.requireOwner(p, h)).businessId, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("person", "business")
  @Post("logins")
  async invite(@Body() body: PostBusinessLoginsBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Login> {
    return this.logins.invite((await this.access.requireOwner(p, h)).businessId, body.contact);
  }

  @Roles("person", "business")
  @Delete("logins/:id")
  @HttpCode(204)
  async removeLogin(@Param() params: DeleteBusinessLoginsByIdParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<void> {
    await this.logins.remove((await this.access.requireOwner(p, h)).businessId, params.id);
  }
}

/** E-23 and E-24: staff read businesses (finance, ops, owner). Read only: the registry gives staff no action on a business. */
@Controller("admin/businesses")
export class AdminBusinessesController {
  constructor(private readonly business: ProBusinessService) {}

  @StaffRoles("finance", "ops", "owner")
  @Get()
  list(@Query() q: GetAdminBusinessesQueryDto): Promise<Page<Business>> {
    return this.business.adminList(q.cursor, q.limit ?? DEFAULT_LIMIT, q.q);
  }

  @StaffRoles("finance", "ops", "owner")
  @Get(":id")
  one(@Param() params: GetAdminBusinessesByIdParamsDto): Promise<AdminBusiness> {
    return this.business.adminOne(params.id);
  }
}

export type { PlanState };
