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
  { name: "RENDER_CONCURRENCY", need: "optional", kind: "int", purpose: "how many videos one process renders at once (a real render needs about 1.5 GB). Not set: 1 with the real recorder, 2 with the stand-in", },
  { name: "RENDER_WEB_ORIGIN", need: "optional", kind: "url", purpose: "R6: the web address the video maker opens to play a wish (its /render page and /render-clock.js). Without it the video maker is off and the top tickets stay unsold" },
  { name: "RENDER_TOKEN_SECRET", need: "optional", kind: "secret", purpose: "R6: the secret that hashes the one-use token the video maker reads a wish with (32 characters or more). The video maker is off without it" },
  { name: "RENDER_CHROMIUM_PATH", need: "optional", kind: "string", purpose: "R6: the browser program the video maker starts to play a wish", default: "/usr/bin/google-chrome" },
  { name: "RENDER_FFMPEG_PATH", need: "optional", kind: "string", purpose: "R6: the ffmpeg program the video maker encodes with (ffprobe is looked up beside it)", default: "/usr/bin/ffmpeg" },
  { name: "RENDER_ADAPTER", need: "optional", kind: { oneOf: ["chromium"] }, purpose: "R6: `chromium` binds the real video maker even with PROVIDERS=standin (proofs on a machine with other providers on stand-ins). With PROVIDERS=live the real video maker is always chosen when it can work, and this name changes nothing (boot says so in the log)" },
  { name: "RENDER_STORAGE_HOSTS", need: "optional", kind: "string", purpose: "R6: extra storage host names (comma list) the video maker's browser may reach to load the wish's pictures; the storage endpoint already named is added by itself" },
  { name: "RENDER_ALLOWED_HOSTS", need: "optional", kind: "string", purpose: "R6: replaces the video maker browser's whole host list (comma list, host or host:port). Leave out: the web, the API, the storage hosts and the font hosts are allowed" },
  { name: "RENDER_CLOCK_PATH", need: "optional", kind: "string", purpose: "R6: a file holding the stepped clock's page script, read instead of the web's /render-clock.js (tests and proofs only)" },
  { name: "RENDER_CLOCK_SHA256", need: "optional", kind: "string", purpose: "R6: when set, the clock script the web serves must hash to this (hex sha256) or no video is recorded" },
  { name: "PROCESS_ROLE", need: "optional", kind: { oneOf: ["all", "web", "render-worker"] }, purpose: "R6: `all` (default: serves requests, runs every job, renders), `web` (serves requests and runs every job but renders; takes no render job) or `render-worker` (takes only render jobs; serves only a health address; `npm run start:render-worker`)", default: "all" },
  { name: "RENDER_WORKER_PORT", need: "optional", kind: "int", purpose: "R6: the health address port of a render-worker process (bound to 127.0.0.1)", default: "9091" },
  { name: "RENDER_TIME_LIMIT_SECONDS", need: "optional", kind: "int", purpose: "R6: the longest one video render may run, in seconds; the render's lease is longer than this and is renewed while frames still come", default: "1200" },
  { name: "RENDER_TOKEN_TTL_SECONDS", need: "optional", kind: "int", purpose: "R6: how long a render token lives, in seconds", default: "900" },
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
    purpose: "IK3: `fail` makes the stand-in video renderer fail every job, so a test stack reaches the failed state and Ask again; IK7: `hold` makes it wait, after writing its STANDIN_RENDER_TOKENS line, until the job's token is read (or the abort, or RENDER_STANDIN_HOLD_SECONDS), so a page can read while the job is rendering; PROVIDERS=standin binds the stand-in renderer (a small marked file); tests and verifier stacks only, refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "STANDIN_RENDER_TOKENS",
    need: "optional",
    kind: "string",
    purpose: "IK7: a file the stand-in video renderer appends each render's one-use token to, one JSON line (jobId, wishId, kind, width, height, seconds, token), created with mode 0600, so a test stack can drive the render page; test stacks only, refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "STANDIN_RENDER_HOLD_FILE",
    need: "optional",
    kind: "string",
    purpose: "IK7a: with STANDIN_VIDEO=hold, a render holds only if this file exists at the moment the render starts (a test makes it before its asks and removes it after); with no file the render is made at once; with the name not set, hold holds every render; test stacks only, refused with PROVIDERS=live or NODE_ENV=production",
  },
  {
    name: "RENDER_STANDIN_HOLD_SECONDS",
    need: "optional",
    kind: "int",
    purpose: "IK7: the most seconds the stand-in video renderer waits with STANDIN_VIDEO=hold before it writes its file; test stacks only",
    default: "120",
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
    purpose: "proxies in front of the API trusted for the client address (V4); 0 reads the socket address, 1 behind one load balancer. Behind a load balancer set it to 1 (the number of proxies): at 0 every caller seems to come from the balancer's own address, so one flood of wrong guesses at the public link or the render page would be counted against everyone, the video maker included. A render read by a right token has its own limit and does not depend on it",
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
