#!/usr/bin/env node
// Test databases. Every name must start with the prefix and contain "test"; nothing else is ever created or dropped.
//   node scripts/db.mjs template <prefix>        make or refresh <prefix>_test_template (migrated); prints its name
//   node scripts/db.mjs create <name> <prefix>   (re)make <name> as a copy of the template; prints its URL
//   node scripts/db.mjs drop <name>              drop <name>
// PG_ADMIN_URL (default postgresql://firstwish:firstwish@127.0.0.1:5432/postgres) must be a role that can create databases.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ADMIN_URL = process.env.PG_ADMIN_URL || "postgresql://firstwish:firstwish@127.0.0.1:5432/postgres";

function safe(name) {
  if (!/^[a-z0-9_]+$/.test(name) || !name.includes("test")) throw new Error(`Refusing database name "${name}": lowercase, digits, _ and must contain "test"`);
  return name;
}

function psql(sql) {
  return execFileSync("psql", [ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-qtAc", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function urlFor(name) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${safe(name)}`;
  return u.toString();
}

function migrationsHash() {
  const h = createHash("sha256");
  const walk = (dir) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(p.slice(ROOT.length)).update(readFileSync(p));
    }
  };
  h.update(readFileSync(join(ROOT, "prisma/schema.prisma")));
  walk(join(ROOT, "prisma/migrations"));
  return h.digest("hex").slice(0, 16);
}

function withLock(name, fn) {
  const lock = join(tmpdir(), `fw-db-${name}.lock`);
  const until = Date.now() + 120_000;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 120_000) unlinkSync(lock); // left by a killed run
      } catch { /* gone already */ }
      if (Date.now() > until) throw new Error(`Timed out waiting for ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  try {
    return fn();
  } finally {
    try { unlinkSync(lock); } catch { /* gone already */ }
  }
}

export function ensureTemplate(prefix) {
  const tmpl = safe(`${prefix}_test_template`);
  const want = `migrations:${migrationsHash()}`;
  return withLock(tmpl, () => {
    const have = psql(`SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '${tmpl}'`);
    if (have === want) return tmpl;
    psql(`DROP DATABASE IF EXISTS ${tmpl} WITH (FORCE)`);
    psql(`CREATE DATABASE ${tmpl}`);
    execFileSync(join(ROOT, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: urlFor(tmpl) },
      stdio: ["ignore", "ignore", "inherit"],
    });
    psql(`COMMENT ON DATABASE ${tmpl} IS '${want}'`);
    return tmpl;
  });
}

export function createDb(name, prefix) {
  if (!name.startsWith(prefix)) throw new Error(`Database ${name} must start with ${prefix}`);
  const tmpl = ensureTemplate(prefix);
  safe(name);
  return withLock(tmpl, () => {
    psql(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    psql(`CREATE DATABASE ${name} TEMPLATE ${tmpl}`);
    return urlFor(name);
  });
}

export function dropDb(name) {
  psql(`DROP DATABASE IF EXISTS ${safe(name)} WITH (FORCE)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === "template" && a) console.log(ensureTemplate(a));
    else if (cmd === "create" && a && b) console.log(createDb(a, b));
    else if (cmd === "drop" && a) dropDb(a);
    else {
      console.error("usage: db.mjs template <prefix> | create <name> <prefix> | drop <name>");
      process.exit(2);
    }
  } catch (e) {
    console.error(String(e.stderr || e.message || e).trim());
    process.exit(1);
  }
}
