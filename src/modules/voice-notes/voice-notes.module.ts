import { Module } from "@nestjs/common";
import { StoredFilesModule } from "../stored-files/stored-files.module";
import { VoiceNotesController } from "./voice-notes.controller";
import { VoiceNotesService } from "./voice-notes.service";

/** VoiceNote (E-216). The row is made with its upload ticket (E-182, purpose voice). */
@Module({ imports: [StoredFilesModule], controllers: [VoiceNotesController], providers: [VoiceNotesService], exports: [VoiceNotesService] })
export class VoiceNotesModule {}
