// Request validation for reaction endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsIn, IsString } from "class-validator";
import type { DeleteFeedWishesByIdReactionBody, DeleteFeedWishesByIdReactionParams, PutFeedWishesByIdReactionBody, PutFeedWishesByIdReactionParams } from "../types";

/** E-142 DELETE /v1/feed/wishes/:id/reaction (body). */
export class DeleteFeedWishesByIdReactionBodyDto implements DeleteFeedWishesByIdReactionBody {
  @IsString()
  wish!: string;
}
export class DeleteFeedWishesByIdReactionParamsDto implements DeleteFeedWishesByIdReactionParams {
  @IsString()
  id!: string;
}

/** E-143 PUT /v1/feed/wishes/:id/reaction (body). */
export class PutFeedWishesByIdReactionBodyDto implements PutFeedWishesByIdReactionBody {
  @IsIn(["love", "joy", "clap", "wow"])
  reaction!: "love" | "joy" | "clap" | "wow";
  @IsString()
  wish!: string;
}
export class PutFeedWishesByIdReactionParamsDto implements PutFeedWishesByIdReactionParams {
  @IsString()
  id!: string;
}
