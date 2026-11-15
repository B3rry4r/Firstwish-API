import type { Request, Response } from "express";
import type { Env } from "../../common/env/env";

/**
 * V3: the Google state is bound to the browser that started it. Start sets this httpOnly, Secure, SameSite=Lax cookie holding a
 * nonce, scoped to the two routes that finish a Google flow (the sign-in callback and the link); they refuse a state whose
 * nonce cookie is missing or different. 10 minutes, like the state.
 */
export const GOOGLE_NONCE_COOKIE = "fw_google";
const PATHS = ["/v1/auth/google", "/v1/me/google"];
const LIFE_SECONDS = 10 * 60;

const domainPart = (env: Env) => (env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost" ? `; Domain=${env.COOKIE_DOMAIN}` : "");

export function setGoogleNonce(res: Response, env: Env, nonce: string): void {
  for (const p of PATHS) res.append("Set-Cookie", `${GOOGLE_NONCE_COOKIE}=${nonce}; Max-Age=${LIFE_SECONDS}; Path=${p}${domainPart(env)}; HttpOnly; Secure; SameSite=Lax`);
}

export function clearGoogleNonce(res: Response, env: Env): void {
  for (const p of PATHS) res.append("Set-Cookie", `${GOOGLE_NONCE_COOKIE}=; Max-Age=0; Path=${p}${domainPart(env)}; HttpOnly; Secure; SameSite=Lax`);
}

export function readGoogleNonce(req: Request): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === GOOGLE_NONCE_COOKIE) return part.slice(i + 1).trim() || null;
  }
  return null;
}
