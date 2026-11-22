// Request validation for webhook-event endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsIn, IsOptional } from "class-validator";
import type { PostWebhooksPaystackBody } from "../types";

/** E-217 POST /v1/webhooks/paystack (body). */
export class PostWebhooksPaystackBodyDto implements PostWebhooksPaystackBody {
  @IsOptional()
  @IsIn(["refund.processed", "refund.failed"])
  event?: "refund.processed" | "refund.failed";
}
