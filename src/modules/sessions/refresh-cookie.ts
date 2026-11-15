import type { Request, Response } from "express";
import type { Env } from "../../common/env/env";

/** The refresh cookie: httpOnly, Secure, SameSite=Lax, sent only to the refresh route (R10: nothing kept in browser storage). */
export const REFRESH_COOKIE = "fw_refresh";
export const REFRESH_COOKIE_PATH = "/v1/auth/refresh";

function domainPart(env: Env): string {
  // A cookie for localhost works only without a Domain attribute.
  return env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost" ? `; Domain=${env.COOKIE_DOMAIN}` : "";
}

export function setRefreshCookie(res: Response, env: Env, value: string, expiresAt: Date, now: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  res.append(
    "Set-Cookie",
    `${REFRESH_COOKIE}=${value}; Max-Age=${maxAge}; Path=${REFRESH_COOKIE_PATH}${domainPart(env)}; HttpOnly; Secure; SameSite=Lax`,
  );
}

export function clearRefreshCookie(res: Response, env: Env): void {
  res.append("Set-Cookie", `${REFRESH_COOKIE}=; Max-Age=0; Path=${REFRESH_COOKIE_PATH}${domainPart(env)}; HttpOnly; Secure; SameSite=Lax`);
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === REFRESH_COOKIE) {
      const v = part.slice(i + 1).trim();
      return v || null;
    }
  }
  return null;
}
