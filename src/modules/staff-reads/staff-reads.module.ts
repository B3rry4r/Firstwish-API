import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { ModerationModule } from "../moderation/moderation.module";
import { NoticesModule } from "../notices/notices.module";
import { RenderJobsModule } from "../render-jobs/render-jobs.module";
import { SupportModule } from "../support/support.module";
import { WishesModule } from "../wishes/wishes.module";
import { AdminJobsService } from "./admin-jobs.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminWishesService } from "./admin-wishes.service";
import { NumbersService } from "./numbers.service";
import { OverviewService } from "./overview.service";
import { ProviderStatus } from "./provider-status";
import { QueuesService } from "./queues.service";
import { SettingsService } from "./settings.service";
import { TableProbe } from "./table-probe";
import { AdminJobsController, AdminPeopleController, AdminWishesController, NumbersController, OverviewController, SettingsController } from "./staff-reads.controllers";

/**
 * Staff reads (B21): the Overview, Numbers and targets, the queues, settings and providers, staff wishes and people, staff jobs.
 * Everything here reads the tables when asked; a change goes through the service that owns it and writes one audit row.
 */
@Module({
  imports: [AccountsModule, ModerationModule, NoticesModule, RenderJobsModule, SupportModule, WishesModule],
  controllers: [OverviewController, NumbersController, SettingsController, AdminWishesController, AdminPeopleController, AdminJobsController],
  providers: [TableProbe, ProviderStatus, QueuesService, OverviewService, NumbersService, SettingsService, AdminWishesService, AdminPeopleService, AdminJobsService],
})
export class StaffReadsModule {}
