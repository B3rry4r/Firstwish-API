import { IsOptional, IsString, MaxLength } from "class-validator";
import { PatchWishesByIdBodyDto } from "../../contracts";

/**
 * E-225's body is the contract's (version, timeZone, the keep enum). The contract names no field for the wish passcode, which the
 * draft saves hashed (Q8), so it is the one addition: a gap in the registry, listed in the hand-back.
 */
export class SaveWishBodyDto extends PatchWishesByIdBodyDto {
  @IsOptional() @IsString() @MaxLength(80) passcode?: string | null;
}
