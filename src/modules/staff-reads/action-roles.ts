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

/** The creators screen's money actions: marking a month paid and approving a payout run (the routes' own roles). */
export const PAYOUT_ACTION_ROLES = {
  mark_paid: ["finance", "owner"],
  approve_run: ["finance", "owner"],
} as const satisfies Record<string, readonly string[]>;

/** The numbers screen's one action: setting a monthly target (PUT /admin/numbers/targets). */
export const NUMBERS_ACTION_ROLES = {
  set_target: ["finance", "owner"],
} as const satisfies Record<string, readonly string[]>;

const SECTION_ACTIONS: Record<string, Record<string, readonly string[]>> = {
  "/admin/wishes": WISH_ACTION_ROLES,
  "/admin/people": PERSON_ACTION_ROLES,
  "/admin/creators": PAYOUT_ACTION_ROLES,
  "/admin/numbers": NUMBERS_ACTION_ROLES,
};

/**
 * HW7: for each section the roles open, the actions those roles may do there, from the same tables the routes check (one source).
 * A section with no action tables, or none the roles may do, is left out.
 */
export function actionsFor(roles: readonly string[], sections: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const section of sections) {
    const table = SECTION_ACTIONS[section];
    if (!table) continue;
    const may = Object.keys(table).filter((a) => roles.some((r) => table[a].includes(r)));
    if (may.length) out[section] = may;
  }
  return out;
}
