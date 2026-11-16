import { createHash } from "node:crypto";
import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Roles } from "../../common/auth/decorators";
import { CursorQueryDto, type Page } from "../../common/pagination/cursor";
import type { ChapterSpec, EndingPurpose, Moment, OpeningDef } from "../../contracts";
import { ReferenceDataService } from "./reference-data.service";

/** The body's ETag, as the price book makes it; Express answers 304 when If-None-Match matches (the body is then not sent). */
function tag<T>(res: Response, body: Page<T>): Page<T> {
  res.setHeader("ETag", `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 32)}"`);
  res.setHeader("Cache-Control", "private, max-age=300, must-revalidate");
  return body;
}

/** E-28, E-51, E-74, E-81: reference reads for the maker. */
@Controller()
export class ReferenceDataController {
  constructor(private readonly ref: ReferenceDataService) {}

  /** E-28: signed in */
  @Get("chapter-specs")
  async chapterSpecs(@Res({ passthrough: true }) res: Response): Promise<Page<ChapterSpec>> {
    return tag(res, await this.ref.chapterSpecs());
  }

  /** E-51: business */
  @Roles("business")
  @Get("ending-purposes")
  async endingPurposes(@Res({ passthrough: true }) res: Response): Promise<Page<EndingPurpose>> {
    return tag(res, await this.ref.endingPurposes());
  }

  /** E-74: business, creator or any signed-in user (so: signed in) */
  @Get("moments")
  async moments(@Query() q: CursorQueryDto, @Res({ passthrough: true }) res: Response): Promise<Page<Moment>> {
    return tag(res, await this.ref.moments(q));
  }

  /** E-81: signed in */
  @Get("opening-defs")
  async openingDefs(@Res({ passthrough: true }) res: Response): Promise<Page<OpeningDef>> {
    return tag(res, await this.ref.openingDefs());
  }
}
