// Request validation for reveal-link endpoints. Kept by hand with each registry reopen (the generator is retired; scripts/check-contracts.mjs guards it).
import { IsBoolean, IsIn, IsString } from "class-validator";
import type { GetBusinessRevealLinksByIdParams, PostBusinessRevealLinksByIdCopyLinkBody, PostBusinessRevealLinksByIdCopyLinkParams, PostBusinessRevealLinksByIdDownloadsBody, PostBusinessRevealLinksByIdDownloadsParams, PostBusinessRevealLinksByIdOffParams } from "../types";

/** E-152 GET /v1/business/reveal-links/:id (query). */
export class GetBusinessRevealLinksByIdQueryDto {}
export class GetBusinessRevealLinksByIdParamsDto implements GetBusinessRevealLinksByIdParams {
  @IsString()
  id!: string;
}

/** E-153 POST /v1/business/reveal-links/:id/copy-link (body). */
export class PostBusinessRevealLinksByIdCopyLinkBodyDto implements PostBusinessRevealLinksByIdCopyLinkBody {
  @IsIn(["proofs", "finals"])
  set!: "proofs" | "finals";
}
export class PostBusinessRevealLinksByIdCopyLinkParamsDto implements PostBusinessRevealLinksByIdCopyLinkParams {
  @IsString()
  id!: string;
}

/** E-247 POST /v1/business/reveal-links/:id/off (body). */
export class PostBusinessRevealLinksByIdOffBodyDto {}
export class PostBusinessRevealLinksByIdOffParamsDto implements PostBusinessRevealLinksByIdOffParams {
  @IsString()
  id!: string;
}

/** E-274 POST /v1/business/reveal-links/:id/downloads (body). */
export class PostBusinessRevealLinksByIdDownloadsBodyDto implements PostBusinessRevealLinksByIdDownloadsBody {
  @IsBoolean()
  on!: boolean;
}
export class PostBusinessRevealLinksByIdDownloadsParamsDto implements PostBusinessRevealLinksByIdDownloadsParams {
  @IsString()
  id!: string;
}
