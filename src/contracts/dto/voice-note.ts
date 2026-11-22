// Request validation for voice-note endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { GetVoiceNotesByIdParams } from "../types";

/** E-216 GET /v1/voice-notes/:id (query). */
export class GetVoiceNotesByIdQueryDto {}
export class GetVoiceNotesByIdParamsDto implements GetVoiceNotesByIdParams {
  @IsString()
  id!: string;
}
