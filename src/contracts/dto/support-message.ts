// Request validation for support-message endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { PostSupportMessagesBody } from "../types";

/** E-203 POST /v1/support-messages (body). */
export class PostSupportMessagesBodyDto implements PostSupportMessagesBody {
  @IsString()
  body!: string;
  @IsString()
  threadId!: string;
}
