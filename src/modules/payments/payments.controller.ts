import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { GetPaymentsByReferenceParamsDto, GetPaymentsByReferenceQueryDto, PostPaymentsBodyDto } from "../../contracts";
import type { PaymentStarted } from "../../contracts";
import { CurrentPrincipal, Roles, WebhookSignature } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { accountOf } from "../people/business-of";
import { PaymentsService, type PaymentView } from "./payments.service";
import { WebhookService } from "./webhook.service";

/** E-87 start and E-88 the payer's own payment (which also verifies a waiting one). Signed in, any side (DEC-116: nothing is public). */
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles("person", "creator", "business")
  @Post()
  @HttpCode(201)
  start(
    @Body() body: PostPaymentsBodyDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentPrincipal() p: Principal | undefined,
  ): Promise<PaymentStarted<null>> {
    return this.payments.start(accountOf(p), body, key?.trim() || undefined);
  }

  @Roles("person", "creator", "business")
  @Get(":reference")
  detail(@Param() params: GetPaymentsByReferenceParamsDto, @Query() _query: GetPaymentsByReferenceQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<PaymentView> {
    return this.payments.verifyOwn(accountOf(p), params.reference);
  }
}

/** E-217: the one URL Paystack posts every event to. No user; the signature on the raw body is the whole check. */
@Controller("webhooks/paystack")
export class PaystackWebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @WebhookSignature("paystack")
  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request & { rawBody?: Buffer }): Promise<Record<string, never>> {
    if (!req.rawBody) throw AppError.unauthorized("The signature does not match.");
    await this.webhooks.receive(req.rawBody);
    return {};
  }
}
