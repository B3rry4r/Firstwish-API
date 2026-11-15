/** The claims of a Google ID token whose signature checked out. The service checks issuer, audience, expiry and email. */
export interface GoogleIdClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
}

export interface GoogleAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Google sign-in (OpenID Connect, code flow with PKCE, DEC-7). Real adapter: Google's endpoints and signing keys.
 * Stand-in: test tokens signed with a local key; no network.
 */
export abstract class GoogleIdentityPort {
  /** Where the browser goes to sign in with Google. */
  abstract authorizationUrl(req: GoogleAuthorizationRequest): string;
  /** Trades the code Google sent back for an ID token. Throws when Google refuses the code. */
  abstract exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ idToken: string }>;
  /** The token's claims when its signature is good, else null. */
  abstract verifySignature(idToken: string): Promise<GoogleIdClaims | null>;
}
