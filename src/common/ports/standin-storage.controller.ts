import { Controller, Get, Inject, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import type { StandinStorage } from "./adapters/standins";

export const STANDIN_STORAGE = Symbol("STANDIN_STORAGE");

/**
 * HP3: on a stand-in stack the signed read url the API gives points here, so it really serves the bytes (the stand-in host never
 * resolves). The signature in the url is the credential; with real providers there is no stand-in storage and the route answers 404.
 */
@Controller("standin-storage")
export class StandinStorageController {
  constructor(@Inject(STANDIN_STORAGE) private readonly storage: StandinStorage | null) {}

  @Public()
  @Get(":bucket/*key")
  read(@Param("bucket") bucket: string, @Param("key") key: string | string[], @Query("expires") expires: string, @Query("signature") signature: string, @Res() res: Response): void {
    const k = Array.isArray(key) ? key.join("/") : key;
    const hit = this.storage && bucket === this.storage.bucket ? this.storage.serve(k, Number(expires), String(signature ?? "")) : null;
    if (!hit) throw new NotFoundException();
    res.status(200).setHeader("content-type", hit.contentType).setHeader("cache-control", "private, no-store").send(hit.bytes);
  }
}
