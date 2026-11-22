// Request validation for share endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { PostFeedWishesByIdSharesBody, PostFeedWishesByIdSharesParams } from "../types";

/** E-166 POST /v1/feed/wishes/:id/shares (body). */
export class PostFeedWishesByIdSharesBodyDto implements PostFeedWishesByIdSharesBody {
  @IsString()
  style!: string;
  @IsString()
  wish!: string;
}
export class PostFeedWishesByIdSharesParamsDto implements PostFeedWishesByIdSharesParams {
  @IsString()
  id!: string;
}
