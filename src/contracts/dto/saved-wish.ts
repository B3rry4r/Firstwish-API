// Request validation for saved-wish endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { DeleteFeedWishesByIdSaveBody, DeleteFeedWishesByIdSaveParams, PutFeedWishesByIdSaveBody, PutFeedWishesByIdSaveParams } from "../types";

/** E-155 DELETE /v1/feed/wishes/:id/save (body). */
export class DeleteFeedWishesByIdSaveBodyDto implements DeleteFeedWishesByIdSaveBody {
  @IsString()
  wish!: string;
}
export class DeleteFeedWishesByIdSaveParamsDto implements DeleteFeedWishesByIdSaveParams {
  @IsString()
  id!: string;
}

/** E-156 PUT /v1/feed/wishes/:id/save (body). */
export class PutFeedWishesByIdSaveBodyDto implements PutFeedWishesByIdSaveBody {
  @IsString()
  wish!: string;
}
export class PutFeedWishesByIdSaveParamsDto implements PutFeedWishesByIdSaveParams {
  @IsString()
  id!: string;
}
