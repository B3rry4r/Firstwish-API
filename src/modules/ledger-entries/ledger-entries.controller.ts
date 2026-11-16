import { Controller, Get, Query } from "@nestjs/common";
import { GetAdminLedgerEntriesQueryDto } from "../../contracts";
import { DEFAULT_LIMIT, Page } from "../../common/pagination/cursor";
import type { LedgerEntry } from "../../contracts";
import { AdminRoute } from "../role-access/staff-section.guard";
import { LedgerEntriesService } from "./ledger-entries.service";

/** E-64 (registry auth: finance, owner). Read only: no audit row, because nothing changes. */
@Controller("admin/ledger-entries")
export class LedgerEntriesController {
  constructor(private readonly entries: LedgerEntriesService) {}

  @AdminRoute("/admin/payments", "finance", "owner")
  @Get()
  list(@Query() q: GetAdminLedgerEntriesQueryDto): Promise<Page<LedgerEntry>> {
    return this.entries.list({ account: q.account, from: q.from, to: q.to, cursor: q.cursor, limit: q.limit ?? DEFAULT_LIMIT });
  }
}
