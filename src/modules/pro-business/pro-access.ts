import { createParamDecorator, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../common/db/prisma.service";
import type { Principal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REMOVED = (): AppError => new AppError(403, "login_removed", "You were removed from this business, so you can no longer open its pages. Ask its owner to add you again.");

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

  /**
   * The business to work in. With the header x-business-id (RR2) it must be one the person owns or has a live login on, else 403;
   * without it, their own business first, then their oldest live login. Anyone with a live login passes, whatever sides their
   * account has (OO1).
   */
  async find(accountId: string, header?: string): Promise<ProCaller | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; owner: boolean; loginId: string | null }[]>`
      SELECT b.id::text AS id, true AS owner, NULL::text AS "loginId", 0 AS rank FROM business b WHERE b."accountId" = ${accountId}::uuid
      UNION ALL
      SELECT l."businessId"::text AS id, false AS owner, l.id::text AS "loginId", 1 AS rank
        FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE l."businessId" IS NOT NULL AND a.contact IS NOT NULL AND a."erasedAt" IS NULL AND lower(trim(l.contact)) = lower(a.contact)
         AND l.status IN ('invited', 'active')
      ORDER BY rank, "loginId" NULLS FIRST`;
    let r: (typeof rows)[number] | undefined = rows[0];
    if (header !== undefined) {
      const want = header.trim().toLowerCase();
      // The person's own business wins when it is the one named, even if they are also a login of it.
      r = rows.find((x) => x.id === want);
      if (!r) throw (await this.wasRemoved(accountId, want)) ? REMOVED() : AppError.forbidden("You are not part of that business.");
    }
    if (!r) return null;
    if (!r.owner && r.loginId) {
      await this.prisma.$executeRaw`UPDATE login SET status = 'active' WHERE id = ${r.loginId}::uuid AND status = 'invited'`;
    }
    return { accountId, businessId: r.id, owner: r.owner };
  }

  /** HR3: does this person's sign-in email hold a login marked removed (on this business, or on any when none is named)? */
  private async wasRemoved(accountId: string, businessId?: string): Promise<boolean> {
    if (businessId !== undefined && !UUID.test(businessId)) return false;
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM login l JOIN account a ON a.id = ${accountId}::uuid
       WHERE a.contact IS NOT NULL AND lower(trim(l.contact)) = lower(a.contact) AND l.status = 'removed'
         AND (${businessId ?? null}::text IS NULL OR l."businessId" = ${businessId ?? null}::uuid)`;
    return (rows[0]?.n ?? 0) > 0;
  }

  /** The caller's business (owner or login), or 403 (with words that say so when their login was removed). */
  async require(p: Principal | undefined, header?: string): Promise<ProCaller> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    const c = await this.find(p.accountId, header);
    if (!c) throw (await this.wasRemoved(p.accountId)) ? REMOVED() : AppError.forbidden("You are not part of a business.");
    return c;
  }

  /** The caller's business, only when it is the owner (logins, billing). */
  async requireOwner(p: Principal | undefined, header?: string): Promise<ProCaller> {
    const c = await this.require(p, header);
    if (!c.owner) throw AppError.forbidden("Only the owner of the business can do this.");
    return c;
  }
}

/** The header x-business-id, as one string (a repeated header is read as absent-and-wrong: it is refused by `find`). */
export const BusinessHeader = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const v = ctx.switchToHttp().getRequest<Request>().headers["x-business-id"];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.join(",") : v;
});
