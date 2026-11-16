import { Allow, IsBoolean, IsOptional } from "class-validator";

/**
 * E-186's body. The contracts package types it as an empty object (the registry says "any of coached, bottom, span, looks, recent,
 * fav, addTab"), which the global whitelist would refuse key by key. The service checks each key and names a bad one (422).
 */
export class PatchStudioPrefsLocalBodyDto {
  @IsOptional() @Allow() coached?: unknown;
  @IsOptional() @Allow() bottom?: unknown;
  @IsOptional() @Allow() span?: unknown;
  @IsOptional() @Allow() looks?: unknown;
  @IsOptional() @Allow() recent?: unknown;
  @IsOptional() @Allow() fav?: unknown;
  @IsOptional() @Allow() addTab?: unknown;
}

/** E-192's body: `on` is in the registry ("on (setTemplate only)") but not in the contracts package's empty body type. */
export class PostStudioStylesWithdrawLocalBodyDto {
  @IsOptional() @IsBoolean() on?: boolean;
}
