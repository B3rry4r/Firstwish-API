import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import { Clock } from "../ports/clock.port";
import { AccessClaims, AccessTokens } from "./access-tokens";
import { AccessTokenVerifier, Principal, Side, StaffPrincipal, UserPrincipal } from "./principal";

/**
 * The one bearer check, for user and staff tokens (S1, T5). A token with audience "staff" goes to the staff check, any other to
 * the user check, and each refuses the other's audience. A token is good while its session FAMILY lives (V1): a rotation leaves
 * the family alive, a sign-out or a detected theft ends it at once. Sides, roles and status are read on every request, so a
 * change counts at once, not when the token runs out.
 */
@Injectable()
export class SessionTokenVerifier extends AccessTokenVerifier {
  constructor(
    private readonly tokens: AccessTokens,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async verify(token: string): Promise<Principal | null> {
    const c = this.tokens.read(token);
    if (!c) return null;
    return c.aud === "staff" ? this.staff(c) : this.user(c);
  }

  /** The user check: refuses a staff token. */
  async user(c: AccessClaims): Promise<UserPrincipal | null> {
    if (c.aud !== "user") return null;
    const live = await this.prisma.session.findFirst({
      where: { familyId: c.fid, accountId: c.sub, staffId: null, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      select: { account: { select: { sides: true, erasedAt: true } } },
    });
    if (!live?.account || live.account.erasedAt) return null;
    const sides: Side[] = live.account.sides;
    return {
      kind: "user",
      accountId: c.sub,
      sides: sides.includes("person") ? sides : ["person", ...sides],
      sessionId: c.sid,
      familyId: c.fid,
    };
  }

  /** The staff check: refuses a user token, a member who is not active, and a member with no role. */
  async staff(c: AccessClaims): Promise<StaffPrincipal | null> {
    if (c.aud !== "staff") return null;
    const live = await this.prisma.session.findFirst({
      where: { familyId: c.fid, staffId: c.sub, accountId: null, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      select: { staff: { select: { status: true, roles: true } } },
    });
    if (!live?.staff || live.staff.status !== "active" || live.staff.roles.length === 0) return null;
    return { kind: "staff", staffId: c.sub, roles: live.staff.roles, sessionId: c.sid, familyId: c.fid };
  }
}
