import { Module } from "@nestjs/common";
import { NoticesModule } from "../notices/notices.module";
import { RoleAccessModule } from "../role-access/role-access.module";
import { ShowingModule } from "../showing/showing.module";
import { WishesModule } from "../wishes/wishes.module";
import { BansService } from "./bans.service";
import { ModerationController } from "./moderation.controller";
import { ReportLimits } from "./report-limits";
import { ReportsService } from "./reports.service";

/**
 * Moderation (B13): reports, "This is me, take it down", the staff queues and decisions, and bans.
 * ReportsService.counts() is for the Overview; BansService.lift() has no registry route yet.
 */
@Module({
  imports: [RoleAccessModule, NoticesModule, ShowingModule, WishesModule],
  controllers: [ModerationController],
  providers: [ReportsService, BansService, ReportLimits],
  exports: [ReportsService, BansService],
})
export class ModerationModule {}
