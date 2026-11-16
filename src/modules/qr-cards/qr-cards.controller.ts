import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import { Public } from "../../common/auth/decorators";
import { AccessTokenVerifier } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import type { QrCard } from "../../contracts";
import { QrCardsService } from "./qr-cards.service";

/** E-141. The registry lists wishId, wishIds and names; a card needs one of the two ids, so each is optional here. */
export class MakeQrCardBodyDto {
  @IsOptional()
  @IsString()
  wishId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  wishIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  names?: string[];
}

@Controller("qr-cards")
export class QrCardsController {
  constructor(
    private readonly cards: QrCardsService,
    private readonly tokens: AccessTokenVerifier,
  ) {}

  /**
   * E-141. Registry auth: business, a signed-in user, or staff maker. One access mark cannot name both a user and a staff caller,
   * so the route is marked public and decides here from the bearer token (no token or a bad one is 401; every other caller is 403).
   * A user makes cards of their own wishes; a maker (or the owner) of the wishes of an order given to them.
   */
  @Public()
  @Post()
  @HttpCode(200)
  async make(@Body() body: MakeQrCardBodyDto, @Headers("authorization") auth: string | undefined): Promise<QrCard> {
    const m = /^Bearer\s+(\S+)$/i.exec(auth ?? "");
    const p = m ? await this.tokens.verify(m[1]) : null;
    if (!p) throw AppError.unauthorized();
    if (p.kind === "user") {
      if (!p.sides.some((x) => x === "person" || x === "creator" || x === "business")) throw AppError.forbidden();
      return this.cards.make(p.accountId, body);
    }
    if (!p.roles.includes("owner") && !p.roles.includes("maker")) throw AppError.forbidden();
    return this.cards.makeForOrder({ staffId: p.staffId, all: p.roles.includes("owner") }, body);
  }
}
