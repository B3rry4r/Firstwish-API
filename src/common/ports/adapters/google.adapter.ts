import { createPublicKey, KeyObject, verify as verifySig } from "node:crypto";
import { Clock } from "../clock.port";
import { GoogleAuthorizationRequest, GoogleIdClaims, GoogleIdentityPort } from "../google.port";
import { ProviderError } from "./http";


const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export function decodePart<T>(part: string | undefined): T | null {
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** The real adapter: Google's OAuth endpoints, and RS256 checked against Google's published keys (cached by max-age). */
export class GoogleOidc extends GoogleIdentityPort {
  private keys = new Map<string, KeyObject>();
  private keysUntil = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly clock: Clock,
  ) {
    super();
  }

  authorizationUrl(r: GoogleAuthorizationRequest): string {
    const q = new URLSearchParams({
      client_id: r.clientId,
      redirect_uri: r.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: r.state,
      code_challenge: r.codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `${AUTH_URL}?${q.toString()}`;
  }

  async exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ idToken: string }> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: p.code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: "authorization_code",
        code_verifier: p.codeVerifier,
      }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new ProviderError("google", res.status, text.slice(0, 300));
    const body = JSON.parse(text) as { id_token?: unknown };
    if (typeof body.id_token !== "string") throw new ProviderError("google", res.status, "no id_token in the answer");
    return { idToken: body.id_token };
  }

  async verifySignature(idToken: string): Promise<GoogleIdClaims | null> {
    const [h, p, s] = idToken.split(".");
    const header = decodePart<{ alg?: string; kid?: string }>(h);
    if (!header || header.alg !== "RS256" || !header.kid || !s) return null;
    const key = await this.key(header.kid);
    if (!key) return null;
    const ok = verifySig("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
    return ok ? decodePart<GoogleIdClaims>(p) : null;
  }

  private async key(kid: string): Promise<KeyObject | null> {
    if (this.clock.now().getTime() >= this.keysUntil || !this.keys.has(kid)) await this.loadKeys();
    return this.keys.get(kid) ?? null;
  }

  private async loadKeys(): Promise<void> {
    const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new ProviderError("google", res.status, "could not read the signing keys");
    const body = (await res.json()) as { keys?: { kid: string; kty: string; n: string; e: string }[] };
    const next = new Map<string, KeyObject>();
    for (const k of body.keys ?? []) next.set(k.kid, createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: "jwk" }));
    this.keys = next;
    const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "");
    this.keysUntil = this.clock.now().getTime() + (maxAge ? Number(maxAge[1]) : 3600) * 1000;
  }
}
