import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { CursorQueryDto } from "../../common/pagination/cursor";
import { PERIODS } from "./numbers.service";

/** E-1 with `q`: a name, an email or an account id. */
export class AdminPeopleQueryDto extends CursorQueryDto {
  @IsOptional() @IsString() @MaxLength(254) q?: string;
}

/** E-218 with `q` (a wish number, a link or the sender's email) and `state`. */
export class AdminWishesQueryDto extends CursorQueryDto {
  @IsOptional() @IsString() @MaxLength(254) q?: string;
  @IsOptional() @IsString() @MaxLength(16) state?: string;
}

/** E-61 with `status` and `type`. */
export class AdminJobsQueryDto extends CursorQueryDto {
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional() @IsString() @MaxLength(48) type?: string;
}

/** E-79 with the period (month by default). */
export class AdminNumbersQueryDto {
  @IsOptional() @IsIn([...PERIODS]) period?: (typeof PERIODS)[number];
}

/** E-82 with the day to show, YYYY-MM-DD (today by default). */
export class AdminOverviewQueryDto {
  @IsOptional() @IsString() @MaxLength(10) day?: string;
}
