import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";

export interface ProCaller {
  accountId: string;
  businessId: string;
  /** The owner of the business (its account), not a login. */
  owner: boolean;
}

/**
 * Which business a signed-in account works in, and as what. The owner is the account that holds the business row. A login is an
 * account whose sign-in email is on one of the business's logins that is invited or active; removed logins do not count, and the
 * check runs on every request, so a removed login loses the business at once whatever tokens it still holds. An invited login
 * becomes active the first time its holder (signed in with that email) comes in: signing in with the invited email is the acceptance.
 */
@Injectable()
export class ProAccess {
  constructor(private readonly prisma: PrismaService) {}

  async find(accountId: string): Promise<ProCaller | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; owner: boolean; loginId: string | null }[]>`
      SELECT b.id::text AS id, true AS owner, NULL::text AS "loginId", 0 AS rank FROM business b WHERE b."accountId" = ${accountId}::uuid
      UNION ALL
      SELECT l."businessId"::text AS id, false AS owner, l.id::text AS "loginId", 1 AS rank
        FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE l."businessId" IS NOT NULL AND a.contact IS NOT NULL AND a."erasedAt" IS NULL AND lower(trim(l.contact)) = lower(a.contact)
         AND l.status IN ('invited', 'active')
      ORDER BY rank, id
      LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    if (!r.owner && r.loginId) {
      await this.prisma.$executeRaw`UPDATE login SET status = 'active' WHERE id = ${r.loginId}::uuid AND status = 'invited'`;
    }
    return { accountId, businessId: r.id, owner: r.owner };
  }

  /** The caller's business (owner or login), or 403. */
  async require(p: Principal | undefined): Promise<ProCaller> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    const c = await this.find(p.accountId);
    if (!c) throw AppError.forbidden("You are not part of a business.");
    return c;
  }

  /** The caller's business, only when it is the owner (logins, billing). */
  async requireOwner(p: Principal | undefined): Promise<ProCaller> {
    const c = await this.require(p);
    if (!c.owner) throw AppError.forbidden("Only the owner of the business can do this.");
    return c;
  }
}
