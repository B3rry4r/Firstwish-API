import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import type { QrCard } from "../../contracts";
import { accountOf } from "../people/business-of";
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

  @Roles("person", "creator", "business")
  @Post()
  @HttpCode(200)
  make(@Body() body: MakeQrCardBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<QrCard> {
    return this.cards.make(accountOf(p), body);
  }
}
