import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../../common/env/env.module";
import type { Env } from "../../common/env/env";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import type { StaffPrincipal } from "../../common/auth/principal";

/** Staff access tokens: JWT (HS256), 15 minutes, audience "staff" (sessions declaration). A user token never carries it. */
export const STAFF_AUDIENCE = "staff";
export const STAFF_ACCESS_SECONDS = 15 * 60;
/** Staff refresh life: 12 hours (sessions declaration, PROVISIONAL, owner item; A8). */
export const STAFF_REFRESH_SECONDS = 12 * 60 * 60;
export const STAFF_REFRESH_COOKIE = "fw_staff_refresh";
export const STAFF_REFRESH_PATH = "/v1/admin/auth";

/** A staff principal with the session it came from (sign-out ends that session). */
export type StaffSessionPrincipal = StaffPrincipal & { sessionId: string };

interface Claims {
  sub: string;
  sid: string;
  aud: string;
  iat: number;
  exp: number;
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

@Injectable()
export class StaffTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  issue(staffId: string, sessionId: string): { token: string; expiresAt: Date } {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const claims: Claims = { sub: staffId, sid: sessionId, aud: STAFF_AUDIENCE, iat, exp: iat + STAFF_ACCESS_SECONDS };
    const body = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(claims))}`;
    return { token: `${body}.${this.sign(body)}`, expiresAt: new Date(claims.exp * 1000) };
  }

  /** The claims of a good, unexpired staff token, or null (a user token, a bad signature or an old token). */
  read(token: string): Claims | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const want = Buffer.from(this.sign(`${parts[0]}.${parts[1]}`));
    const given = Buffer.from(parts[2]);
    if (want.length !== given.length || !timingSafeEqual(want, given)) return null;
    let c: Partial<Claims>;
    try {
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: unknown };
      if (header.alg !== "HS256") return null;
      c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Partial<Claims>;
    } catch {
      return null;
    }
    if (c.aud !== STAFF_AUDIENCE || typeof c.sub !== "string" || typeof c.sid !== "string" || typeof c.exp !== "number") return null;
    if (c.exp * 1000 <= this.clock.now().getTime()) return null;
    return c as Claims;
  }

  private sign(body: string): string {
    return createHmac("sha256", this.env.JWT_ACCESS_SECRET).update(body).digest("base64url");
  }
}

/**
 * Turns a staff bearer token into a staff principal, or null. It reads the session and the account on every request, so a
 * removed or suspended member, or an ended session, is refused at once, and a role change applies at once.
 * The kernel's AccessTokenVerifier asks this first and the user verifier second (shared change asked in the B03 hand-back).
 */
@Injectable()
export class StaffTokenVerifier {
  constructor(
    private readonly tokens: StaffTokens,
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  async verify(token: string): Promise<StaffSessionPrincipal | null> {
    const c = this.tokens.read(token);
    if (!c) return null;
    const s = await this.db.session.findFirst({
      where: { id: c.sid, staffId: c.sub, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      select: { staff: { select: { id: true, status: true, roles: true } } },
    });
    if (!s?.staff || s.staff.status !== "active" || s.staff.roles.length === 0) return null;
    return { kind: "staff", staffId: s.staff.id, roles: s.staff.roles, sessionId: c.sid };
  }
}
