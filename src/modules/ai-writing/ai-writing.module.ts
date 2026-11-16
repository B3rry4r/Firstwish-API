import { Module } from "@nestjs/common";
import { StudioModule } from "../studio/studio.module";
import { AiWritingController } from "./ai-writing.controller";
import { AiWritingService } from "./ai-writing.service";

/** B23: the sender's AI writing (letter, reasons, photo order). Calls the AI port through the Studio's one helper. */
@Module({ imports: [StudioModule], controllers: [AiWritingController], providers: [AiWritingService] })
export class AiWritingModule {}
