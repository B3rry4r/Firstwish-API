import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import {
  GetAdminPeopleByIdParamsDto, GetAdminWishesByNoParamsDto, PostAdminJobsByIdRetryBodyDto, PostAdminJobsByIdRetryParamsDto,
  PostAdminPeopleByIdActionsBodyDto, PostAdminPeopleByIdActionsParamsDto, PostAdminPeopleByIdContactRevealBodyDto, PostAdminPeopleByIdContactRevealParamsDto,
  PostAdminWishesByNoActionsBodyDto, PostAdminWishesByNoActionsParamsDto, PutAdminNumbersTargetsBodyDto, PutAdminSettingsStorageBodyDto,
  PutAdminSettingsSwitchesByKeyBodyDto, PutAdminSettingsSwitchesByKeyParamsDto,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { AdminJobsService } from "./admin-jobs.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminWishesService } from "./admin-wishes.service";
import { AdminJobsQueryDto, AdminNumbersQueryDto, AdminOverviewQueryDto, AdminPeopleQueryDto, AdminWishesQueryDto } from "./dto";
import { NumbersService } from "./numbers.service";
import { OverviewService } from "./overview.service";
import { SettingsService } from "./settings.service";

const rolesOf = (p: Principal | undefined) => (p?.kind === "staff" ? p.roles : []);

@Controller("admin/overview")
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  /** E-82 (registry auth: every staff role): the parts of the day the caller's role opens. */
  @AdminRoute("/admin", "finance", "maker", "moderator", "ops", "owner", "reviewer", "support")
  @Get()
  read(@Query() q: AdminOverviewQueryDto, @CurrentPrincipal() who: Principal | undefined) {
    return this.overview.read(rolesOf(who), q.day);
  }
}

@Controller("admin/numbers")
export class NumbersController {
  constructor(private readonly numbers: NumbersService) {}

  /** E-79 (finance, ops, owner). */
  @AdminRoute("/admin/numbers", "finance", "ops", "owner")
  @Get()
  read(@Query() q: AdminNumbersQueryDto) {
    return this.numbers.read(q.period);
  }

  /** E-80 (finance, owner): the monthly target of one line. */
  @AdminRoute("/admin/numbers", "finance", "owner")
  @Put("targets")
  setTarget(@Body() b: PutAdminNumbersTargetsBodyDto, @StaffActor() actor: AuditActor) {
    return this.numbers.setTarget(b, actor);
  }
}

@Controller("admin/settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** E-163 (owner): the switches, the storage choice and the providers. */
  @AdminRoute("/admin/settings", "owner")
  @Get()
  read() {
    return this.settings.read();
  }

  /** E-164 (owner): 204; nothing changes when the choice is already in force. */
  @AdminRoute("/admin/settings", "owner")
  @Put("storage")
  @HttpCode(204)
  async storage(@Body() b: PutAdminSettingsStorageBodyDto, @StaffActor() actor: AuditActor): Promise<void> {
    await this.settings.setStorage(b.choice, b.reason, actor);
  }

  /** E-165 (owner): 204. */
  @AdminRoute("/admin/settings", "owner")
  @Put("switches/:key")
  @HttpCode(204)
  async switch(@Param() p: PutAdminSettingsSwitchesByKeyParamsDto, @Body() b: PutAdminSettingsSwitchesByKeyBodyDto, @StaffActor() actor: AuditActor): Promise<void> {
    await this.settings.setSwitch(p.key, b.on, b.reason, actor);
  }
}

@Controller("admin/wishes")
export class AdminWishesController {
  constructor(private readonly wishes: AdminWishesService) {}

  /** E-218 (moderator, ops, owner, support). */
  @AdminRoute("/admin/wishes", "moderator", "ops", "owner", "support")
  @Get()
  list(@Query() q: AdminWishesQueryDto) {
    return this.wishes.list(q);
  }

  /** E-219. */
  @AdminRoute("/admin/wishes", "moderator", "ops", "owner", "support")
  @Get(":no")
  detail(@Param() p: GetAdminWishesByNoParamsDto) {
    return this.wishes.detail(p.no);
  }

  /** E-220: take_down, restore, extend, resend or refund, each with a reason. */
  @AdminRoute("/admin/wishes", "moderator", "ops", "owner", "support")
  @Post(":no/actions")
  @HttpCode(200)
  act(@Param() p: PostAdminWishesByNoActionsParamsDto, @Body() b: PostAdminWishesByNoActionsBodyDto, @StaffActor() actor: AuditActor, @CurrentPrincipal() who: Principal | undefined) {
    return this.wishes.act(p.no, b.action, b.reason, actor, rolesOf(who).includes("owner"));
  }
}

@Controller("admin/people")
export class AdminPeopleController {
  constructor(private readonly people: AdminPeopleService) {}

  /** E-1 (moderator, ops, owner, support): contact details masked. */
  @AdminRoute("/admin/people", "moderator", "ops", "owner", "support")
  @Get()
  list(@Query() q: AdminPeopleQueryDto) {
    return this.people.list(q);
  }

  /** E-2. */
  @AdminRoute("/admin/people", "moderator", "ops", "owner", "support")
  @Get(":id")
  detail(@Param() p: GetAdminPeopleByIdParamsDto) {
    return this.people.detail(p.id);
  }

  /** E-3: ban, lift or erase, with a reason. */
  @AdminRoute("/admin/people", "moderator", "ops", "owner", "support")
  @Post(":id/actions")
  @HttpCode(200)
  act(@Param() p: PostAdminPeopleByIdActionsParamsDto, @Body() b: PostAdminPeopleByIdActionsBodyDto, @StaffActor() actor: AuditActor) {
    return this.people.act(p.id, b.action, b.reason, actor);
  }

  /** E-4: audited and limited; the registry answers 204 with no body (Q12), so the values it reads are not sent (see the hand-back). */
  @AdminRoute("/admin/people", "moderator", "ops", "owner", "support")
  @Post(":id/contact-reveal")
  @HttpCode(204)
  async reveal(@Param() p: PostAdminPeopleByIdContactRevealParamsDto, @Body() b: PostAdminPeopleByIdContactRevealBodyDto, @StaffActor() actor: AuditActor): Promise<void> {
    await this.people.reveal(p.id, b.reason, actor);
  }
}

@Controller("admin/jobs")
export class AdminJobsController {
  constructor(private readonly jobs: AdminJobsService) {}

  /** E-61 (ops, owner). */
  @AdminRoute("/admin", "ops", "owner")
  @Get()
  list(@Query() q: AdminJobsQueryDto) {
    return this.jobs.list(q);
  }

  /** E-62 (ops, owner). */
  @AdminRoute("/admin", "ops", "owner")
  @Post(":id/retry")
  @HttpCode(200)
  retry(@Param() p: PostAdminJobsByIdRetryParamsDto, @Body() b: PostAdminJobsByIdRetryBodyDto, @StaffActor() actor: AuditActor) {
    return this.jobs.retry(p.id, b.reason, actor);
  }
}
