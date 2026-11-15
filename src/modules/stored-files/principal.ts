import type { Principal, UserPrincipal } from "../../common/auth/principal";
import { AppError } from "../../common/errors/app-error";

/** The signed-in user calling a files route (staff tokens are refused by the access guard before this). */
export function userOf(p: Principal | undefined): UserPrincipal {
  if (!p || p.kind !== "user") throw AppError.forbidden();
  return p;
}
