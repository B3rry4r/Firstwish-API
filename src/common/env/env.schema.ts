/**
 * The environment schema. Every variable in .pipeline/env-manifest.json is listed here (a spec checks the two match),
 * plus any runtime-only variables in RUNTIME_VARS (none now).
 *
 * `need` says when a variable must be set:
 *  - always: the API will not boot without it.
 *  - live:   needed when PROVIDERS=live (real providers). With PROVIDERS=standin it may be left out.
 *  - r2 / spaces: needed when PROVIDERS=live and STORAGE_DRIVER names that adapter.
 *  - optional: never required.
 */
export type Need = "always" | "live" | "r2" | "spaces" | "optional";
export type Kind = "string" | "url" | "urlList" | "email" | "int" | "secret" | { oneOf: readonly string[] };

export interface VarSpec {
  name: string;
  need: Need;
  kind: Kind;
  purpose: string;
  default?: string;
}

/** Variables from the manifest. Keep the order of .pipeline/env-manifest.json. */
export const MANIFEST_VARS: readonly VarSpec[] = [
  { name: "DATABASE_URL", need: "always", kind: "url", purpose: "PostgreSQL connection" },
  { name: "REDIS_URL", need: "always", kind: "url", purpose: "Redis for the BullMQ queue" },
  { name: "JWT_ACCESS_SECRET", need: "always", kind: "secret", purpose: "signs 15-minute access tokens" },
  { name: "REFRESH_TOKEN_PEPPER", need: "always", kind: "secret", purpose: "peppers stored refresh-token hashes" },
  { name: "COOKIE_DOMAIN", need: "always", kind: "string", purpose: "API host for the refresh cookie" },
  { name: "WEB_ORIGINS", need: "always", kind: "urlList", purpose: "allowed CORS origins (the site on Vercel)" },
  { name: "PUBLIC_SITE_URL", need: "always", kind: "url", purpose: "base of public wish links /w/<slug>" },
  { name: "API_PUBLIC_URL", need: "always", kind: "url", purpose: "public API base for callbacks and webhooks" },
  { name: "AUTH_CODE_PEPPER", need: "always", kind: "secret", purpose: "peppers one-time code hashes" },
  { name: "GOOGLE_CLIENT_ID", need: "live", kind: "string", purpose: "Google OAuth client" },
  { name: "GOOGLE_CLIENT_SECRET", need: "live", kind: "string", purpose: "Google OAuth secret" },
  { name: "GOOGLE_REDIRECT_URI", need: "live", kind: "url", purpose: "OAuth callback" },
  { name: "STAFF_BOOTSTRAP_OWNER_EMAIL", need: "optional", kind: "email", purpose: "first owner staff account" },
  { name: "PAYSTACK_SECRET_KEY", need: "live", kind: "string", purpose: "Paystack API auth and webhook signature (HMAC-SHA512)" },
  { name: "PAYSTACK_PUBLIC_KEY", need: "live", kind: "string", purpose: "Paystack inline/checkout public key" },
  { name: "PAYSTACK_CALLBACK_URL", need: "live", kind: "url", purpose: "where Paystack returns the payer" },
  { name: "STORAGE_DRIVER", need: "live", kind: { oneOf: ["r2", "spaces"] }, purpose: "r2 | spaces" },
  { name: "R2_ACCOUNT_ID", need: "r2", kind: "string", purpose: "Cloudflare account for R2 endpoint" },
  { name: "R2_ACCESS_KEY_ID", need: "r2", kind: "string", purpose: "R2 S3 key" },
  { name: "R2_SECRET_ACCESS_KEY", need: "r2", kind: "string", purpose: "R2 S3 secret" },
  { name: "R2_BUCKET", need: "r2", kind: "string", purpose: "private bucket" },
  { name: "SPACES_ENDPOINT", need: "spaces", kind: "url", purpose: "DigitalOcean Spaces endpoint" },
  { name: "SPACES_REGION", need: "spaces", kind: "string", purpose: "Spaces region" },
  { name: "SPACES_ACCESS_KEY_ID", need: "spaces", kind: "string", purpose: "Spaces key" },
  { name: "SPACES_SECRET_ACCESS_KEY", need: "spaces", kind: "string", purpose: "Spaces secret" },
  { name: "SPACES_BUCKET", need: "spaces", kind: "string", purpose: "private bucket" },
  { name: "SCREENING_PROVIDER", need: "live", kind: { oneOf: ["basic"] }, purpose: "which screening adapter (stand-in in tests)" },
  { name: "SCREENING_API_KEY", need: "optional", kind: "string", purpose: "screening provider auth" },
  { name: "ANTHROPIC_API_KEY", need: "live", kind: "string", purpose: "Anthropic API (owner key)" },
  { name: "ANTHROPIC_MODEL", need: "live", kind: "string", purpose: "model id used for writing" },
  { name: "RENDER_CONCURRENCY", need: "optional", kind: "int", purpose: "how many videos this server renders at once (a real render needs about 1.5 GB: set 1 on a 4 GB machine)", default: "2" },
  { name: "RENDER_WEB_ORIGIN", need: "optional", kind: "url", purpose: "R1: the web origin the video renderer opens to play a wish (the render page); the real renderer needs it, none exists yet" },
  { name: "RENDER_TOKEN_SECRET", need: "optional", kind: "secret", purpose: "R1: the secret that hashes the one-use token the video renderer reads a wish with (at least 32 characters); the real renderer needs it, none exists yet" },
  { name: "RENDER_CHROMIUM_PATH", need: "optional", kind: "string", purpose: "R1: the browser program the video renderer starts to play a wish; read by the real renderer, none exists yet", default: "/usr/bin/google-chrome" },
  { name: "RENDER_FFMPEG_PATH", need: "optional", kind: "string", purpose: "R1: the ffmpeg program the video renderer encodes with; read by the real renderer, none exists yet", default: "/usr/bin/ffmpeg" },
  { name: "RENDER_TIME_LIMIT_SECONDS", need: "optional", kind: "int", purpose: "R1: the longest one video render may run, in seconds; the job lease is longer than this", default: "1200" },
  { name: "RENDER_TOKEN_TTL_SECONDS", need: "optional", kind: "int", purpose: "R1: how long a render token lives, in seconds; read by the real renderer, none exists yet", default: "900" },
  { name: "RESEND_API_KEY", need: "live", kind: "string", purpose: "Resend API auth (R12)" },
  { name: "RESEND_WEBHOOK_SECRET", need: "optional", kind: "string", purpose: "signing secret of Resend's webhook stream: delivery news and received mail (YY3)" },
  { name: "MAIL_FROM", need: "live", kind: "email", purpose: "sender address for every email (R12)" },
  { name: "NODE_ENV", need: "optional", kind: { oneOf: ["development", "test", "production"] }, purpose: "process mode", default: "development" },
  { name: "PORT", need: "optional", kind: "int", purpose: "HTTP port", default: "3000" },
  {
    name: "PROVIDERS",
    need: "optional",
    kind: { oneOf: ["live", "standin"] },
    purpose: "live uses real providers; standin uses in-process stand-ins (refused when NODE_ENV=production)",
    default: "live",
  },
  {
    name: "STANDIN_MAIL_OUTBOX",
    need: "optional",
    kind: "string",
    purpose: "HK1: a file the stand-in email appends each message to, one JSON line (to, template, subject, text, at); tests only, refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "STANDIN_CLOCK_OFFSET",
    need: "optional",
    kind: "string",
    purpose: "HP6: whole seconds (a minus sign allowed) added to the stand-in clock, read once at boot, so a test stack can reach resting, ended and the end of the restore window through the real jobs; refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "STANDIN_SCREENING",
    need: "optional",
    kind: "string",
    purpose: "API-BASE-12 case 4: rules for the stand-in screening by file name, as a comma list of hold:<part of a name> (the file waits in screening) or reject:<part of a name>[:<kind>] (the file is refused; the kind, one of type-not-taken, empty, too-large, type-mismatch, picks the words the refusal carries); tests and verifier stacks only, refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "STANDIN_VIDEO",
    need: "optional",
    kind: "string",
    purpose: "IK3: `fail` makes the stand-in video renderer fail every job, so a test stack reaches the failed state and Ask again; PROVIDERS=standin binds the stand-in renderer (a small marked file); tests and verifier stacks only, refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "INTERNAL_TOKEN",
    need: "always",
    kind: "secret",
    purpose: "shared secret an internal route needs in the x-internal-token header (32 or more characters)",
  },
  {
    name: "TRUST_PROXY_HOPS",
    need: "optional",
    kind: "int",
    purpose: "proxies in front of the API trusted for the client address (V4); 0 reads the socket address, 1 behind one load balancer",
    default: "0",
  },
  {
    name: "PORT_TIMEOUTS_MS",
    need: "optional",
    kind: "string",
    purpose: "time limit of one call to a provider port, as port=milliseconds pairs (FF1); payments 10000 unless changed",
  },
  {
    name: "JSON_BODY_LIMIT_BYTES",
    need: "optional",
    kind: "int",
    purpose: "the largest JSON body the API reads, in bytes (JJ1); 512 KB, above the 256 KB wish content limit so an oversize wish gets the service's 422",
    default: "524288",
  },
];

/**
 * Runtime-only variables: none now. NODE_ENV, PORT, PROVIDERS and INTERNAL_TOKEN moved into the manifest (build/sweeps/api.md),
 * with TRUST_PROXY_HOPS (V4).
 */
export const RUNTIME_VARS: readonly VarSpec[] = [];

export const ENV_SCHEMA: readonly VarSpec[] = [...MANIFEST_VARS, ...RUNTIME_VARS];
