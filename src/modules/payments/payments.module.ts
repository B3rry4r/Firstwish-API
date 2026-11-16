import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { NoticesModule } from "../notices/notices.module";
import { PeopleModule } from "../people/people.module";
import { AbandonPayments } from "./abandon";
import { FulfilmentRegistry } from "./fulfilment.registry";
import { PaymentsController, PaystackWebhookController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { SettlementService } from "./settlement.service";
import { WebhookService } from "./webhook.service";

/**
 * Payments core (B05): start, verify, the Paystack webhook, the ledger and the fulfilment frame. The fulfilment bundle injects
 * FulfilmentRegistry and registers one handler per price-book line.
 */
@Module({
  imports: [EventsModule, PeopleModule, NoticesModule],
  controllers: [PaymentsController, PaystackWebhookController],
  providers: [PaymentsService, SettlementService, WebhookService, FulfilmentRegistry, AbandonPayments],
  exports: [PaymentsService, SettlementService, FulfilmentRegistry, AbandonPayments],
})
export class PaymentsModule {}
