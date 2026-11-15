import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import {
  DeleteFeedWishesByIdReactionBodyDto,
  DeleteFeedWishesByIdReactionParamsDto,
  GetPlayWishesByIdParamsDto,
  PostFeedWishesByIdSharesBodyDto,
  PostFeedWishesByIdSharesParamsDto,
  PutFeedWishesByIdReactionBodyDto,
  PutFeedWishesByIdReactionParamsDto,
} from "../../contracts";
import type { PlayWish, ReactResponse, ShareResponse } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { accountOf } from "../people/business-of";
import { FeedWishesService } from "./feed-wishes.service";

/** The wish in the address is the one named; a body naming another wish is refused. */
function sameWish(id: string, wish: string): string {
  if (wish.trim() !== id) throw AppError.validation({ wish: "Must be the wish in the address." });
  return id;
}

/** E-143, E-142 (react), E-166 (share), E-122 (play): signed in, any side. */
@Controller()
export class FeedWishesController {
  constructor(private readonly feed: FeedWishesService) {}

  @Roles("person", "creator", "business")
  @Put("feed/wishes/:id/reaction")
  react(@Param() p: PutFeedWishesByIdReactionParamsDto, @Body() b: PutFeedWishesByIdReactionBodyDto, @CurrentPrincipal() who: Principal | undefined): Promise<ReactResponse> {
    return this.feed.react(accountOf(who), sameWish(p.id, b.wish), b.reaction);
  }

  @Roles("person", "creator", "business")
  @Delete("feed/wishes/:id/reaction")
  unreact(@Param() p: DeleteFeedWishesByIdReactionParamsDto, @Body() b: DeleteFeedWishesByIdReactionBodyDto, @CurrentPrincipal() who: Principal | undefined): Promise<ReactResponse> {
    return this.feed.unreact(accountOf(who), sameWish(p.id, b.wish));
  }

  @Roles("person", "creator", "business")
  @Post("feed/wishes/:id/shares")
  share(@Param() p: PostFeedWishesByIdSharesParamsDto, @Body() b: PostFeedWishesByIdSharesBodyDto): Promise<ShareResponse> {
    return this.feed.share(sameWish(p.id, b.wish), b.style);
  }

  @Roles("person", "creator", "business")
  @Get("play-wishes/:id")
  play(@Param() p: GetPlayWishesByIdParamsDto): Promise<PlayWish> {
    return this.feed.play(p.id);
  }
}
