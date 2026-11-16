import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import {
  GetAdminCreatorsQueryDto,
  GetCreatorPayoutsQueryDto,
  PostAdminCreatorsPayoutsByCreatorPaidBodyDto,
  PostAdminCreatorsPayoutsByCreatorPaidParamsDto,
  PostAdminPayoutRunsByIdApproveBodyDto,
  PostAdminPayoutRunsByIdApproveParamsDto,
  PostBankAccountsBodyDto,
  type BankAccount,
  type Payout,
} from "../../contracts";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { BankAccountsService } from "./bank-accounts.service";
import { AdminCreatorsService, type AdminCreator } from "./admin-creators.service";
import { PayoutRunService } from "./payout-run.service";

const accountOf = (p: Principal | undefined): string => {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
};

@Controller()
export class PayoutsController {
  constructor(
    private readonly bank: BankAccountsService,
    private readonly runs: PayoutRunService,
    private readonly creators: AdminCreatorsService,
  ) {}

  /** E-22 (creator): set the bank and number payouts go to. The answer shows the last four digits only. */
  @Roles("creator")
  @Post("bank-accounts")
  setBank(@Body() body: PostBankAccountsBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<BankAccount> {
    return this.bank.set(accountOf(p), body);
  }

  /** E-116 (creator): the creator's own payouts. */
  @Roles("creator")
  @Get("creator/payouts")
  mine(@Query() q: GetCreatorPayoutsQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<{ items: Payout[]; nextCursor: string | null }> {
    return this.runs.mine(accountOf(p), q.cursor, q.limit);
  }

  /** E-41 (finance, ops, owner, reviewer): creators with plan, styles, earnings, payouts; bank numbers masked. */
  @AdminRoute("/admin/creators", "finance", "ops", "owner", "reviewer")
  @Get("admin/creators")
  list(@Query() q: GetAdminCreatorsQueryDto): Promise<{ items: AdminCreator[]; nextCursor: string | null }> {
    return this.creators.list(q.cursor, q.limit);
  }

  /** E-114 (finance, owner): a payout still due is recorded as paid by hand. */
  @AdminRoute("/admin/creators", "finance", "owner")
  @Post("admin/creators/payouts/:creator/paid")
  @HttpCode(200)
  paid(@Param() p: PostAdminCreatorsPayoutsByCreatorPaidParamsDto, @Body() body: PostAdminCreatorsPayoutsByCreatorPaidBodyDto, @StaffActor() actor: AuditActor): Promise<Payout> {
    return this.runs.markPaid(p.creator, body, actor);
  }

  /** E-115 (finance, owner): run the month now (the job's own work), with a reason; answers the run's rows. */
  @AdminRoute("/admin/creators", "finance", "owner")
  @Post("admin/payout-runs/:id/approve")
  @HttpCode(200)
  approve(@Param() p: PostAdminPayoutRunsByIdApproveParamsDto, @Body() body: PostAdminPayoutRunsByIdApproveBodyDto, @StaffActor() actor: AuditActor): Promise<{ items: Payout[]; nextCursor: null }> {
    return this.runs.approve(p.id, body, actor);
  }
}
