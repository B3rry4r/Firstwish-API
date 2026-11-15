import { Body, Controller, Delete, Param, Put } from "@nestjs/common";
import {
  DeleteFeedWishesByIdSaveBodyDto,
  DeleteFeedWishesByIdSaveParamsDto,
  PutFeedWishesByIdSaveBodyDto,
  PutFeedWishesByIdSaveParamsDto,
} from "../../contracts";
import type { SaveResponse } from "../../contracts";
import { CurrentPrincipal, Roles } from "../../common/auth/decorators";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";
import { accountOf } from "../people/business-of";
import { SavedWishesService } from "./saved-wishes.service";

/** The wish in the address is the one saved; a body naming another wish is refused. */
function sameWish(id: string, wish: string): string {
  if (wish.trim() !== id) throw AppError.validation({ wish: "Must be the wish in the address." });
  return id;
}

/** E-155, E-156 save and unsave a feed wish (registry auth: signed in, any side). */
@Controller("feed/wishes/:id/save")
export class SavedWishesController {
  constructor(private readonly saved: SavedWishesService) {}

  @Roles("person", "creator", "business")
  @Put()
  save(@Param() params: PutFeedWishesByIdSaveParamsDto, @Body() body: PutFeedWishesByIdSaveBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<SaveResponse> {
    return this.saved.save(accountOf(p), sameWish(params.id, body.wish));
  }

  @Roles("person", "creator", "business")
  @Delete()
  unsave(@Param() params: DeleteFeedWishesByIdSaveParamsDto, @Body() body: DeleteFeedWishesByIdSaveBodyDto, @CurrentPrincipal() p: Principal | undefined): Promise<SaveResponse> {
    return this.saved.unsave(accountOf(p), sameWish(params.id, body.wish));
  }
}
