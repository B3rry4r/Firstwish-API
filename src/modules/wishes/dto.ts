import { IsOptional, IsString, MaxLength } from "class-validator";
import { PatchWishesByIdBodyDto } from "../../contracts";

/** The contract's body without its passcode, which the draft takes as a text or as null (null takes the passcode off). */
type WithoutPasscode = new () => Omit<PatchWishesByIdBodyDto, "passcode">;

/**
 * E-225's body is the contract's (GG7, DEC-178: `content` and the named fields only, plus the write-only passcode, hashed on the
 * server and never returned). The one thing the contract's text type cannot say is null: a passcode of null clears it. The 4 to 64 characters are counted after the outer spaces are cut (IK2a), by the service; this cap only bounds the body.
 */
export class SaveWishBodyDto extends (PatchWishesByIdBodyDto as unknown as WithoutPasscode) {
  @IsOptional() @IsString() @MaxLength(200) passcode?: string | null;
}
