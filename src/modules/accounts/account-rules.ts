import { Prisma } from "@prisma/client";
import type { Account } from "../../contracts";
import { AppError, ErrorFields } from "../../common/errors/app-error";
import { normaliseEmail } from "../../common/normalise/email";
import { normalisePhone } from "../../common/normalise/phone";

export type Db = Prisma.TransactionClient;
export type Side = Account["sides"][number];

/** A unique index refused the write (Prisma's P2002, or Postgres 23505 from a raw statement). */
export function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return true;
    if (e.code === "P2010") return JSON.stringify(e.meta ?? {}).includes("23505");
  }
  return false;
}

export const HANDLE_TAKEN = () => AppError.conflict("handle_taken", "That handle is taken. Try another.");

/**
 * The `contact` field of PATCH /v1/me, POST /v1/me/creator and POST /v1/me/business: the sign-in email (unchanged here, S-27)
 * or a phone kept as a plain detail (R11). Returns the phone to store, or undefined when nothing changes.
 */
export function readContact(raw: string, signInEmail: string | null, fields: ErrorFields): string | undefined {
  const asEmail = normaliseEmail(raw);
  if (asEmail !== null) {
    if (asEmail !== signInEmail) fields.contact = "The sign-in email cannot be changed here.";
    return undefined;
  }
  const phone = normalisePhone(raw);
  if (phone === null) {
    fields.contact = "Must be a phone number or your sign-in email.";
    return undefined;
  }
  return phone;
}

/** The account's sides as /v1/me shows them: person always first (A16). */
export function sidesOf(raw: readonly Side[]): Side[] {
  return raw.includes("person") ? [...raw] : ["person", ...raw];
}

/**
 * Sets a new handle on a locked account row and moves the follows that point at the old one (follows are keyed by handle).
 * A handle another account holds, in any case, is 409 (Q7: stored lowercased and unique on lower(handle)).
 */
export async function setHandle(tx: Db, accountId: string, oldHandle: string | null, handle: string): Promise<void> {
  if (oldHandle === handle) return;
  const taken = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM account WHERE lower(handle) = ${handle} AND id <> ${accountId}::uuid LIMIT 1`;
  if (taken.length) throw HANDLE_TAKEN();
  await tx.account.update({ where: { id: accountId }, data: { handle } });
  if (oldHandle) await tx.follow.updateMany({ where: { handle: oldHandle }, data: { handle } });
}
