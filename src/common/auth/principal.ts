/** Who is calling. Set on the request by the access guard. */
export type Side = "person" | "creator" | "business";
export type StaffRole = "owner" | "ops" | "moderator" | "reviewer" | "support" | "finance" | "maker";

export interface UserPrincipal {
  kind: "user";
  accountId: string;
  sides: Side[];
}
export interface StaffPrincipal {
  kind: "staff";
  staffId: string;
  roles: StaffRole[];
}
export type Principal = UserPrincipal | StaffPrincipal;

/**
 * Turns a bearer token into a principal, or null when the token is not good.
 * The sessions module provides the JWT verifier; until it is registered every token is refused.
 */
export abstract class AccessTokenVerifier {
  abstract verify(token: string): Promise<Principal | null>;
}

export class RefuseAllTokens extends AccessTokenVerifier {
  verify(): Promise<Principal | null> {
    return Promise.resolve(null);
  }
}

/** Checks an incoming webhook's signature for one provider. */
export type WebhookProvider = "paystack";
