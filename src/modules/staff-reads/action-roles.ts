import { AppError } from "../../common/errors/app-error";

/**
 * Who may do each action reached through the staff wish and person screens (ruling FC1): the role of the route that owns the action.
 * One table, checked before anything is read or changed. A role not listed gets 403 and nothing changes.
 */
export const WISH_ACTION_ROLES = {
  take_down: ["moderator", "ops", "owner"],
  restore: ["moderator", "ops", "owner"],
  refund: ["finance", "ops", "owner"],
  extend: ["support", "ops", "owner"],
  resend: ["support", "ops", "owner"],
} as const satisfies Record<string, readonly string[]>;

export const PERSON_ACTION_ROLES = {
  ban: ["moderator", "owner"],
  lift: ["ops", "owner"],
  erase: ["owner"],
} as const satisfies Record<string, readonly string[]>;

/** Throws 403 when the action is in the table and none of the caller's roles may do it. An action not in the table is left to the caller's 422. */
export function requireActionRole(table: Record<string, readonly string[]>, action: string, roles: readonly string[]): void {
  const allowed = Object.prototype.hasOwnProperty.call(table, action) ? table[action] : undefined;
  if (allowed && !roles.some((r) => allowed.includes(r))) throw AppError.forbidden("Your role cannot do this.");
}
