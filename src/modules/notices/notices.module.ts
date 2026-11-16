import { Module } from "@nestjs/common";
import { RoleAccessModule } from "../role-access/role-access.module";
import { NoticesAdminService } from "./notices-admin.service";
import { NoticesController } from "./notices.controller";
import { NoticesMeService } from "./notices-me.service";
import { NoticesService } from "./notices.service";
import { EmailSuppression } from "./suppression";

/**
 * Email notices (B11): the five messages and their wording, the delivery log, notice choices, and the jobs that send.
 * Other modules inject NoticesService and call send(tx, { template, toAccountId | toEmail, data, key }).
 */
@Module({
  imports: [RoleAccessModule],
  controllers: [NoticesController],
  providers: [NoticesService, NoticesAdminService, NoticesMeService, EmailSuppression],
  exports: [NoticesService, EmailSuppression],
})
export class NoticesModule {}
