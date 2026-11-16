import { CursorQueryDto } from "../../common/pagination/cursor";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { IsDateOnly, MinTrimmed } from "../../common/validation/decorators";

/** E-40. `rush` is accepted only as false: Concierge rush is not sold (Z2). */
export class PlaceOrderBodyDto {
  @IsString()
  @MinTrimmed(1)
  @MaxLength(2000)
  brief!: string;
  @Type(() => Number)
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
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  wishIds!: string[];
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
