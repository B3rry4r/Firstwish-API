// Request validation for event endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsObject, IsString } from "class-validator";
import type { PostEventsBody } from "../types";

/** E-52 POST /v1/events (body). */
export class PostEventsBodyDto implements PostEventsBody {
  @IsString()
  name!: string;
  @IsObject()
  props!: Record<string, unknown>;
}
