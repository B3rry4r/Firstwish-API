import { Module } from "@nestjs/common";
import { NoticesModule } from "../notices/notices.module";
import { RoleAccessModule } from "../role-access/role-access.module";
import { EmailWebhookService } from "./email-webhook.service";
import { IntakeLimits } from "./intake-limits";
import { EmailWebhookController, SupportController } from "./support.controller";
import { SupportService } from "./support.service";

/**
 * Support (B20): threads, replies by email both ways, saved replies, and the email provider's webhook (delivery news and inbound mail).
 * Every message goes by email (R11); the provider is Resend (R12).
 */
@Module({
  imports: [NoticesModule, RoleAccessModule],
  controllers: [SupportController, EmailWebhookController],
  providers: [SupportService, EmailWebhookService, IntakeLimits],
  exports: [SupportService],
})
export class SupportModule {}
