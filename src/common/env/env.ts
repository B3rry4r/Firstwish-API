import { ENV_SCHEMA, Kind, VarSpec } from "./env.schema";
import { parsePortTimeouts } from "../ports/time-limit";

/** The validated environment. Values are strings unless noted; absent optional values are undefined. */
export interface Env {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  PROVIDERS: "live" | "standin";
  STANDIN_MAIL_OUTBOX?: string;
  /** HP6: seconds added to the stand-in clock (read at boot); tests and verifier stacks only. */
  STANDIN_CLOCK_OFFSET?: string;
  /** IF9: rules for the stand-in screening by file name (hold:<text>, reject:<text>); tests and verifier stacks only. */
  STANDIN_SCREENING?: string;
  INTERNAL_TOKEN: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  REFRESH_TOKEN_PEPPER: string;
  AUTH_CODE_PEPPER: string;
  COOKIE_DOMAIN: string;
  WEB_ORIGINS: string[];
  PUBLIC_SITE_URL: string;
  API_PUBLIC_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  STAFF_BOOTSTRAP_OWNER_EMAIL?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PUBLIC_KEY?: string;
  PAYSTACK_CALLBACK_URL?: string;
  STORAGE_DRIVER?: "r2" | "spaces";
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  SPACES_ENDPOINT?: string;
  SPACES_REGION?: string;
  SPACES_ACCESS_KEY_ID?: string;
  SPACES_SECRET_ACCESS_KEY?: string;
  SPACES_BUCKET?: string;
  SCREENING_PROVIDER?: "basic";
  SCREENING_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  RENDER_CONCURRENCY: number;
  RESEND_API_KEY?: string;
  /** YY3: the svix signing secret of Resend's webhook stream (delivery news and received mail); the guard's `resend` provider checks it. */
  RESEND_WEBHOOK_SECRET?: string;
  MAIL_FROM?: string;
  /** V4: proxies trusted for the client address; 0 reads the socket address. */
  TRUST_PROXY_HOPS: number;
  /** FF1: port=milliseconds pairs that change a provider port's time limit (see ports/time-limit.ts). */
  PORT_TIMEOUTS_MS?: string;
  /** JJ1: the largest JSON body the API reads, in bytes. It must stay above the wish content limit so an oversize wish gets the service's 422, not a bare 413. */
  JSON_BODY_LIMIT_BYTES: number;
}

/** Raised when the environment is incomplete or wrong. The message names every bad variable. */
export class EnvError extends Error {
  constructor(readonly problems: { name: string; problem: string }[]) {
    super(
      "The API cannot start. Fix these environment variables:\n" +
        problems.map((p) => `  ${p.name}: ${p.problem}`).join("\n"),
    );
    this.name = "EnvError";
  }
}

const MIN_SECRET_LENGTH = 32;
const MIN_PAYSTACK_KEY_LENGTH = 20;

function checkKind(kind: Kind, value: string): string | null {
  if (typeof kind === "object") return kind.oneOf.includes(value) ? null : `must be one of ${kind.oneOf.join(", ")}`;
  switch (kind) {
    case "string":
      return null;
    case "secret":
      return value.length >= MIN_SECRET_LENGTH ? null : `must be at least ${MIN_SECRET_LENGTH} characters`;
    case "int":
      return /^\d+$/.test(value) ? null : "must be a whole number";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "must be an email address";
    case "url":
      return isUrl(value) ? null : "must be a URL";
    case "urlList":
      return value.split(",").every((v) => isUrl(v.trim())) ? null : "must be a comma-separated list of URLs";
  }
}

function isUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function required(spec: VarSpec, providers: string, storage: string | undefined): boolean {
  switch (spec.need) {
    case "always":
      return true;
    case "optional":
      return false;
    case "live":
      return providers === "live";
    case "r2":
    case "spaces":
      return providers === "live" && storage === spec.need;
  }
}

/**
 * Reads and validates the environment. Throws EnvError naming each missing or malformed variable.
 * Empty strings count as missing.
 */
