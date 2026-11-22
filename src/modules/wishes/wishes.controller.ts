import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  DeleteWishesByIdBodyDto, DeleteWishesByIdParamsDto, GetWishesByIdLinkParamsDto, GetWishesByIdParamsDto, GetWishesQueryDto,
  PatchWishesByIdParamsDto, PostWishesBodyDto, PostWishesByIdAddPhotosBodyDto, PostWishesByIdAddPhotosParamsDto,
  PostWishesByIdEraseParamsDto, PostWishesByIdPassUpgradeParamsDto, PostWishesByIdRestoreParamsDto, PostWishesByIdSealBodyDto, PostWishesByIdSealParamsDto,
} from "../../contracts";
import type { PostWishesByIdSealResponse, Wish, WishSaved } from "../../contracts";
import { CurrentPrincipal, Roles, UserOrStaff } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { accountOf } from "../people/business-of";
import { SaveWishBodyDto } from "./dto";
import { BusinessHeader } from "../pro-business/pro-access";
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
  @HttpCode(201)
  /** 201 for a new draft; 200 when the start answers a draft already made (the same Idempotency-Key, or the person's untouched draft: HM3). */
  async create(@Body() body: PostWishesBodyDto, @CurrentPrincipal() p: Principal | undefined, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    const r = await this.wishes.create(accountOf(p), body, key?.trim() || undefined);
    res.status(r.fresh ? 201 : 200);
    return r.wish;
  }

  /** HZ2: a maker (or the owner) reads a wish made in the buyer's name while the order is with them. */
  @UserOrStaff({ sides: ["person", "creator", "business"], roles: ["maker"] })
  @Get(":id")
  async detail(@Param() params: GetWishesByIdParamsDto, @CurrentPrincipal() p: Principal | undefined) {
    const who = await this.wishes.actingAccount(p, params.id);
    return this.wishes.get(who.accountId, params.id, who.viaOrder);
  }

  /** 200 {version, updatedAt}: the page always holds the version to send with its next save (CC1). */
  @UserOrStaff({ sides: ["person", "creator", "business"], roles: ["maker"] })
  @Patch(":id")
  async patch(@Param() params: PatchWishesByIdParamsDto, @Body() body: SaveWishBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<WishSaved> {
    const who = await this.wishes.actingAccount(p, params.id);
    return this.wishes.patch(who.accountId, params.id, {
      version: body.version, kind: body.kind, occasion: body.occasion, name: body.name, style: body.style, content: body.content,
      makerNote: body.makerNote, opensAt: body.opensAt, timeZone: body.timeZone, keep: body.keep, step: body.step, passcode: body.passcode,
    }, who.viaOrder);
  }

  /** E-226: add confirmed photo files to a draft. */
  @UserOrStaff({ sides: ["person", "creator", "business"], roles: ["maker"] })
  @Post(":id/add-photos")
  @HttpCode(200)
  async addPhotos(@Param() params: PostWishesByIdAddPhotosParamsDto, @Body() body: PostWishesByIdAddPhotosBodyDto, @CurrentPrincipal() p: Principal | undefined) {
    const who = await this.wishes.actingAccount(p, params.id);
    return this.wishes.addPhotos(who.accountId, params.id, body.files, who.viaOrder);
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

  @UserOrStaff({ sides: ["person", "creator", "business"], roles: ["maker"] })
  @Post(":id/seal")
  @HttpCode(200)
  /** E-231 (VV1): answers {payment, item} as E-228 does. No money moves here (the ticket was paid, or the Pass pays), so `payment` is null. A maker seals a wish made in the buyer's name on the order's own payment (HZ2). */
  async seal(@Param() params: PostWishesByIdSealParamsDto, @Body() body: PostWishesByIdSealBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<PostWishesByIdSealResponse> {
    const who = await this.wishes.actingAccount(p, params.id);
    if (who.viaOrder && (body.usePass || body.usePlan)) throw AppError.validation({ usePass: "A wish made on an order is paid by the order." });
    const item = (await this.wishes.seal(who.accountId, params.id, { version: body.version, opensAt: body.opensAt, openNow: body.openNow, timeZone: body.timeZone, usePass: body.usePass, usePlan: body.usePlan, businessHeader: h }, who.viaOrder)) as unknown as Wish;
    return { payment: null, item };
  }

  /** E-241 (GG3): a draft becomes a Signature wish by drawing one Pass upgrade. */
  @Roles("person", "creator", "business")
  @Post(":id/pass-upgrade")
  @HttpCode(200)
  passUpgrade(@Param() params: PostWishesByIdPassUpgradeParamsDto, @CurrentPrincipal() p: Principal | undefined) {
    return this.wishes.passUpgrade(accountOf(p), params.id);
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
