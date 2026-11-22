import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from "@nestjs/common";
import {
  DeleteBusinessApprovedDatesBodyDto,
  DeleteBusinessPeopleByIdBodyDto,
  DeleteBusinessPeopleByIdParamsDto,
  GetBusinessApprovedDatesQueryDto,
  GetBusinessPeopleQueryDto,
  PatchBusinessPeopleByIdBodyDto,
  PatchBusinessPeopleByIdParamsDto,
  PostBusinessApprovedDatesBodyDto,
  PostBusinessPeopleBodyDto,
  PostBusinessPeopleImportBodyDto,
} from "../../contracts";
import type { Response } from "express";
import type { ApprovedDate, Person } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { DEFAULT_LIMIT, Page } from "../../common/pagination/cursor";
import { BusinessHeader } from "../pro-business/pro-access";
import { BusinessOf } from "./business-of";
import { ImportAnswer, PeopleService } from "./people.service";

/** E-117..E-121 a business's people, and E-17 the dates it has approved (registry auth: business). */
@Controller("business")
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly business: BusinessOf,
  ) {}

  @Roles("business")
  @Get("people")
  async list(@Query() q: GetBusinessPeopleQueryDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Page<Person>> {
    return this.people.list((await this.business.named(p, h, { ownerOnly: true })).businessId, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("business")
  @Post("people")
  async create(@Body() body: PostBusinessPeopleBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Person> {
    return this.people.create((await this.business.named(p, h, { ownerOnly: true })).businessId, body);
  }

  @Roles("business")
  @Post("people/import")
  @HttpCode(200)
  async import(@Body() body: PostBusinessPeopleImportBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<ImportAnswer> {
    return this.people.import((await this.business.named(p, h, { ownerOnly: true })).businessId, body.rows);
  }

  @Roles("business")
  @Patch("people/:id")
  async update(
    @Param() params: PatchBusinessPeopleByIdParamsDto,
    @Body() body: PatchBusinessPeopleByIdBodyDto,
    @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined,
  ): Promise<Person> {
    return this.people.update((await this.business.named(p, h, { ownerOnly: true })).businessId, params.id, body);
  }

  @Roles("business")
  @Delete("people/:id")
  @HttpCode(204)
  async remove(
    @Param() params: DeleteBusinessPeopleByIdParamsDto,
    @Body() _body: DeleteBusinessPeopleByIdBodyDto,
    @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined,
  ): Promise<void> {
    await this.people.remove((await this.business.named(p, h, { ownerOnly: true })).businessId, params.id);
  }

  @Roles("business")
  @Get("approved-dates")
  async approved(@Query() q: GetBusinessApprovedDatesQueryDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Page<ApprovedDate>> {
    return this.people.approved((await this.business.named(p, h, { ownerOnly: true })).businessId, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  /** E-239 (DEC-168): 201 for a new approval, 200 for the same body again. */
  @Roles("business")
  @Post("approved-dates")
  async approve(@Body() body: PostBusinessApprovedDatesBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined, @Res({ passthrough: true }) res: Response): Promise<ApprovedDate> {
    const r = await this.people.approve((await this.business.named(p, h, { ownerOnly: true })).businessId, body);
    res.status(r.created ? 201 : 200);
    return r.row;
  }

  /** E-238 (DEC-168): 204, also for a date that was not approved. */
  @Roles("business")
  @Delete("approved-dates")
  @HttpCode(204)
  async takeBack(@Body() body: DeleteBusinessApprovedDatesBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<void> {
    await this.people.takeBack((await this.business.named(p, h, { ownerOnly: true })).businessId, body);
  }
}
