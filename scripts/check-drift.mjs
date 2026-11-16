#!/usr/bin/env node
// Drift check: migrate a fresh database, diff it against prisma/schema.prisma, and allow only DROP TABLE
// statements (and drops of their own indexes, constraints, sequences, enum types) for tables listed in
// build/baselines/drift-tables.txt (raw-SQL tables that have no Prisma model yet). The list may only shrink.
//   node scripts/check-drift.mjs
// Uses PG_ADMIN_URL and TEST_DB_PREFIX (default "fw") like scripts/db.mjs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, dropDb, urlFor } from "./db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "build/baselines/drift-tables.txt");
const prefix = process.env.TEST_DB_PREFIX || "fw";
const dbName = `${prefix}_test_drift_${process.pid}`;

function readBaseline() {
  return readFileSync(BASELINE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("|")[0].trim());
}

// Split a Prisma migrate-diff script into statements (statements end with ";" at end of line; comments start with "--").
function statements(script) {
  const out = [];
  let cur = [];
  for (const line of script.split("\n")) {
    if (line.startsWith("--") && cur.length === 0) continue;
    if (!line.trim() && cur.length === 0) continue;
    cur.push(line);
    if (line.trimEnd().endsWith(";")) {
      out.push(cur.join("\n").trim());
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join("\n").trim());
  return out;
}

const ident = (s) => s.replace(/"/g, "");

function run() {
  const baseline = new Set(readBaseline());
  createDb(dbName, prefix);
  const url = urlFor(dbName);
  const script = execFileSync(
    join(ROOT, "node_modules/.bin/prisma"),
    ["migrate", "diff", "--from-url", url, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const bad = [];
  const dropped = new Set();
  const dropStmts = [];
  for (const s of statements(script)) {
    if (/^-- This is an empty migration\.?$/m.test(s) && !/[A-Z]/.test(s.replace(/--.*$/gm, ""))) continue;
    const t = s.replace(/^--.*$/gm, "").trim();
    if (!t) continue;
    const m = /^DROP TABLE "(?:public"\.")?([^"]+)"(?: CASCADE)?;$/.exec(t);
    if (m) {
      dropped.add(m[1]);
      dropStmts.push({ table: m[1], s });
      continue;
    }
    // Drops of indexes, constraints, sequences or enum types that belong to a table dropped here are accepted below.
    if (/^(DROP INDEX|ALTER TABLE "[^"]+" DROP CONSTRAINT|DROP SEQUENCE|DROP TYPE)\b/.test(t)) dropStmts.push({ other: true, t, s });
    else bad.push(s);
  }
  for (const d of dropStmts) {
    if (d.table) {
      if (!baseline.has(d.table)) bad.push(d.s);
    } else {
      const am = /^ALTER TABLE "([^"]+)" DROP CONSTRAINT/.exec(d.t);
      if (am) {
        if (!baseline.has(am[1])) bad.push(d.s);
      } else if (/^DROP INDEX/.test(d.t)) {
        // An index of a baseline table goes with its table; a lone DROP INDEX on a modelled table is drift.
        const owner = indexOwner(url, ident(d.t.replace(/^DROP INDEX\s+(?:IF EXISTS\s+)?/, "").replace(/;$/, "")));
        if (!owner || !baseline.has(owner)) bad.push(d.s);
      } else if (!enumOrSeqOfBaseline(d.t, dropped, url)) bad.push(d.s);
    }
  }
  const stale = [...baseline].filter((t) => !dropped.has(t));
  return { bad, stale };
}

function psqlOne(url, sql) {
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-qtAc", sql], { encoding: "utf8" }).trim();
}

function indexOwner(url, name) {
  name = name.replace(/^public\./, "");
  return psqlOne(url, `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_class x ON x.oid=i.indexrelid WHERE x.relname='${name.replace(/'/g, "''")}'`) || null;
}

// A DROP TYPE or DROP SEQUENCE is fine when every column using it belongs to a baseline table dropped in this diff.
function enumOrSeqOfBaseline(t, dropped, url) {
  const m = /^DROP (TYPE|SEQUENCE) "?(?:public"?\.")?([^";]+)"?;$/.exec(t);
  if (!m) return false;
  const name = m[2];
  const sql =
    m[1] === "TYPE"
      ? `SELECT DISTINCT c.relname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type ty ON ty.oid=a.atttypid LEFT JOIN pg_type el ON el.oid=ty.typelem WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind='r' AND c.relnamespace='public'::regnamespace AND (ty.typname='${name}' OR el.typname='${name}')`
      : `SELECT DISTINCT c.relname FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S' JOIN pg_class c ON c.oid=d.refobjid WHERE s.relname='${name}'`;
  const users = psqlOne(url, sql).split("\n").filter(Boolean);
  return users.length > 0 && users.every((u) => dropped.has(u));
}

let code = 0;
try {
  const { bad, stale } = run();
  for (const s of bad) console.error(`DRIFT not allowed:\n${s}\n`);
  for (const t of stale) console.error(`Baseline table "${t}" no longer drifts: remove it from build/baselines/drift-tables.txt`);
  if (bad.length || stale.length) code = 1;
  else console.log("check-drift: ok (only baseline raw-SQL tables differ from schema.prisma)");
} catch (e) {
  console.error(String(e.stderr || e.message || e).trim());
  code = 1;
} finally {
  try { dropDb(dbName); } catch { /* best effort */ }
}
process.exit(code);
