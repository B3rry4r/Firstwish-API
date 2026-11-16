import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  DeleteWishesByIdGatherVoicesByVoiceIdParamsDto, GetGBySlugParamsDto, GetWishesByIdGatherParamsDto, PostGBySlugVoiceBodyDto, PostGBySlugVoiceByIdConfirmParamsDto,
  PostGBySlugVoiceParamsDto, PostWishesByIdGatherOffParamsDto,
} from "../../contracts";
import type { GatherFriendView, GatherOwnerView, GatherVoiceAdded } from "../../contracts";
import { CurrentPrincipal, Public, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { userOf } from "../stored-files/principal";
import { GatherService } from "./gather.service";

/** HS1 the owner's side: E-260 read (and make) the gather link with its voices, E-261 turn it off, E-262 remove one voice. */
@Controller("wishes")
export class GatherOwnerController {
  constructor(private readonly gather: GatherService) {}

  @Roles("person", "creator", "business")
  @Get(":id/gather")
  view(@Param() p: GetWishesByIdGatherParamsDto, @CurrentPrincipal() who: Principal | undefined): Promise<GatherOwnerView> {
    return this.gather.ownerView(userOf(who).accountId, p.id);
  }

  @Roles("person", "creator", "business")
  @Post(":id/gather/off")
  @HttpCode(200)
  off(@Param() p: PostWishesByIdGatherOffParamsDto, @CurrentPrincipal() who: Principal | undefined): Promise<GatherOwnerView> {
    return this.gather.turnOff(userOf(who).accountId, p.id);
  }

  @Roles("person", "creator", "business")
  @Delete(":id/gather/voices/:voiceId")
  @HttpCode(204)
  async remove(@Param() p: DeleteWishesByIdGatherVoicesByVoiceIdParamsDto, @CurrentPrincipal() who: Principal | undefined): Promise<void> {
    await this.gather.removeVoice(userOf(who).accountId, p.id, p.voiceId);
  }
}

/** HS1 the friend's side, no account: E-263 who is asking, E-264 add one voice (a signed put), E-265 say it is up. */
@Controller("g/:slug")
export class GatherFriendController {
  constructor(private readonly gather: GatherService) {}

  @Public()
  @Get()
  view(@Param() p: GetGBySlugParamsDto, @Req() req: Request): Promise<GatherFriendView> {
    return this.gather.friendView(p.slug, req.ip ?? null);
  }

  @Public()
  @Post("voice")
  @HttpCode(201)
  add(@Param() p: PostGBySlugVoiceParamsDto, @Body() body: PostGBySlugVoiceBodyDto, @Req() req: Request): Promise<GatherVoiceAdded> {
    return this.gather.addVoice(p.slug, body, req.ip ?? null);
  }

  @Public()
  @Post("voice/:id/confirm")
  @HttpCode(200)
  confirm(@Param() p: PostGBySlugVoiceByIdConfirmParamsDto, @Req() req: Request): Promise<{ id: string; state: "ready" | "checking" | "refused"; reason?: string }> {
    return this.gather.confirmVoice(p.slug, p.id, req.ip ?? null);
  }
}
