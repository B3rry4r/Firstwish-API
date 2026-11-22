// Request validation for follow endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsString } from "class-validator";
import type { DeleteCreatorsByHandleFollowParams, PutCreatorsByHandleFollowParams } from "../types";

/** E-57 DELETE /v1/creators/:handle/follow (body). */
export class DeleteCreatorsByHandleFollowBodyDto {}
export class DeleteCreatorsByHandleFollowParamsDto implements DeleteCreatorsByHandleFollowParams {
  @IsString()
  handle!: string;
}

/** E-58 PUT /v1/creators/:handle/follow (body). */
export class PutCreatorsByHandleFollowBodyDto {}
export class PutCreatorsByHandleFollowParamsDto implements PutCreatorsByHandleFollowParams {
  @IsString()
  handle!: string;
}
