import { HttpStatus } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error";

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Three upheld reports against one account remove its right to publish (PROVISIONAL: the owner may change the number). */
export const UPHELD_LIMIT = 3;
/** A report is acted on within this many hours (the owner's words). */
export const REPORT_HOURS = 24;

/** The scopes of a ban that are in force at `now` (a ban with no end, or whose end has not come). Lifting a ban sets its end to now. */
export async function activeBanScopes(db: Db, accountId: string, now: Date): Promise<("publishing" | "account")[]> {
  const rows = await db.$queryRaw<{ scope: "publishing" | "account" }[]>`
    SELECT DISTINCT scope::text AS scope FROM ban WHERE "accountId" = ${accountId}::uuid AND (until IS NULL OR until > ${now})`;
  return rows.map((r) => r.scope);
}

/** 403 account_banned: the account cannot sign in (sign-in and refresh call this). */
export async function assertNotBanned(db: Db, accountId: string, now: Date): Promise<void> {
  if ((await activeBanScopes(db, accountId, now)).includes("account")) {
    throw new AppError(HttpStatus.FORBIDDEN, "account_banned", "This account cannot sign in.");
  }
}

/** 403 publishing_barred: any ban in force, or no right to publish left, refuses a request to publish. */
export async function assertMayPublish(db: Db, accountId: string, now: Date): Promise<void> {
  if ((await activeBanScopes(db, accountId, now)).length) {
    throw new AppError(HttpStatus.FORBIDDEN, "publishing_barred", "This account cannot publish wishes.");
  }
}
