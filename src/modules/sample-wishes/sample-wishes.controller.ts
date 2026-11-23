import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../../common/auth/decorators";
import { publicRead } from "../../common/http/public-cache";
import { GetSampleWishesByKindByOccasionParamsDto, GetSampleWishesQueryDto, type PaginatedList, type SampleWish } from "../../contracts";
import { SampleWishesService } from "./sample-wishes.service";

/**
 * The designed sample wishes (IJ1, DEC-309): public, read only, the same for everyone, so cached as the other public reads are
 * (revalidated every time, 304 while nothing has moved). The list is declared before the one so a path with no kind is never read as one.
 */
@Controller("sample-wishes")
export class SampleWishesController {
  constructor(private readonly samples: SampleWishesService) {}

  /** E-287 */
  @Public()
  @Get()
  async list(@Query() q: GetSampleWishesQueryDto, @Res({ passthrough: true }) res: Response): Promise<PaginatedList<SampleWish>> {
    return publicRead(res, await this.samples.list(q.kind));
  }

  /** E-288 */
  @Public()
  @Get(":kind/:occasion")
  async one(@Param() p: GetSampleWishesByKindByOccasionParamsDto, @Res({ passthrough: true }) res: Response): Promise<SampleWish> {
    return publicRead(res, await this.samples.one(p.kind, p.occasion));
  }
}
