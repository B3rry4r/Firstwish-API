import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../env/env.module";
import type { Env } from "../env/env";
import { Clock } from "../ports/clock.port";

/** Access token life: 15 minutes, for user and staff tokens alike (conventions.md, Signing in). */
export const ACCESS_TOKEN_SECONDS = 15 * 60;

/** Who a token is for. A staff token is never good on a user route, nor a user token on a staff route (S1). */
export type Audience = "user" | "staff";

/** What an access token carries. `fid` is the session family: the token is good while that family lives (V1). */
export interface AccessClaims {
  /** The account id (aud user) or staff id (aud staff). */
  sub: string;
  aud: Audience;
  /** The session row the token was given with. */
  sid: string;
  /** The session family (one device's chain of refresh tokens). */
  fid: string;
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True for a lowercase uuid string. Ids that are not uuids are refused before any query (V6). */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/**
 * The one access-token issuer and reader (S1, T5): JWT, HS256, keyed by JWT_ACCESS_SECRET, timed by the clock port.
 * The header must be exactly the one this issues (no alg choice), and every id in it must be a uuid.
 */
@Injectable()
export class AccessTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  issue(aud: Audience, sub: string, sid: string, fid: string): { token: string; expiresAt: Date } {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const claims: AccessClaims = { sub, aud, sid, fid, iat, exp: iat + ACCESS_TOKEN_SECONDS };
    const body = `${HEADER}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
    return { token: `${body}.${this.sign(body)}`, expiresAt: new Date(claims.exp * 1000) };
  }

  /** The claims of a good, unexpired token, or null. */
  read(token: string): AccessClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== HEADER) return null;
    const want = Buffer.from(this.sign(`${parts[0]}.${parts[1]}`));
    const given = Buffer.from(parts[2]);
    if (want.length !== given.length || !timingSafeEqual(want, given)) return null;
    let c: Partial<AccessClaims>;
    try {
      c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Partial<AccessClaims>;
    } catch {
      return null;
    }
    if (c.aud !== "user" && c.aud !== "staff") return null;
    if (!isUuid(c.sub) || !isUuid(c.sid) || !isUuid(c.fid) || typeof c.exp !== "number") return null;
    if (c.exp * 1000 <= this.clock.now().getTime()) return null;
    return c as AccessClaims;
  }

  /** The claims of a bearer header, or null. */
  fromHeader(header: string | undefined): AccessClaims | null {
    const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
    return m ? this.read(m[1]) : null;
  }

  private sign(data: string): string {
    return createHmac("sha256", this.env.JWT_ACCESS_SECRET).update(data).digest("base64url");
  }
}
