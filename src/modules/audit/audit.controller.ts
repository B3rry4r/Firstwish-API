import { Controller, Get, Query } from "@nestjs/common";
import { GetAdminAuditQueryDto, type GetAdminAuditResponse } from "../../contracts";
import { AdminRoute } from "../role-access/staff-section.guard";
import { AuditService } from "./audit.service";

@Controller("admin/audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** E-18: owner and ops only (S4, A1), as the role table opens /admin/audit. */
  @AdminRoute("/admin/audit", "ops", "owner")
  @Get()
  list(@Query() q: GetAdminAuditQueryDto): Promise<GetAdminAuditResponse> {
    return this.audit.list(q);
  }
}
