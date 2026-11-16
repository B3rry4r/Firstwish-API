import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import {
  DeleteWishesByIdPublishRequestsBodyDto, DeleteWishesByIdPublishRequestsParamsDto, GetAdminShowingQueryDto, GetShowingQueryDto,
  PostAdminShowingListedByNoUnlistBodyDto, PostAdminShowingListedByNoUnlistParamsDto, PostAdminShowingRequestsByIdDecideBodyDto,
  PostAdminShowingRequestsByIdDecideParamsDto, PostWishesByIdPublishRequestsBodyDto, PostWishesByIdPublishRequestsParamsDto,
  PutAdminShowingDayByDateBodyDto, PutAdminShowingDayByDateParamsDto,
} from "../../contracts";
import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { CurrentPrincipal, Public, Roles } from "../../common/auth/decorators";
import { AccessTokenVerifier, type Principal } from "../../common/auth/principal";
import type { AuditActor } from "../audit/audit.service";
import { accountOf } from "../people/business-of";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { ShowingService } from "./showing.service";

/** E-136 and E-137 need the creator side (T-25): a person-only or business-only account gets 403 naming it. */
function creatorSideOnly(who: Principal | undefined): string {
  const accountId = accountOf(who);
  if (!who || who.kind !== "user" || !who.sides.includes("creator")) {
    throw new AppError(HttpStatus.FORBIDDEN, "creator_side_required", "Turn on the creator side to show a wish.");
  }
  return accountId;
}

/** The owner's asks to be shown (E-137, E-136), the public list (E-140) and the staff side (E-135, E-138, E-139, E-49). */
@Controller()
export class ShowingController {
  constructor(
    private readonly showing: ShowingService,
    private readonly tokens: AccessTokenVerifier,
  ) {}

  /** E-137 (registry auth: creator;own records; any signed-in side here, as the wish routes are). */
  @Roles("person", "creator", "business")
  @Post("wishes/:id/publish-requests")
  @HttpCode(201)
  ask(@Param() p: PostWishesByIdPublishRequestsParamsDto, @Body() b: PostWishesByIdPublishRequestsBodyDto, @CurrentPrincipal() who: Principal | undefined) {
    return this.showing.request(creatorSideOnly(who), p.id, b);
  }

  /** E-136. */
  @Roles("person", "creator", "business")
  @Delete("wishes/:id/publish-requests")
  unpublish(@Param() p: DeleteWishesByIdPublishRequestsParamsDto, @Body() b: DeleteWishesByIdPublishRequestsBodyDto, @CurrentPrincipal() who: Principal | undefined) {
    return this.showing.withdraw(creatorSideOnly(who), p.id, b);
  }

  /** E-140 (public). */
  @Public()
  @Get("showing")
  async list(@Query() q: GetShowingQueryDto, @Headers("authorization") auth: string | undefined) {
    return this.showing.publicList(q, await this.viewer(auth));
  }

  /** HP9: a good bearer token marks the viewer's own reaction and save on each row; no token, or one that is not good, reads as a visitor. */
  private async viewer(auth: string | undefined): Promise<string | null> {
    const m = /^Bearer\s+(\S+)$/i.exec(auth ?? "");
    if (!m) return null;
    const p = await this.tokens.verify(m[1]);
    return p?.kind === "user" ? p.accountId : null;
  }

  /** E-138. */
  @AdminRoute("/admin/showing", "moderator", "ops", "owner")
  @Get("admin/showing")
  adminList(@Query() q: GetAdminShowingQueryDto) {
    return this.showing.adminList(q);
  }

  /** E-135. */
  @AdminRoute("/admin/showing", "moderator", "ops", "owner")
  @Post("admin/showing/requests/:id/decide")
  @HttpCode(200)
  decide(@Param() p: PostAdminShowingRequestsByIdDecideParamsDto, @Body() b: PostAdminShowingRequestsByIdDecideBodyDto, @StaffActor() actor: AuditActor) {
    return this.showing.decide(p.id, b, actor);
  }

  /** E-139. */
  @AdminRoute("/admin/showing", "moderator", "ops", "owner")
  @Post("admin/showing/listed/:no/unlist")
  @HttpCode(200)
  unlist(@Param() p: PostAdminShowingListedByNoUnlistParamsDto, @Body() b: PostAdminShowingListedByNoUnlistBodyDto, @StaffActor() actor: AuditActor) {
    return this.showing.unlist(p.no, b, actor);
  }

  /** E-49. */
  @AdminRoute("/admin/showing", "moderator", "ops", "owner")
  @Put("admin/showing/day/:date")
  pickDay(@Param() p: PutAdminShowingDayByDateParamsDto, @Body() b: PutAdminShowingDayByDateBodyDto, @StaffActor() actor: AuditActor) {
    return this.showing.pickDay(p.date, b, actor);
  }
}
