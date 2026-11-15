import { ENV_SCHEMA, Kind, VarSpec } from "./env.schema";

/** The validated environment. Values are strings unless noted; absent optional values are undefined. */
export interface Env {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  PROVIDERS: "live" | "standin";
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
  MAIL_FROM?: string;
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

  if (out.NODE_ENV === "production" && providers === "standin") {
    problems.push({ name: "PROVIDERS", problem: "standin is refused when NODE_ENV=production" });
  }
  if (problems.length) throw new EnvError(problems);
  return out as unknown as Env;
}
