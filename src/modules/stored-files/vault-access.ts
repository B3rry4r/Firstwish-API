import type { PrismaService } from "../../common/db/prisma.service";

/** Default (lead), owner may override: a login that was invited or is active makes its holder a member (signing in with the contact is the acceptance). */
export const MEMBER_LOGIN_STATUSES = ["active", "invited"];

export interface BusinessAccess {
  /** Businesses the account owns. */
  owned: string[];
  /** Businesses the account is a login (member) of, and does not own. */
  member: string[];
}

/** X27: the businesses an account may read Vault files of: the ones it owns, and the ones that gave its contact a login. */
export async function businessAccessOf(db: Pick<PrismaService, "business" | "account" | "login">, accountId: string): Promise<BusinessAccess> {
  const owned = (await db.business.findMany({ where: { accountId }, select: { id: true }, orderBy: { id: "asc" } })).map((b) => b.id);
  const account = await db.account.findUnique({ where: { id: accountId }, select: { contact: true, erasedAt: true } });
  const contact = account?.contact?.trim();
  if (!contact || account?.erasedAt) return { owned, member: [] };
  const logins = await db.login.findMany({
    where: { contact: { equals: contact, mode: "insensitive" }, status: { in: MEMBER_LOGIN_STATUSES }, businessId: { not: null } },
    select: { businessId: true },
    orderBy: { businessId: "asc" },
  });
  const member = [...new Set(logins.map((l) => l.businessId as string))].filter((id) => !owned.includes(id));
  return { owned, member };
}
