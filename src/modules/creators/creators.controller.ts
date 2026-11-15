import { Controller, Get, Headers, Query } from "@nestjs/common";
import { GetCreatorsQueryDto } from "../../contracts";
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

  private async viewer(auth: string | undefined): Promise<string | null> {
    const m = /^Bearer\s+(\S+)$/i.exec(auth ?? "");
    if (!m) return null;
    const p = await this.tokens.verify(m[1]);
    return p?.kind === "user" ? p.accountId : null;
  }
}
