import { IsOptional, IsString, MaxLength } from "class-validator";
import { PatchWishesByIdBodyDto } from "../../contracts";

/** The contract's body without its passcode, which the draft takes as a text or as null (null takes the passcode off). */
type WithoutPasscode = new () => Omit<PatchWishesByIdBodyDto, "passcode">;

/**
 * E-225's body is the contract's (GG7, DEC-178: `content` and the named fields only, plus the write-only passcode, hashed on the
 * server and never returned). The one thing the contract's text type cannot say is null: a passcode of null clears it.
 */
export class SaveWishBodyDto extends (PatchWishesByIdBodyDto as unknown as WithoutPasscode) {
  @IsOptional() @IsString() @MaxLength(64) passcode?: string | null;
}
