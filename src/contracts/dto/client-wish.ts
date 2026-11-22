// Request validation for client-wish endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { Allow, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsDateOnly } from "../../common/validation/decorators";
import type { GetBusinessClientWishesByIdParams, GetBusinessClientWishesQuery, PostBusinessClientWishesBody, PostBusinessClientWishesByIdApproveDateBody, PostBusinessClientWishesByIdApproveDateParams, PostBusinessClientWishesByIdSendRevealBody, PostBusinessClientWishesByIdSendRevealParams, PostBusinessRevealsBody, DateOnly } from "../types";

/** E-29 GET /v1/business/client-wishes (query). */
export class GetBusinessClientWishesQueryDto implements GetBusinessClientWishesQuery {
  @IsOptional()
  @IsString()
  cursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** E-30 POST /v1/business/client-wishes (body). */
export class PostBusinessClientWishesBodyDto implements PostBusinessClientWishesBody {
  @IsString()
  client!: string;
  @IsDateOnly()
  day!: DateOnly;
  @IsString()
  kind!: string;
  @IsString()
  occasion!: string;
  @IsOptional()
  @IsArray()
  reveal?: unknown[];
}

/** E-31 GET /v1/business/client-wishes/:id (query). */
export class GetBusinessClientWishesByIdQueryDto {}
export class GetBusinessClientWishesByIdParamsDto implements GetBusinessClientWishesByIdParams {
  @IsString()
  id!: string;
}

/** E-32 POST /v1/business/client-wishes/:id/approve-date (body). */
export class PostBusinessClientWishesByIdApproveDateBodyDto implements PostBusinessClientWishesByIdApproveDateBody {
  @IsString()
  client!: string;
  @IsDateOnly()
  day!: DateOnly;
  @IsString()
  key!: string;
  @IsIn(["teams"])
  kind!: "teams";
  @Allow()
  occasion!: unknown;
}
export class PostBusinessClientWishesByIdApproveDateParamsDto implements PostBusinessClientWishesByIdApproveDateParams {
  @IsString()
  id!: string;
}

/** E-33 POST /v1/business/client-wishes/:id/send-reveal (body). */
export class PostBusinessClientWishesByIdSendRevealBodyDto implements PostBusinessClientWishesByIdSendRevealBody {
  @IsObject()
  reveal!: Record<string, unknown>;
  @IsIn(["proofs", "finals"])
  set!: "proofs" | "finals";
  @IsString()
  shoot!: string;
  @IsOptional()
  @IsArray()
  files?: string[];
  @IsOptional()
  @IsBoolean()
  again?: boolean;
}
export class PostBusinessClientWishesByIdSendRevealParamsDto implements PostBusinessClientWishesByIdSendRevealParams {
  @IsString()
  id!: string;
}

/** E-272 POST /v1/business/reveals (body). */
export class PostBusinessRevealsBodyDto implements PostBusinessRevealsBody {
  @IsObject()
  reveal!: Record<string, unknown>;
  @IsIn(["proofs", "finals"])
  set!: "proofs" | "finals";
  @IsString()
  shoot!: string;
  @IsOptional()
  @IsArray()
  files?: string[];
  @IsOptional()
  @IsString()
  @MaxLength(80)
  client?: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;
  @IsOptional()
  @IsString()
  @MaxLength(60)
  occasion?: string;
  @IsOptional()
  @IsDateOnly()
  day?: DateOnly;
  @IsOptional()
  @IsBoolean()
  again?: boolean;
}