export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const get = (name: string): string | undefined => {
    const v = raw[name];
    return v === undefined || v.trim() === "" ? undefined : v.trim();
  };
  const providers = get("PROVIDERS") ?? "live";
  const storage = get("STORAGE_DRIVER");
  const problems: { name: string; problem: string }[] = [];
  const out: Record<string, unknown> = {};

  for (const spec of ENV_SCHEMA) {
    const value = get(spec.name) ?? spec.default;
    if (value === undefined) {
      if (required(spec, providers, storage)) problems.push({ name: spec.name, problem: `missing (${spec.purpose})` });
      continue;
    }
    const bad = checkKind(spec.kind, value);
    if (bad) {
      problems.push({ name: spec.name, problem: bad });
      continue;
    }
    if (spec.kind === "int") out[spec.name] = Number.parseInt(value, 10);
    else if (spec.kind === "urlList") out[spec.name] = value.split(",").map((v) => v.trim().replace(/\/$/, ""));
    else out[spec.name] = value;
  }

  // FF6: a live Paystack key is long; one shorter than 20 characters is a typo or a test key, and boot refuses it.
  const paystack = out.PAYSTACK_SECRET_KEY;
  if (providers === "live" && typeof paystack === "string" && paystack.length < MIN_PAYSTACK_KEY_LENGTH) {
    problems.push({ name: "PAYSTACK_SECRET_KEY", problem: `must be at least ${MIN_PAYSTACK_KEY_LENGTH} characters in live mode` });
  }
  const timeouts = parsePortTimeouts(typeof out.PORT_TIMEOUTS_MS === "string" ? out.PORT_TIMEOUTS_MS : undefined);
  if (timeouts.problem) problems.push({ name: "PORT_TIMEOUTS_MS", problem: timeouts.problem });
  if (out.NODE_ENV === "production" && providers === "standin") {
    problems.push({ name: "PROVIDERS", problem: "standin is refused when NODE_ENV=production" });
  }
  // HK1: the stand-in email's outbox file is for tests only: never with the real email provider, never in production.
  if (get("STANDIN_MAIL_OUTBOX") !== undefined && (providers !== "standin" || out.NODE_ENV === "production")) {
    problems.push({ name: "STANDIN_MAIL_OUTBOX", problem: "refused: it is for the stand-in email only (needs PROVIDERS=standin and a NODE_ENV other than production)" });
  }
  // HP6: the clock offset moves time, so it is never allowed where real money or real people are: not with live providers, not in production.
  const offset = get("STANDIN_CLOCK_OFFSET");
  if (offset !== undefined) {
    if (providers !== "standin" || out.NODE_ENV === "production") {
      problems.push({ name: "STANDIN_CLOCK_OFFSET", problem: "refused: it moves the stand-in clock only (needs PROVIDERS=standin and a NODE_ENV other than production)" });
    } else if (!/^-?\d{1,10}$/.test(offset)) {
      problems.push({ name: "STANDIN_CLOCK_OFFSET", problem: "must be a whole number of seconds, for example 86400" });
    }
  }
  // IF9: the stand-in screening's rules by file name decide what is held or refused, so they are never allowed where real files arrive: not with live providers, not in production.
  const screening = get("STANDIN_SCREENING");
  if (screening !== undefined) {
    if (providers !== "standin" || out.NODE_ENV === "production") {
      problems.push({ name: "STANDIN_SCREENING", problem: "refused: it drives the stand-in screening only (needs PROVIDERS=standin and a NODE_ENV other than production)" });
    } else if (!parseScreeningRules(screening)) {
      problems.push({ name: "STANDIN_SCREENING", problem: "must be a comma list of hold:<part of a file name> or reject:<part of a file name>, for example hold:held,reject:refused" });
    }
  }
  if (problems.length) throw new EnvError(problems);
  return out as unknown as Env;
}

export interface ScreeningRule {
  action: "hold" | "reject";
  /** lower case, a part of a file name */
  text: string;
}

/** IF9: "hold:held,reject:refused" as rules; null when a rule is not of that shape (an action, a colon, 1 to 40 of a-z 0-9 . _ -). */
export function parseScreeningRules(raw: string): ScreeningRule[] | null {
  const rules: ScreeningRule[] = [];
  for (const part of raw.split(",")) {
    const m = /^\s*(hold|reject):([A-Za-z0-9._-]{1,40})\s*$/.exec(part);
    if (!m) return null;
    rules.push({ action: m[1] as ScreeningRule["action"], text: m[2].toLowerCase() });
  }
  return rules;
}

/** IF9: the file name as the stand-in keeps it in a storage key: lower case, a-z 0-9 . _ - only, at most 60 characters. */
export function fileNameTag(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 60);
}
