import { AppError } from "../../common/errors/app-error";
import { staffWrites } from "../role-access/staff-section.guard";

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

/**
 * HX5: for each section the roles open, every staff write those roles may do there, drawn from the routes' own table (the section and roles
 * each route lists to the guard, and the actions table of a route that does several things by a body `action`). One source, so the session
 * read and the routes cannot disagree. A section with no write the roles may do is left out.
 */
export function actionsFor(roles: readonly string[], sections: readonly string[]): Record<string, string[]> {
  const open = new Set(sections);
  const owner = roles.includes("owner");
  const out: Record<string, Set<string>> = {};
  for (const w of staffWrites()) {
    if (!open.has(w.section) || !(owner || w.roles.some((r) => roles.includes(r)))) continue;
    const names = w.table ? Object.keys(w.table).filter((a) => roles.some((r) => (w.table as Record<string, readonly string[]>)[a].includes(r))) : [w.action];
    for (const n of names) (out[w.section] ??= new Set()).add(n);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}
