import { Controller, Get, Query } from "@nestjs/common";
import { GetAdminAuditQueryDto, type GetAdminAuditResponse } from "../../contracts";
import { AdminRoute } from "../role-access/staff-section.guard";
import { AuditService } from "./audit.service";

@Controller("admin/audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** E-18: the registry lists finance, ops and owner; the role table opens /admin/audit to owner and ops. */
  @AdminRoute("/admin/audit", "finance", "ops", "owner")
  @Get()
  list(@Query() q: GetAdminAuditQueryDto): Promise<GetAdminAuditResponse> {
    return this.audit.list(q);
  }
}
