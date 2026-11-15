import { Controller, Get, Param, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { GetVoiceNotesByIdParamsDto, GetVoiceNotesByIdQueryDto, type VoiceNote } from "../../contracts";
import { userOf } from "../stored-files/principal";
import { VoiceNotesService } from "./voice-notes.service";

@Controller("voice-notes")
export class VoiceNotesController {
  constructor(private readonly notes: VoiceNotesService) {}

  /** E-216 (registry auth: business; signed in, so any side). */
  @Roles("person", "creator", "business")
  @Get(":id")
  get(@Param() params: GetVoiceNotesByIdParamsDto, @Query() _q: GetVoiceNotesByIdQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<VoiceNote> {
    return this.notes.get(userOf(p).accountId, params.id);
  }
}
