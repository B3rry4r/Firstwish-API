import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentPrincipal, UserOrStaff } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
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
  constructor(private readonly cards: QrCardsService) {}

  /**
   * E-141. Registry auth: business, a signed-in user, or staff maker. One route takes a user or a staff member (CB4): the guard
   * checks the token (no token or a bad one is 401) and the side or role (403). A user makes cards of their own wishes; a maker (or
   * the owner) of the wishes of an order given to them.
   */
  @UserOrStaff({ sides: ["person", "creator", "business"], roles: ["owner", "maker"] })
  @Post()
  @HttpCode(200)
  async make(@Body() body: MakeQrCardBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<QrCard> {
    if (!p) throw AppError.unauthorized();
    if (p.kind === "user") return this.cards.make(p.accountId, body);
    return this.cards.makeForOrder({ staffId: p.staffId, all: p.roles.includes("owner") }, body);
  }
}
