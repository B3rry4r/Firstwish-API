import { Global, Module } from "@nestjs/common";
import { RoleAccessService } from "./role-access.service";
import { StaffSectionGuard } from "./staff-section.guard";

/** The role table and the staff-role guard, shared with every bundle that adds /v1/admin routes (use AdminRoute). */
@Global()
@Module({ providers: [RoleAccessService, StaffSectionGuard], exports: [RoleAccessService, StaffSectionGuard] })
export class RoleAccessModule {}
