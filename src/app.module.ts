import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./health/health.module";
// B03: staff accounts, roles, sign-in, and the one audit log
import { AuditModule } from "./modules/audit/audit.module";
import { RoleAccessModule } from "./modules/role-access/role-access.module";
import { StaffAccountsModule } from "./modules/staff-accounts/staff-accounts.module";
// end B03

/** Registration entry: each resource module adds one import line here. */
@Module({
  imports: [
    CommonModule,
    HealthModule,
    // B03
    AuditModule,
    RoleAccessModule,
    StaffAccountsModule,
    // end B03
  ],
})
export class AppModule {}
