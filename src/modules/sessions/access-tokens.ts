import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { Clock } from "../../common/ports/clock.port";

/** Access token life: 15 minutes (conventions.md, Signing in). */
export const ACCESS_TOKEN_SECONDS = 15 * 60;

/** What an access token carries. `sid` is the session row; the verifier checks that row on every request. */
export interface AccessClaims {
  /** The account id (kind user) or staff id (kind staff). */
  sub: string;
  kind: "user" | "staff";
  sid: string;
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

/** Signs and reads access tokens: JWT, HS256, keyed by JWT_ACCESS_SECRET, timed by the clock port. */
@Injectable()
export class AccessTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  issue(kind: AccessClaims["kind"], sub: string, sid: string): { token: string; expiresAt: Date } {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const claims: AccessClaims = { sub, kind, sid, iat, exp: iat + ACCESS_TOKEN_SECONDS };
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
    let claims: Partial<AccessClaims>;
    try {
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Partial<AccessClaims>;
    } catch {
      return null;
    }
    if (typeof claims.sub !== "string" || typeof claims.sid !== "string" || typeof claims.exp !== "number") return null;
    if (claims.kind !== "user" && claims.kind !== "staff") return null;
    if (claims.exp * 1000 <= this.clock.now().getTime()) return null;
    return claims as AccessClaims;
  }

  private sign(data: string): string {
    return createHmac("sha256", this.env.JWT_ACCESS_SECRET).update(data).digest("base64url");
  }
}
