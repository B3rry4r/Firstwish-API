import type { Request, Response } from "express";
import type { SessionLife } from "../../common/auth/session-families";
import type { Env } from "../../common/env/env";

/** Staff refresh life: 12 hours from sign-in; a refresh does not lengthen it (sessions declaration, PROVISIONAL; A8, S5). */
export const STAFF_REFRESH_SECONDS = 12 * 60 * 60;
export const STAFF_SESSION: SessionLife = { seconds: STAFF_REFRESH_SECONDS, fromSignIn: true };
export const STAFF_REFRESH_COOKIE = "fw_staff_refresh";
/** The staff cookie goes only to the staff auth routes (verify sets it, refresh reads it, sign-out clears it). */
export const STAFF_REFRESH_PATH = "/v1/admin/auth";

const domainPart = (env: Env) => (env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost" ? `; Domain=${env.COOKIE_DOMAIN}` : "");

export function setStaffCookie(res: Response, env: Env, value: string, expiresAt: Date, now: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  res.append("Set-Cookie", `${STAFF_REFRESH_COOKIE}=${value}; Max-Age=${maxAge}; Path=${STAFF_REFRESH_PATH}${domainPart(env)}; HttpOnly; Secure; SameSite=Lax`);
}

export function clearStaffCookie(res: Response, env: Env): void {
  res.append("Set-Cookie", `${STAFF_REFRESH_COOKIE}=; Max-Age=0; Path=${STAFF_REFRESH_PATH}${domainPart(env)}; HttpOnly; Secure; SameSite=Lax`);
}

export function readStaffCookie(req: Request): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === STAFF_REFRESH_COOKIE) return part.slice(i + 1).trim() || null;
  }
  return null;
}
