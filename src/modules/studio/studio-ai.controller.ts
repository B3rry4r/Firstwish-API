import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { PostAiStudioChangeBodyDto, PostAiStudioDraftBodyDto, type StyleChange } from "../../contracts";
import { accountOf } from "../people/business-of";
import { StudioAiService } from "./studio-ai.service";

/** E-15 and E-16: Studio AI help, through the AI port only. */
@Controller("ai")
export class StudioAiController {
  constructor(private readonly ai: StudioAiService) {}

  /** E-15 */
  @Roles("creator")
  @Post("studio-change")
  @HttpCode(200)
  change(@Body() body: PostAiStudioChangeBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<StyleChange> {
    return this.ai.change(accountOf(p), body);
  }

  /** E-16 */
  @Roles("creator")
  @Post("studio-draft")
  @HttpCode(200)
  draft(@Body() body: PostAiStudioDraftBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<StyleChange> {
    return this.ai.draft(accountOf(p), body);
  }
}
