#!/usr/bin/env node
// Runs every spec file by itself, one after another, each against a database made fresh for it (a copy of the migrated template),
// one jest worker. One line per spec: PASS, FAIL or TIMEOUT with seconds. Exits 1 on any FAIL or TIMEOUT.
//   node scripts/smoke-alone.mjs [--timeout=<seconds>] [<spec path or directory>...]
// TEST_DB_PREFIX (default fw) names the databases: <prefix>_test_alone_<n>. A failing spec's output is kept in $SMOKE_LOG_DIR (default the OS temp dir).
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, dropDb } from "./db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const prefix = process.env.TEST_DB_PREFIX || "fw";
const logDir = process.env.SMOKE_LOG_DIR || join(tmpdir(), "fw-smoke-alone");
const args = process.argv.slice(2);
const timeoutS = Number((args.find((a) => a.startsWith("--timeout=")) || "--timeout=420").split("=")[1]);
const given = args.filter((a) => !a.startsWith("--"));

const specsUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.name === "node_modules" ? [] : d.isDirectory() ? specsUnder(join(dir, d.name)) : d.name.endsWith(".spec.ts") ? [join(dir, d.name)] : [],
  );
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const specs = (given.length ? given : ["src", "test"]).flatMap((p) => (isDir(p) ? specsUnder(p) : [p])).sort();

mkdirSync(logDir, { recursive: true });
let fails = 0, n = 0;
for (const spec of specs) {
  n += 1;
  const name = `${prefix}_test_alone_${process.pid}`;
  const t0 = Date.now();
  let status = "PASS", out = "";
  try {
    const url = createDb(name, prefix);
    const r = spawnSync(process.execPath, [join(ROOT, "node_modules/jest/bin/jest.js"), "--runTestsByPath", spec, "--runInBand"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: timeoutS * 1000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: url, REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379", NODE_ENV: "test", PROVIDERS: "standin" },
    });
    out = `${r.stdout || ""}\n${r.stderr || ""}`;
    if (r.error && r.error.code === "ETIMEDOUT") status = "TIMEOUT";
    else if (r.status !== 0) status = "FAIL";
  } catch (e) {
    status = "FAIL";
    out = String(e.stderr || e.message || e);
  } finally {
    try { dropDb(name); } catch { /* the next create remakes it */ }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const rel = relative(ROOT, spec);
  console.log(`${status} ${secs}s ${rel}`);
  if (status !== "PASS") {
    fails += 1;
    writeFileSync(join(logDir, `${rel.replace(/[\\/]/g, "__")}.log`), out);
  }
}
console.log(`smoke-alone: ${n} specs, ${fails} not passing`);
process.exit(fails ? 1 : 0);
