#!/usr/bin/env node
// Runs specs against a fresh database copied from the migrated template, then drops it.
//   npm test                                  every spec
//   npm run test:affected -- <paths...>       only those specs; a directory runs every spec under it (U8); a source file runs
//                                             the specs that import it
// TEST_DB_PREFIX (default fw) names the databases: <prefix>_test_run_<pid>. Extra jest flags (starting with -) pass through.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, dropDb } from "./db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const prefix = process.env.TEST_DB_PREFIX || "fw";
const name = `${prefix}_test_run_${process.pid}`;
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("-"));
const specsUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.name === "node_modules" ? [] : d.isDirectory() ? specsUnder(join(dir, d.name)) : d.name.endsWith(".spec.ts") ? [join(dir, d.name)] : [],
  );
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const paths = args.filter((a) => !a.startsWith("-")).flatMap((p) => (isDir(p) ? specsUnder(p) : [p]));
if (args.some((a) => !a.startsWith("-")) && !paths.length) {
  console.error("No spec files under the paths given.");
  process.exit(1);
}

const jestArgs = [];
if (paths.length) jestArgs.push(paths.every((p) => p.endsWith(".spec.ts")) ? "--runTestsByPath" : "--findRelatedTests", ...paths);
if (!flags.some((f) => f.startsWith("--maxWorkers") || f === "-i" || f === "--runInBand")) jestArgs.push("--maxWorkers=2");
jestArgs.push(...flags);

let url;
try {
  url = createDb(name, prefix);
} catch (e) {
  console.error(`Could not make the test database ${name}: ${String(e.stderr || e.message || e).trim()}`);
  console.error("Is PostgreSQL running and PG_ADMIN_URL right? scripts/stack.sh up starts it locally.");
  process.exit(1);
}
const cleanup = () => {
  try { dropDb(name); } catch { /* reported by the next run's create */ }
};
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

const r = spawnSync(process.execPath, [join(ROOT, "node_modules/jest/bin/jest.js"), ...jestArgs], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379", NODE_ENV: "test", PROVIDERS: "standin" },
});
cleanup();
process.exit(r.status ?? 1);
