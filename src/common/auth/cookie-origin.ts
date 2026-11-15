import { SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { Env } from "../env/env";
import { AppError } from "../errors/app-error";

/** W2: marks a route that may act on a cookie alone. When no bearer is sent, a present Origin must be on the CORS allowlist. */
export const COOKIE_ORIGIN = "fw:cookie-origin";
export const CookieOriginCheck = () => SetMetadata(COOKIE_ORIGIN, true);

/** The one check (called by the access guard). No Origin header (a server, curl) passes; a bearer request is not cookie-only. */
export function assertCookieOrigin(req: Request, env: Pick<Env, "WEB_ORIGINS">): void {
  if (req.headers.authorization) return;
  const origin = req.headers.origin;
  if (origin === undefined) return;
  const given = origin.replace(/\/+$/, "");
  if (!env.WEB_ORIGINS.some((o) => o.replace(/\/+$/, "") === given)) throw AppError.forbidden("This request is not allowed from here.");
}
