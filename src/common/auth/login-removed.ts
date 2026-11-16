import type { PrismaService } from "../db/prisma.service";
import { AppError } from "../errors/app-error";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HU5: the one refusal a removed login gets on every business read, with words that say so. */
export const loginRemoved = (): AppError => new AppError(403, "login_removed", "You were removed from this business, so you can no longer open its pages. Ask its owner to add you again.");

/** Does this person's sign-in email hold a login marked removed (on the business named, or on any when none is named)? */
export async function loginWasRemoved(db: Pick<PrismaService, "$queryRaw">, accountId: string, businessId?: string): Promise<boolean> {
  if (businessId !== undefined && !UUID.test(businessId)) return false;
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM login l JOIN account a ON a.id = ${accountId}::uuid
     WHERE a.contact IS NOT NULL AND lower(trim(l.contact)) = lower(a.contact) AND l.status = 'removed'
       AND (${businessId ?? null}::text IS NULL OR l."businessId" = ${businessId ?? null}::uuid)`;
  return (rows[0]?.n ?? 0) > 0;
}

/** The refusal for someone who is in no business: login_removed when a login of theirs was removed, else a plain 403. */
export async function notInBusiness(db: Pick<PrismaService, "$queryRaw">, accountId: string, words: string): Promise<AppError> {
  return (await loginWasRemoved(db, accountId)) ? loginRemoved() : AppError.forbidden(words);
}
