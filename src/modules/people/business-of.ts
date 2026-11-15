import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";

/**
 * The business a signed-in account works in: the one it owns (business.accountId), else the one that holds a login for its
 * sign-in email (a member, ruling X27). A login marked removed does not count.
 */
@Injectable()
export class BusinessOf {
  constructor(private readonly prisma: PrismaService) {}

  /** The business id, or null when the account is in none. */
  async find(accountId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT b.id::text AS id, 0 AS rank FROM business b WHERE b."accountId" = ${accountId}::uuid
      UNION ALL
      SELECT l."businessId"::text AS id, 1 AS rank
        FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE l."businessId" IS NOT NULL AND a.contact IS NOT NULL AND lower(trim(l.contact)) = lower(a.contact)
         AND coalesce(l.status, '') <> 'removed'
      ORDER BY rank, id
      LIMIT 1`;
    return rows[0]?.id ?? null;
  }

  /** The caller's business, or 403 when the account is in none. */
  async require(p: Principal | undefined): Promise<string> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    const id = await this.find(p.accountId);
    if (!id) throw AppError.forbidden("You are not part of a business.");
    return id;
  }
}

export function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}
