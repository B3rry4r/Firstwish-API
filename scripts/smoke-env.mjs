#!/usr/bin/env node
// Env manifest check (needs `npm run build`). For every variable in .pipeline/env-manifest.json it prints:
//   READ    which source files read it (outside the schema and its validator), or "nothing reads it"
//   PROD    whether the server refuses to start with NODE_ENV=production and that variable unset, starting from a complete valid
//           production environment (live providers, R2 storage; the Spaces variables are tried with STORAGE_DRIVER=spaces). It runs the
//           same loadEnv() that dist/main.js runs first, so the answer is the one a start gives.
// It also lists variables the code reads that the manifest does not list. No value printed here is a secret: they are made up.
//   node scripts/smoke-env.mjs
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { loadEnv } = require(join(ROOT, "dist/common/env/env.js"));
const manifest = JSON.parse(readFileSync(join(ROOT, ".pipeline/env-manifest.json"), "utf8")).vars;

const secret = "s".repeat(40);
const base = {
  NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/x", REDIS_URL: "redis://127.0.0.1:6379",
  JWT_ACCESS_SECRET: secret, REFRESH_TOKEN_PEPPER: secret, AUTH_CODE_PEPPER: secret, INTERNAL_TOKEN: secret,
  COOKIE_DOMAIN: "api.example.test", WEB_ORIGINS: "https://app.example.test", PUBLIC_SITE_URL: "https://app.example.test",
  API_PUBLIC_URL: "https://api.example.test", GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "g", GOOGLE_REDIRECT_URI: "https://api.example.test/cb",
  PAYSTACK_SECRET_KEY: "k".repeat(30), PAYSTACK_PUBLIC_KEY: "p", PAYSTACK_CALLBACK_URL: "https://app.example.test/paid",
  STORAGE_DRIVER: "r2", R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "a", R2_SECRET_ACCESS_KEY: "a", R2_BUCKET: "b",
  SCREENING_PROVIDER: "basic", ANTHROPIC_API_KEY: "a", ANTHROPIC_MODEL: "m", RESEND_API_KEY: "r", MAIL_FROM: "wishes@example.test",
};
const spacesExtra = { STORAGE_DRIVER: "spaces", SPACES_ENDPOINT: "https://sp.example.test", SPACES_REGION: "r", SPACES_ACCESS_KEY_ID: "a", SPACES_SECRET_ACCESS_KEY: "a", SPACES_BUCKET: "b" };
const tries = (env) => { try { loadEnv(env); return null; } catch (e) { return e; } };

const okBase = tries(base);
if (okBase) { console.error("the complete production environment is itself refused:", okBase.message); process.exit(2); }

const files = [];
const walk = (d) => { for (const x of readdirSync(d, { withFileTypes: true })) { const p = join(d, x.name); if (x.isDirectory()) { if (x.name !== "tests") walk(p); } else if (x.name.endsWith(".ts") && !x.name.endsWith(".spec.ts")) files.push(p); } };
walk(join(ROOT, "src"));
const skip = new Set(["src/common/env/env.schema.ts", "src/common/env/env.ts"]);
const text = files.filter((f) => !skip.has(relative(ROOT, f))).map((f) => [relative(ROOT, f), readFileSync(f, "utf8")]);
const envTs = readFileSync(join(ROOT, "src/common/env/env.ts"), "utf8");
const usedBy = (name) => {
  const direct = text.filter(([, t]) => t.includes(name)).map(([f]) => f);
  // read through the typed accessor env().NAME / this.env.NAME / config.NAME: the property name appears after a dot
  const viaProp = text.filter(([, t]) => new RegExp(`\\.${name}\\b`).test(t)).map(([f]) => f);
  return [...new Set([...direct, ...viaProp])];
};

for (const v of manifest) {
  const env = { ...base };
  if (/^SPACES_/.test(v.name)) Object.assign(env, spacesExtra);
  const withVar = tries(env);
  delete env[v.name];
  const e = tries(env);
  const refuses = e && e.problems && e.problems.some((p) => p.name === v.name) ? "REFUSES" : e ? "refuses (other)" : "starts";
  const users = usedBy(v.name);
  const readTxt = users.length ? users.slice(0, 3).join(", ") + (users.length > 3 ? ` (+${users.length - 3})` : "") : (envTs.includes(`out.${v.name}`) ? "only the validator" : "NOTHING READS IT");
  console.log(`${v.name.padEnd(28)} PROD unset: ${refuses.padEnd(8)} | READ: ${readTxt}${withVar ? " | (base with it is refused!)" : ""}`);
}
// PROVIDERS=standin is refused in production whatever else is set
const e2 = tries({ ...base, PROVIDERS: "standin" });
console.log(`PROVIDERS=standin with NODE_ENV=production: ${e2 ? "refused" : "STARTS"}`);
// code reads not in the manifest
const names = new Set(manifest.map((m) => m.name));
const seen = new Map();
for (const [f, t] of text) for (const m of t.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g)) { const n = m[1] || m[2]; if (!names.has(n)) seen.set(n, [...(seen.get(n) || []), f]); }
console.log(seen.size ? `READ BUT NOT IN THE MANIFEST: ${[...seen].map(([n, fs]) => `${n} (${[...new Set(fs)].join(", ")})`).join("; ")}` : "every process.env read in src is in the manifest");
