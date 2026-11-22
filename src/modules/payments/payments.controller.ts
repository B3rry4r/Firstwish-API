import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { GetPaymentsByReferenceParamsDto, GetPaymentsByReferenceQueryDto, GetPaymentsQueryDto, PostPaymentsBodyDto, PostPaymentsByReferenceDropParamsDto } from "../../contracts";
import type { PaymentStarted } from "../../contracts";
import { CurrentPrincipal, Roles, WebhookSignature } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { accountOf } from "../people/business-of";
import { PaymentsService, type PaymentPage, type PaymentView } from "./payments.service";
import { WebhookService } from "./webhook.service";

/** E-87 start and E-88 the payer's own payment (which also verifies a waiting one). Signed in, any side (DEC-116: nothing is public). */
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles("person", "creator", "business")
  @Post()
  @HttpCode(201)
  async start(
    @Body() body: PostPaymentsBodyDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentPrincipal() p: Principal | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentStarted<null>> {
    const r = await this.payments.start(accountOf(p), body, key?.trim() || undefined);
    res.status(r.status);
    return r.started;
  }

  /** E-240: the payer's own payments, newest first, by cursor. Declared before the reference route. */
  @Roles("person", "creator", "business")
  @Get()
  list(@Query() q: GetPaymentsQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<PaymentPage> {
    return this.payments.listOwn(accountOf(p), { cursor: q.cursor, limit: q.limit });
  }

  /** ID1: the owner drops a waiting ticket payment of theirs at once; answers the payment as it stands. */
  @Roles("person", "creator", "business")
  @Post(":reference/drop")
  @HttpCode(200)
  drop(@Param() params: PostPaymentsByReferenceDropParamsDto, @CurrentPrincipal() p: Principal | undefined): Promise<PaymentView> {
    return this.payments.dropTicket(accountOf(p), params.reference);
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
