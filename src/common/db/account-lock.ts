import { HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error";

/** A transaction, or anything that can run raw SQL inside one. */
export type LockDb = Pick<Prisma.TransactionClient, "$queryRaw">;

export interface LockedAccount {
  id: string;
  erasedAt: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 401 account_erased: an erased account takes no writes; its sessions are already ended, so the web app signs out. */
export function accountErased(): AppError {
  return new AppError(HttpStatus.UNAUTHORIZED, "account_erased", "This account was erased.");
}

/**
 * AA1: the one account lock. Call it FIRST inside the transaction of every write made on an account (profile, handle,
 * sides, follow, brand, wishes, files, dates). It locks the account row (FOR UPDATE) and checks erasedAt under that lock, so a
 * write either commits before an erase or sees the erase and is refused: nothing lands on an erased account. Erase takes the
 * same lock with { allowErased: true } (erasing twice changes nothing).
 * A missing account or an id that is not a uuid is a 404, never a 500.
 */
export async function lockAccount(tx: LockDb, accountId: string, opts: { allowErased?: boolean } = {}): Promise<LockedAccount> {
  if (!UUID.test(accountId)) throw AppError.notFound();
  const rows = await tx.$queryRaw<LockedAccount[]>`SELECT id::text AS id, "erasedAt" FROM account WHERE id = ${accountId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw AppError.notFound();
  if (row.erasedAt && !opts.allowErased) throw accountErased();
  return row;
}

/**
 * The same lock for a write made on a business: locks the owning account (the business's accountId) and refuses when it
 * is erased. Answers the business's owner account id.
 */
export async function lockBusinessOwner(tx: LockDb, businessId: string): Promise<LockedAccount> {
  if (!UUID.test(businessId)) throw AppError.notFound();
  const rows = await tx.$queryRaw<
    { accountId: string | null }[]
  >`SELECT "accountId"::text AS "accountId" FROM business WHERE id = ${businessId}::uuid`;
  const owner = rows[0]?.accountId;
  if (!owner) throw AppError.notFound();
  return lockAccount(tx, owner);
}
