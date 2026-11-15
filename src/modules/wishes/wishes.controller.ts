import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  DeleteWishesByIdBodyDto, DeleteWishesByIdParamsDto, GetWishesByIdLinkParamsDto, GetWishesByIdParamsDto, GetWishesQueryDto,
  PatchWishesByIdParamsDto, PostWishesBodyDto, PostWishesByIdEraseParamsDto, PostWishesByIdRestoreParamsDto, PostWishesByIdSealParamsDto,
} from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { accountOf } from "../people/business-of";
import { PatchWishBodyDto, SealWishBodyDto } from "./dto";
import { WishesService } from "./wishes.service";

/**
 * The owner's wish (registry auth: signed in, any side). E-221 list, E-222 start a draft, E-224 detail, E-225 save parts of it,
 * E-229 its link, E-231 seal, E-223 remove, E-227 erase now, E-230 bring back. A receiver never reads these (B10's /v1/w/:slug).
 */
@Controller("wishes")
export class WishesController {
  constructor(private readonly wishes: WishesService) {}

  @Roles("person", "creator", "business")
  @Get()
  list(@Query() q: GetWishesQueryDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.list(accountOf(p), q);
  }

  @Roles("person", "creator", "business")
  @Post()
  create(@Body() body: PostWishesBodyDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.create(accountOf(p), body);
  }

  @Roles("person", "creator", "business")
  @Get(":id")
  detail(@Param() params: GetWishesByIdParamsDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.get(accountOf(p), params.id);
  }

  /** 204; the new version is in the ETag header (the page sends it back as `version` on its next save). */
  @Roles("person", "creator", "business")
  @Patch(":id")
  @HttpCode(204)
  async patch(
    @Param() params: PatchWishesByIdParamsDto,
    @Body() body: PatchWishBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const version = await this.wishes.patch(accountOf(p), params.id, body);
    res.setHeader("ETag", `"${version}"`);
  }

  @Roles("person", "creator", "business")
  @Delete(":id")
  remove(@Param() params: DeleteWishesByIdParamsDto, @Body() _body: DeleteWishesByIdBodyDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.remove(accountOf(p), params.id);
  }

  @Roles("person", "creator", "business")
  @Get(":id/link")
  link(@Param() params: GetWishesByIdLinkParamsDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.link(accountOf(p), params.id);
  }

  @Roles("person", "creator", "business")
  @Post(":id/seal")
  @HttpCode(200)
  seal(@Param() params: PostWishesByIdSealParamsDto, @Body() body: SealWishBodyDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.seal(accountOf(p), params.id, body);
  }

  @Roles("person", "creator", "business")
  @Post(":id/erase")
  @HttpCode(204)
  async erase(@Param() params: PostWishesByIdEraseParamsDto, @CurrentPrincipal() p: Principal | undefined): Promise<void> {
    await this.wishes.erase(accountOf(p), params.id);
  }

  @Roles("person", "creator", "business")
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param() params: PostWishesByIdRestoreParamsDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.restore(accountOf(p), params.id);
  }
}
