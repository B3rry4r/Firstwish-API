import { Module } from "@nestjs/common";
import { RoleAccessModule } from "../role-access/role-access.module";
import { LedgerEntriesController } from "./ledger-entries.controller";
import { LedgerEntriesService } from "./ledger-entries.service";

/** Staff reads of ledger rows (B22, E-64). */
@Module({ imports: [RoleAccessModule], controllers: [LedgerEntriesController], providers: [LedgerEntriesService] })
export class LedgerEntriesModule {}
