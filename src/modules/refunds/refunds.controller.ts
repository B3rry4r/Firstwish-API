import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import {
  type GetAdminLedgerResponse,
  type GetAdminPaymentsResponse,
  PostAdminPaymentsByReferenceRefundBodyDto,
  PostAdminPaymentsByReferenceRefundParamsDto,
  GetAdminPaymentsByReferenceParamsDto,
  PostAdminReconciliationsBodyDto,
  PostAdminRefundsBodyDto,
  PostAdminRefundsByIdApproveRefundBodyDto,
  PostAdminRefundsByIdApproveRefundParamsDto,
  type PostAdminReconciliationsResponse,
  type PostAdminRefundsResponse,
} from "../../contracts";
import { CurrentPrincipal } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { CursorQueryDto } from "../../common/pagination/cursor";
import { IsDateOnly } from "../../common/validation/decorators";
import type { AuditActor } from "../audit/audit.service";
import { AdminRoute, StaffActor } from "../role-access/staff-section.guard";
import { AdminPaymentsService } from "./admin-payments.service";
import { ReconciliationService } from "./reconciliation.service";
import { RefundsService } from "./refunds.service";

/** E-84 with two more optional filters: `q` (a reference, a wish number or the payer's email) and `flag` (such as refund_due). */
export class AdminPaymentsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  state?: string;
}

/** E-63 with the day to show (YYYY-MM-DD); without it, the latest day checked. */
export class AdminLedgerQueryDto {
  @IsOptional()
  @IsDateOnly()
  day?: string;
}

const SECTION = "/admin/payments";

@Controller("admin/payments")
export class AdminPaymentsController {
  constructor(
    private readonly payments: AdminPaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  /** E-84 (registry auth: finance, ops, owner): every payment, newest first; `flag=refund_due` is the list waiting for a refund. */
  @AdminRoute(SECTION, "finance", "ops", "owner")
  @Get()
  list(@Query() q: AdminPaymentsQueryDto): Promise<GetAdminPaymentsResponse> {
    return this.payments.list(q) as unknown as Promise<GetAdminPaymentsResponse>;
  }

  /** E-85 (finance, ops, owner): one payment with its ledger rows, refunds and stored provider events. */
  @AdminRoute(SECTION, "finance", "ops", "owner")
  @Get(":reference")
  detail(@Param() p: GetAdminPaymentsByReferenceParamsDto) {
    return this.payments.detail(p.reference);
  }

  /**
   * E-86 (finance, ops, owner): start the refund and, for the owner only, send it in the same step. Anyone else leaves it waiting
   * for a second person (E-146); the answer's state says "refund-waiting". Answers the payment as it reads now.
   */
  @AdminRoute(SECTION, "finance", "ops", "owner")
  @Post(":reference/refund")
  @HttpCode(200)
  async refund(@Param() p: PostAdminPaymentsByReferenceRefundParamsDto, @Body() b: PostAdminPaymentsByReferenceRefundBodyDto, @StaffActor() actor: AuditActor, @CurrentPrincipal() who: Principal | undefined) {
    const isOwner = who?.kind === "staff" && who.roles.includes("owner");
    await this.refunds.startAndSend(p.reference, b.reason, actor, isOwner);
    return this.payments.byReference(p.reference);
  }
}

@Controller("admin/refunds")
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  /** E-145 (registry auth: finance, owner, support): ask for a refund of a whole, paid payment. */
  @AdminRoute(SECTION, "finance", "owner", "support")
  @Post()
  startRefund(@Body() b: PostAdminRefundsBodyDto, @StaffActor() actor: AuditActor): Promise<PostAdminRefundsResponse> {
    return this.refunds.start({ paymentId: b.paymentId, amountKobo: b.amountKobo, reason: b.reason }, actor);
  }

  /** E-146 (finance, owner): another staff member sends it to the provider. */
  @AdminRoute(SECTION, "finance", "owner")
  @Post(":id/approve-refund")
  @HttpCode(200)
  approveRefund(@Param() p: PostAdminRefundsByIdApproveRefundParamsDto, @Body() b: PostAdminRefundsByIdApproveRefundBodyDto, @StaffActor() actor: AuditActor) {
    return this.refunds.approve(p.id, b.reason, actor);
  }
}

@Controller("admin/ledger")
export class AdminLedgerController {
  constructor(private readonly days: ReconciliationService) {}

  /** E-63 (finance, ops, owner): our ledger against the provider's settlement for a day, each difference listed. */
  @AdminRoute(SECTION, "finance", "ops", "owner")
  @Get()
  day(@Query() q: AdminLedgerQueryDto): Promise<GetAdminLedgerResponse> {
    return this.days.ledgerDay(q.day);
  }
}

@Controller("admin/reconciliations")
export class AdminReconciliationsController {
  constructor(private readonly days: ReconciliationService) {}

  /** E-144 (finance, owner): check a finished day against the provider now. A day already checked answers its stored row. */
  @AdminRoute(SECTION, "finance", "owner")
  @Post()
  runReconciliation(@Body() b: PostAdminReconciliationsBodyDto, @StaffActor() actor: AuditActor): Promise<PostAdminReconciliationsResponse> {
    return this.days.runByStaff(b.day, b.reason, actor);
  }
}
