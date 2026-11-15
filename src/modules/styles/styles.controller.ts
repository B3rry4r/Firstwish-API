import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { createHash } from "node:crypto";
import { Public } from "../../common/auth/decorators";
import type { Page } from "../../common/pagination/cursor";
import { GetStylesByIdParamsDto, GetStylesLevelsQueryDto, GetStylesQueryDto, type GetStylesLevelsResponse } from "../../contracts";
import type { StyleOut } from "./style-view";
import { StylesService } from "./styles.service";

/** Public style reads. GET /v1/styles/levels is declared before /v1/styles/:id so "levels" is never read as a slug. */
@Controller("styles")
export class StylesController {
  constructor(private readonly styles: StylesService) {}

  /**
   * E-198: cacheable; the ETag is the answer's own hash, so a move or a switch changes it at once. Clients revalidate every
   * time (max-age=0) and get 304 while nothing has moved.
   */
  @Public()
  @Get("levels")
  async levels(@Query() q: GetStylesLevelsQueryDto, @Res({ passthrough: true }) res: Response): Promise<GetStylesLevelsResponse> {
    const page = await this.styles.levels(q);
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("ETag", `"${createHash("sha256").update(JSON.stringify(page)).digest("base64url").slice(0, 32)}"`);
    return page;
  }

  /** E-195 */
  @Public()
  @Get()
  list(@Query() q: GetStylesQueryDto): Promise<Page<StyleOut>> {
    return this.styles.publicList(q);
  }

  /** E-196 */
  @Public()
  @Get(":id")
  one(@Param() p: GetStylesByIdParamsDto): Promise<StyleOut> {
    return this.styles.publicOne(p.id);
  }
}
