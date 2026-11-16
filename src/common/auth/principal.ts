/** Who is calling. Set on the request by the access guard. */
export type Side = "person" | "creator" | "business";
export type StaffRole = "owner" | "ops" | "moderator" | "reviewer" | "support" | "finance" | "maker";

export interface UserPrincipal {
  kind: "user";
  accountId: string;
  sides: Side[];
  /** The session row and family of the token (set by the real verifier; a test token may leave them out). */
  sessionId?: string;
  familyId?: string;
}
export interface StaffPrincipal {
  kind: "staff";
  staffId: string;
  roles: StaffRole[];
  sessionId?: string;
  familyId?: string;
}
export type Principal = UserPrincipal | StaffPrincipal;

/**
 * Turns a bearer token into a principal, or null when the token is not good.
 * CommonModule binds SessionTokenVerifier (the one verifier for user and staff tokens, S1); RefuseAllTokens is for tests that
 * want every token refused.
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
export type WebhookProvider = "paystack" | "resend";
