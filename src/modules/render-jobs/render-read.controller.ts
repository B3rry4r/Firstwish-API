import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../../common/auth/decorators";
import { withRetryAfter } from "../../common/errors/rate-limited";
import { GetRenderByTokenWishParamsDto } from "../../contracts";
import type { GetRenderByTokenWishResponse } from "../../contracts";
import { RenderReadService } from "./render-read.service";

/** R3: the render page's one read of its wish. No session: the one-use token in the address is the only key. Never cached. */
@Controller("render/:token/wish")
export class RenderReadController {
  constructor(private readonly reads: RenderReadService) {}

  @Public()
  @Get()
  async read(@Param() p: GetRenderByTokenWishParamsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<GetRenderByTokenWishResponse> {
    res.setHeader("Cache-Control", "no-store");
    return this.reads.read(p.token, req.ip ?? null).catch((e: unknown) => withRetryAfter(res, e));
  }
}
