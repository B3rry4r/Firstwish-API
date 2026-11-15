import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  DeleteBusinessPeopleByIdBodyDto,
  DeleteBusinessPeopleByIdParamsDto,
  GetBusinessApprovedDatesQueryDto,
  GetBusinessPeopleQueryDto,
  PatchBusinessPeopleByIdBodyDto,
  PatchBusinessPeopleByIdParamsDto,
  PostBusinessPeopleBodyDto,
  PostBusinessPeopleImportBodyDto,
} from "../../contracts";
import type { ApprovedDate, Person } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { DEFAULT_LIMIT, Page } from "../../common/pagination/cursor";
import { BusinessOf } from "./business-of";
import { PeopleService } from "./people.service";

/** E-117..E-121 a business's people, and E-17 the dates it has approved (registry auth: business). */
@Controller("business")
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly business: BusinessOf,
  ) {}

  @Roles("business")
  @Get("people")
  async list(@Query() q: GetBusinessPeopleQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Page<Person>> {
    return this.people.list(await this.business.require(p), q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("business")
  @Post("people")
  async create(@Body() body: PostBusinessPeopleBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<Person> {
    return this.people.create(await this.business.require(p), body);
  }

  @Roles("business")
  @Post("people/import")
  @HttpCode(200)
  @Header("Content-Type", "application/json; charset=utf-8")
  async import(@Body() body: PostBusinessPeopleImportBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<number> {
    return this.people.import(await this.business.require(p), body.rows);
  }

  @Roles("business")
  @Patch("people/:id")
  async update(
    @Param() params: PatchBusinessPeopleByIdParamsDto,
    @Body() body: PatchBusinessPeopleByIdBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
  ): Promise<Person> {
    return this.people.update(await this.business.require(p), params.id, body);
  }

  @Roles("business")
  @Delete("people/:id")
  @HttpCode(204)
  async remove(
    @Param() params: DeleteBusinessPeopleByIdParamsDto,
    @Body() _body: DeleteBusinessPeopleByIdBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
  ): Promise<void> {
    await this.people.remove(await this.business.require(p), params.id);
  }

  @Roles("business")
  @Get("approved-dates")
  async approved(@Query() q: GetBusinessApprovedDatesQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Page<ApprovedDate>> {
    return this.people.approved(await this.business.require(p), q.cursor, q.limit ?? DEFAULT_LIMIT);
  }
}
