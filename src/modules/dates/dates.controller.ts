import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  DeleteMeDatesByIdBodyDto,
  DeleteMeDatesByIdParamsDto,
  GetMeDatesByIdParamsDto,
  GetMeDatesByIdQueryDto,
  GetMeDatesQueryDto,
  PostMeDatesBodyDto,
} from "../../contracts";
import type { DateRow } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { DEFAULT_LIMIT, Page } from "../../common/pagination/cursor";
import { accountOf, BusinessOf } from "../people/business-of";
import { PeopleService } from "../people/people.service";
import { DatesService } from "./dates.service";

/**
 * E-45..E-48 the signed-in person's remembered dates (registry auth: signed in, any side). A caller with the business side
 * also gets its business's people's birthdays and work anniversaries in the list (pro-people's coming dates), told apart by
 * `person` and `key`.
 */
@Controller("me/dates")
export class DatesController {
  constructor(
    private readonly dates: DatesService,
    private readonly business: BusinessOf,
    private readonly people: PeopleService,
  ) {}

  @Roles("person", "creator", "business")
  @Get()
  async list(@Query() q: GetMeDatesQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Page<DateRow>> {
    const accountId = accountOf(p);
    const businessId = p?.kind === "user" && p.sides.includes("business") ? await this.business.find(accountId) : null;
    return this.dates.list(accountId, businessId, this.people, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("person", "creator", "business")
  @Get(":id")
  one(@Param() params: GetMeDatesByIdParamsDto, @Query() _q: GetMeDatesByIdQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<DateRow> {
    return this.dates.one(accountOf(p), params.id);
  }

  /** 201 with the new row; 200 with the row already kept (the same date sent again, or a change to the caller's own row). */
  @Roles("person", "creator", "business")
  @Post()
  async save(@Body() body: PostMeDatesBodyDto, @CurrentPrincipal() p: Principal | undefined, @Res({ passthrough: true }) res: Response): Promise<DateRow> {
    const out = await this.dates.save(accountOf(p), body);
    res.status(out.created ? 201 : 200);
    return out.row;
  }

  @Roles("person", "creator", "business")
  @Delete(":id")
  @HttpCode(204)
  async remove(@Param() params: DeleteMeDatesByIdParamsDto, @Body() _body: DeleteMeDatesByIdBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<void> {
    await this.dates.remove(accountOf(p), params.id);
  }
}
