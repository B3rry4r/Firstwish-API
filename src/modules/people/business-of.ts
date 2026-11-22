import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import type { Principal } from "../../common/auth/principal";
import { loginRemoved, loginWasRemoved, notInBusiness } from "../../common/auth/login-removed";
import { AppError } from "../../common/errors/app-error";

/**
 * The business a signed-in account works in: the one it owns (business.accountId), else the one that holds a login for its
 * sign-in email (a member, ruling X27). A login marked removed does not count.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
    if (!id) throw await notInBusiness(this.prisma, p.accountId, "You are not part of a business.");
    return id;
  }

  /**
   * IF7 (HR3): the business a request works in. Without the x-business-id header it is the caller's own business, else their oldest login, as
   * before. With it, the one named (see `namedBusiness`).
   */
  async named(p: Principal | undefined, header: string | undefined, opts: NamedOpts = {}): Promise<{ businessId: string; owner: boolean | null }> {
    if (!p || p.kind !== "user") throw AppError.forbidden();
    if (header === undefined) return { businessId: await this.require(p), owner: null };
    return namedBusiness(this.prisma, p.accountId, header, opts);
  }
}

export function accountOf(p: Principal | undefined): string {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p.accountId;
}

export interface NamedOpts {
  ownerOnly?: boolean;
  words?: string;
}

/**
 * IF7: the business the x-business-id header names, in the caller's role there: `owner` when the account holds the business, a login when its
 * sign-in email is on a live login of it. A header that is not an id is 422 in words (any case of an id is the same id); a business the caller is
 * not part of is 404 (a removed login gets the words every business read gives); with `ownerOnly`, a login of that business is refused in words (403).
 */
export async function namedBusiness(db: Pick<PrismaService, "$queryRaw">, accountId: string, header: string, opts: NamedOpts = {}): Promise<{ businessId: string; owner: boolean }> {
  const want = header.trim().toLowerCase();
  if (!UUID.test(want)) throw AppError.validation({ "x-business-id": "Must be a business id." });
  const rows = await db.$queryRaw<{ owner: boolean }[]>`
    SELECT true AS owner FROM business b WHERE b.id = ${want}::uuid AND b."accountId" = ${accountId}::uuid
    UNION ALL
    SELECT false AS owner FROM login l JOIN account a ON a.id = ${accountId}::uuid
     WHERE l."businessId" = ${want}::uuid AND a.contact IS NOT NULL AND a."erasedAt" IS NULL AND lower(trim(l.contact)) = lower(a.contact)
       AND l.status IN ('invited', 'active')
    ORDER BY owner DESC LIMIT 1`;
  const r = rows[0];
  if (!r) throw (await loginWasRemoved(db, accountId, want)) ? loginRemoved() : AppError.notFound("No such business.");
  if (opts.ownerOnly && !r.owner) throw AppError.forbidden(opts.words ?? "Only the owner of the business can do this.");
  return { businessId: want, owner: r.owner };
}
