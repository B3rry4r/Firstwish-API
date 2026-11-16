import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { accountOf } from "../people/business-of";
import { AiWritingService, type AiRequestView } from "./ai-writing.service";
import { AiPickPhotosBodyDto, AiWordsBodyDto } from "./ai-writing-bodies";

/** E-12, E-13, E-14: the signed-in sender's AI writing (a daily cap, no credits). Any signed-in side; no role decorator. */
@Controller("ai")
export class AiWritingController {
  constructor(private readonly ai: AiWritingService) {}

  /** E-12 */
  @Post("letter")
  @HttpCode(200)
  letter(@Body() body: AiWordsBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<AiRequestView> {
    return this.ai.words(accountOf(p), "letter_from_voice", body);
  }

  /** E-13 */
  @Post("pick-photos")
  @HttpCode(200)
  pick(@Body() body: AiPickPhotosBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<AiRequestView> {
    return this.ai.pickPhotos(accountOf(p), body);
  }

  /** E-14 */
  @Post("reasons")
  @HttpCode(200)
  reasons(@Body() body: AiWordsBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<AiRequestView> {
    return this.ai.words(accountOf(p), "reasons_from_voice", body);
  }
}
