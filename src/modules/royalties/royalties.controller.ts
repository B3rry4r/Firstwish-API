import { Controller, Get, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { GetAdminEarningsQueryDto, GetCreatorEarningsQueryDto, type EarningsSummary, type RoyaltyAccrual } from "../../contracts";
import { AdminRoute } from "../role-access/staff-section.guard";
import { RoyaltiesService, type Summary } from "./royalties.service";

@Controller()
export class RoyaltiesController {
  constructor(private readonly royalties: RoyaltiesService) {}

  /** E-154 (creator): the creator's own accruals and reversals, newest first, with the summary (this month, waiting, paid, by style). */
  @Roles("creator")
  @Get("creator/earnings")
  earnings(@Query() q: GetCreatorEarningsQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<{ items: RoyaltyAccrual[]; nextCursor: string | null; summary: Summary }> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    return this.royalties.earnings(p.accountId, q.cursor, q.limit);
  }

  /** E-50 (finance, owner): what Firstwish took by line of the price book, between two days. */
  @AdminRoute("/admin/numbers", "finance", "owner")
  @Get("admin/earnings")
  byLine(@Query() q: GetAdminEarningsQueryDto): Promise<{ items: EarningsSummary[]; nextCursor: null }> {
    return this.royalties.earningsByLine(q.from, q.to);
  }
}
