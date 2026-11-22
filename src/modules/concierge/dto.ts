import { CursorQueryDto } from "../../common/pagination/cursor";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { IsDateOnly, MinTrimmed } from "../../common/validation/decorators";

/** E-40. `rush` is accepted only as false: Concierge rush is not sold (Z2). */
export class PlaceOrderBodyDto {
  @IsString()
  @MinTrimmed(1)
  @MaxLength(2000)
  brief!: string;
  @IsInt()
  @Min(1)
  @Max(1000)
  count!: number;
  @IsString()
  @IsIn(["single", "list"])
  kind!: string;
  @IsOptional()
  @IsBoolean()
  rush?: boolean;
}

/** E-34. The registry body names `reason` only; the wishes made are named here (a delivery with none is refused). */
export class DeliverBodyDto {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  wishIds?: string[];
}

/** E-273 (HZ2): "make the wish": the kind, the occasion and who it is for; the maker writes the rest through the wish routes. */
export class MakeWishBodyDto {
  @IsString()
  @MinTrimmed(4)
  reason!: string;
  @IsString()
  @MaxLength(40)
  kind!: string;
  @IsString()
  @MaxLength(60)
  occasion!: string;
  @IsString()
  @MinTrimmed(1)
  @MaxLength(120)
  name!: string;
}

export class IdParamDto {
  @IsString()
  id!: string;
}

/** The staff or customer cancel: staff say why (4 or more characters); the customer's own cancel takes none. */
export class CancelBodyDto {
  @IsOptional()
  @IsString()
  @MinTrimmed(4)
  reason?: string;
}


/** E-37 (HY2): the staff list takes a search word beside the cursor and limit. */
export class StaffOrdersQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** E-36: the window is two calendar dates (A17). */
export class DueQueryDto extends CursorQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsDateOnly()
  from?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsDateOnly()
  to?: string;
}
