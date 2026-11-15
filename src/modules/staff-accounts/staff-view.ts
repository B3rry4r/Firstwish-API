import type { StaffAccount as StaffRow, StaffAccountRoles } from "@prisma/client";
import { toWireInstant } from "../../common/time/time";
import type { StaffAccount } from "../../contracts";

export const STAFF_ROLES: readonly StaffAccountRoles[] = ["owner", "ops", "moderator", "reviewer", "support", "finance", "maker"];

/** A removed member: suspended and holding no role (the schema has no "removed" status; see the B03 hand-back). */
export function isRemoved(row: Pick<StaffRow, "status" | "roles">): boolean {
  return row.status === "suspended" && row.roles.length === 0;
}

/** A staff row on the wire. `code` and `reason` are request inputs of other endpoints and are never echoed back. */
export function staffToWire(row: StaffRow): StaffAccount {
  const seen = row.lastSignInAt ? toWireInstant(row.lastSignInAt) : null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: [...row.roles],
    role: row.roles[0] ?? null,
    status: row.status,
    state: isRemoved(row) ? "removed" : row.status,
    lastSignInAt: seen,
    seen,
    since: toWireInstant(row.createdAt),
    createdAt: toWireInstant(row.createdAt),
    updatedAt: toWireInstant(row.updatedAt),
    code: "",
    reason: "",
  };
}
