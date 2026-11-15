import { Injectable } from "@nestjs/common";
import { AccessTokenVerifier, Principal, Side } from "../../common/auth/principal";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { AccessTokens } from "./access-tokens";

/**
 * The real bearer check: a good, unexpired JWT whose session row is still live. Sides (user) and roles (staff) are read
 * from the database on each request, so a sign-out or a change of sides counts at once, not when the token runs out.
 */
@Injectable()
export class JwtAccessTokenVerifier extends AccessTokenVerifier {
  constructor(
    private readonly tokens: AccessTokens,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async verify(token: string): Promise<Principal | null> {
    const claims = this.tokens.read(token);
    if (!claims) return null;
    const now = this.clock.now();
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: {
        accountId: true,
        staffId: true,
        revokedAt: true,
        expiresAt: true,
        account: { select: { sides: true, erasedAt: true } },
        staff: { select: { roles: true, status: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) return null;
    if (claims.kind === "user") {
      if (session.accountId !== claims.sub || !session.account || session.account.erasedAt) return null;
      const sides: Side[] = session.account.sides;
      return { kind: "user", accountId: claims.sub, sides: sides.includes("person") ? sides : ["person", ...sides] };
    }
    if (session.staffId !== claims.sub || !session.staff || session.staff.status !== "active") return null;
    return { kind: "staff", staffId: claims.sub, roles: session.staff.roles };
  }
}
