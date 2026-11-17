import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  DeleteBusinessShootsByIdParamsDto,
  GetBusinessRevealLinksByIdParamsDto,
  GetBusinessShootsByIdParamsDto,
  GetBusinessShootsQueryDto,
  PostBusinessClientWishesByIdSendRevealBodyDto,
  PostBusinessClientWishesByIdSendRevealParamsDto,
  PostBusinessRevealLinksByIdCopyLinkBodyDto,
  PostBusinessRevealsBodyDto,
  PostBusinessRevealLinksByIdCopyLinkParamsDto,
  PostBusinessRevealLinksByIdDownloadsBodyDto,
  PostBusinessRevealLinksByIdDownloadsParamsDto,
  PostBusinessShootsBodyDto,
  PostBusinessShootsByIdFilesBodyDto,
  PostBusinessShootsByIdFilesParamsDto,
  PostBusinessShootsByIdFinalsBodyDto,
  PostBusinessShootsByIdFinalsParamsDto,
} from "../../contracts";
import type { PostBusinessClientWishesByIdSendRevealResponse, PostBusinessRevealsResponse, RevealLink, Shoot, ShootFilesAdded, VaultStorage } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { DEFAULT_LIMIT, Page } from "../../common/pagination/cursor";
import { BusinessHeader, ProAccess } from "../pro-business/pro-access";
import { RevealsService } from "./reveals.service";
import { ShootsService } from "./shoots.service";
import { VaultSpaceService } from "./vault-space.service";

/**
 * The Vault, business side (B18): shoots E-167 to E-172, reveal links E-152 and E-153, the space E-215 and sending a reveal E-33.
 * The business is the caller's own, or the one named by x-business-id when they hold a live login there (the same guard as B17):
 * a shoot, a link or a wish of another business is 404. Registry auth is business; like B17 it also takes a person who is a login.
 */
@Controller("business")
export class VaultController {
  constructor(
    private readonly access: ProAccess,
    private readonly shoots: ShootsService,
    private readonly reveals: RevealsService,
    private readonly space: VaultSpaceService,
  ) {}

  @Roles("person", "business")
  @Get("shoots")
  async list(@Query() q: GetBusinessShootsQueryDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Page<Shoot>> {
    return this.shoots.list((await this.access.require(p, h)).businessId, q.cursor, q.limit ?? DEFAULT_LIMIT);
  }

  @Roles("person", "business")
  @Post("shoots")
  async create(@Body() body: PostBusinessShootsBodyDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Shoot> {
    return this.shoots.create((await this.access.require(p, h)).businessId, body);
  }

  @Roles("person", "business")
  @Get("shoots/:id")
  async one(@Param() params: GetBusinessShootsByIdParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<Shoot> {
    return this.shoots.get((await this.access.require(p, h)).businessId, params.id);
  }

  @Roles("person", "business")
  @Delete("shoots/:id")
  @HttpCode(204)
  async remove(@Param() params: DeleteBusinessShootsByIdParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<void> {
    await this.shoots.remove((await this.access.require(p, h)).businessId, params.id);
  }

  @Roles("person", "business")
  @Post("shoots/:id/files")
  async addProofs(
    @Param() params: PostBusinessShootsByIdFilesParamsDto,
    @Body() body: PostBusinessShootsByIdFilesBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<ShootFilesAdded> {
    return this.shoots.add((await this.access.require(p, h)).businessId, params.id, "proofs", body);
  }

  @Roles("person", "business")
  @Post("shoots/:id/finals")
  async addFinals(
    @Param() params: PostBusinessShootsByIdFinalsParamsDto,
    @Body() body: PostBusinessShootsByIdFinalsBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<ShootFilesAdded> {
    return this.shoots.add((await this.access.require(p, h)).businessId, params.id, "finals", body);
  }

  @Roles("person", "business")
  @Get("vault/space")
  async spaceOf(@CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<VaultStorage> {
    return this.space.view((await this.access.require(p, h)).businessId);
  }

  @Roles("person", "business")
  @Get("reveal-links/:id")
  async link(@Param() params: GetBusinessRevealLinksByIdParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<RevealLink> {
    return this.reveals.get((await this.access.require(p, h)).businessId, params.id);
  }

  /** E-153: `:id` is the shoot; the body says which of its sets. Answers the link as a JSON string. */
  @Roles("person", "business")
  @Post("reveal-links/:id/copy-link")
  @HttpCode(200)
  @Header("Content-Type", "application/json; charset=utf-8")
  async copy(
    @Param() params: PostBusinessRevealLinksByIdCopyLinkParamsDto,
    @Body() body: PostBusinessRevealLinksByIdCopyLinkBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<string> {
    return JSON.stringify(await this.reveals.copyLink((await this.access.require(p, h)).businessId, params.id, body.set));
  }

  /** Switch a link off at once (a route the registry does not list yet: reported in the hand-back). */
  @Roles("person", "business")
  @Post("reveal-links/:id/off")
  @HttpCode(200)
  async off(@Param() params: GetBusinessRevealLinksByIdParamsDto, @CurrentPrincipal() p: Principal | undefined, @BusinessHeader() h: string | undefined): Promise<RevealLink> {
    return this.reveals.off((await this.access.require(p, h)).businessId, params.id);
  }

  /** E-275 (IB2): the link's download addresses on or off. */
  @Roles("person", "business")
  @Post("reveal-links/:id/downloads")
  @HttpCode(200)
  async downloads(
    @Param() params: PostBusinessRevealLinksByIdDownloadsParamsDto,
    @Body() body: PostBusinessRevealLinksByIdDownloadsBodyDto,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<RevealLink> {
    return this.reveals.setDownloads((await this.access.require(p, h)).businessId, params.id, body.on);
  }

  /** E-33. */
  @Roles("person", "business")
  @Post("client-wishes/:id/send-reveal")
  @HttpCode(200)
  async sendReveal(
    @Param() params: PostBusinessClientWishesByIdSendRevealParamsDto,
    @Body() body: PostBusinessClientWishesByIdSendRevealBodyDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<PostBusinessClientWishesByIdSendRevealResponse> {
    return this.reveals.send((await this.access.require(p, h)).businessId, params.id, body, key);
  }

  /** E-272 (IA1): the client wish and the reveal in one call. */
  @Roles("person", "business")
  @Post("reveals")
  @HttpCode(200)
  async sendOne(
    @Body() body: PostBusinessRevealsBodyDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentPrincipal() p: Principal | undefined,
    @BusinessHeader() h: string | undefined,
  ): Promise<PostBusinessRevealsResponse> {
    const c = await this.access.require(p, h);
    return this.reveals.sendOne({ accountId: c.accountId, businessId: c.businessId }, body, key);
  }
}
