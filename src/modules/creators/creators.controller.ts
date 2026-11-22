import { Controller, Get, Headers, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { publicRead } from "../../common/http/public-cache";
import { GetCreatorsByHandleParamsDto, GetCreatorsByHandleQueryDto, GetCreatorsByHandleStylesParamsDto, GetCreatorsByHandleStylesQueryDto, GetCreatorsByHandleWishesParamsDto, GetCreatorsByHandleWishesQueryDto, GetCreatorsQueryDto } from "../../contracts";
import { Public } from "../../common/auth/decorators";
import { AccessTokenVerifier } from "../../common/auth/principal";
import type { Page } from "../../common/pagination/cursor";
import type { PublicCreator } from "../accounts/public-creators";
import { CreatorsService } from "./creators.service";

/**
 * E-42 GET /v1/creators. Registry auth: public, or signed in (any side). A good bearer token marks `following` and `own`; no
 * token, or one that is not good, reads as anyone.
 */
@Controller("creators")
export class CreatorsController {
  constructor(
    private readonly creators: CreatorsService,
    private readonly tokens: AccessTokenVerifier,
  ) {}

  @Public()
  @Get()
  async list(@Query() q: GetCreatorsQueryDto, @Headers("authorization") auth: string | undefined): Promise<Page<PublicCreator>> {
    return this.creators.list(await this.viewer(auth), q.cursor, q.limit);
  }

  /** E-236 GET /v1/creators/:handle (public; a good bearer token marks `following` and `own`). */
  @Public()
  @Get(":handle")
  async one(
    @Param() params: GetCreatorsByHandleParamsDto,
    @Query() _q: GetCreatorsByHandleQueryDto,
    @Headers("authorization") auth: string | undefined,
  ): Promise<PublicCreator> {
    return this.creators.one(await this.viewer(auth), params.handle);
  }

  /** E-285 (IF6): the creator's styles that are on. The same for everyone, so a shared cache may keep it. */
  @Public()
  @Get(":handle/styles")
  async styles(@Param() params: GetCreatorsByHandleStylesParamsDto, @Query() q: GetCreatorsByHandleStylesQueryDto, @Res({ passthrough: true }) res: Response) {
    return publicRead(res, await this.creators.styles(params.handle, q));
  }

  /** E-283 (IF6): the creator's wishes on Now showing now. The same for everyone, so a shared cache may keep it. */
  @Public()
  @Get(":handle/wishes")
  async wishes(@Param() params: GetCreatorsByHandleWishesParamsDto, @Query() q: GetCreatorsByHandleWishesQueryDto, @Res({ passthrough: true }) res: Response) {
    return publicRead(res, await this.creators.wishes(params.handle, q));
  }

  private async viewer(auth: string | undefined): Promise<string | null> {
    const m = /^Bearer\s+(\S+)$/i.exec(auth ?? "");
    if (!m) return null;
    const p = await this.tokens.verify(m[1]);
    return p?.kind === "user" ? p.accountId : null;
  }
}
