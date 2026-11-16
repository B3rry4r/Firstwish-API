import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import type { Page } from "../../common/pagination/cursor";
import {
  DeleteStudioStylesByIdParamsDto,
  GetStudioMeQueryDto,
  GetStudioPrefsQueryDto,
  GetStudioStylesByIdParamsDto,
  GetStudioStylesByIdQueryDto,
  GetStudioStylesQueryDto,
  PatchStudioMeBodyDto,
  PatchStudioStylesByIdBodyDto,
  PatchStudioStylesByIdParamsDto,
  PostStudioStylesBodyDto,
  PostStudioStylesByIdSubmissionsBodyDto,
  PostStudioStylesByIdSubmissionsParamsDto,
  PostStudioStylesByIdWithdrawParamsDto,
  type CreatorState,
  type StudioPrefs,
  type StudioStyle,
} from "../../contracts";
import { accountOf } from "../people/business-of";
import { CreatorStateService } from "./creator-state.service";
import { PatchStudioPrefsLocalBodyDto, PostStudioStylesWithdrawLocalBodyDto } from "./studio-bodies";
import { StudioPrefsService } from "./studio-prefs.service";
import { StudioStylesService } from "./studio-styles.service";
import { SubmissionsService } from "./submissions.service";

type Wire = StudioStyle & { version: number };

/** The creator's Studio: their state (E-43, E-44), settings (E-185, E-186) and style drafts (E-187 to E-192, E-202). */
@Controller("studio")
export class StudioController {
  constructor(
    private readonly state: CreatorStateService,
    private readonly prefs: StudioPrefsService,
    private readonly styles: StudioStylesService,
    private readonly submissions: SubmissionsService,
  ) {}

  /** E-43 */
  @Roles("creator")
  @Get("me")
  me(@Query() _q: GetStudioMeQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<CreatorState> {
    return this.state.read(accountOf(p));
  }

  /** E-44 */
  @Roles("creator")
  @Patch("me")
  setMe(@Body() body: PatchStudioMeBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<CreatorState> {
    return this.state.setOn(accountOf(p), body.on);
  }

  /** E-185 */
  @Roles("creator")
  @Get("prefs")
  getPrefs(@Query() _q: GetStudioPrefsQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<StudioPrefs> {
    return this.prefs.read(accountOf(p));
  }

  /** E-186 */
  @Roles("creator")
  @Patch("prefs")
  patchPrefs(@Body() body: PatchStudioPrefsLocalBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<StudioPrefs> {
    return this.prefs.patch(accountOf(p), { ...body });
  }

  /** E-187 (registry auth: business or creator) */
  @Roles("business", "creator")
  @Get("styles")
  list(@Query() q: GetStudioStylesQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Page<Wire>> {
    return this.styles.list(accountOf(p), q);
  }

  /** E-188 */
  @Roles("creator")
  @Post("styles")
  create(@Body() body: PostStudioStylesBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<Wire> {
    return this.styles.create(accountOf(p), body);
  }

  /** E-190 */
  @Roles("creator")
  @Get("styles/:id")
  one(@Param() params: GetStudioStylesByIdParamsDto, @Query() _q: GetStudioStylesByIdQueryDto, @CurrentPrincipal() p: Principal | undefined): Promise<Wire> {
    return this.styles.one(accountOf(p), params.id);
  }

  /** E-191 */
  @Roles("creator")
  @Patch("styles/:id")
  save(@Param() params: PatchStudioStylesByIdParamsDto, @Body() body: PatchStudioStylesByIdBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<Wire> {
    return this.styles.save(accountOf(p), params.id, body);
  }

  /** E-189 */
  @Roles("creator")
  @Delete("styles/:id")
  @HttpCode(200)
  @Header("Content-Type", "application/json; charset=utf-8")
  remove(@Param() params: DeleteStudioStylesByIdParamsDto, @CurrentPrincipal() p: Principal | undefined): Promise<true> {
    return this.styles.remove(accountOf(p), params.id);
  }

  /** E-192 */
  @Roles("creator")
  @Post("styles/:id/withdraw")
  @HttpCode(200)
  withdraw(@Param() params: PostStudioStylesByIdWithdrawParamsDto, @Body() body: PostStudioStylesWithdrawLocalBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<unknown> {
    return this.styles.withdraw(accountOf(p), params.id, body);
  }

  /** E-202 */
  @Roles("creator")
  @Post("styles/:id/submissions")
  submit(@Param() params: PostStudioStylesByIdSubmissionsParamsDto, @Body() body: PostStudioStylesByIdSubmissionsBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<unknown> {
    return this.submissions.submit(accountOf(p), params.id, body);
  }
}
