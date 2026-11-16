#!/usr/bin/env node
// Routes gate: every endpoint in .pipeline/registry.json has a route, and every route has a registry endpoint.
// Builds the app the way the tests do (test/kit/app.ts, stand-in providers, no listening port) in a database of its own
// (prefix TEST_DB_PREFIX, default fw), reads the router, and prints three lists:
//   MISSING   in the registry, no route (id, method, path, resource)
//   EXTRA     a route with no registry endpoint
//   MISMATCH  the path exists on both sides but with another method
// Registry endpoints with method INTERNAL are ports, not routes, and are left out of the comparison.
// Exit 1 when MISSING or EXTRA is not empty, except entries in build/baselines/routes-missing.txt (the lead owns that file):
// one per line, `id or "METHOD path" | reason | owner: lead`. A baseline line that no longer applies also fails.
// Never edit this file to get a pass.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, dropDb } from "./db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Routes the conventions allow without a registry endpoint (kernel routes). "METHOD path", params as :p.
const ALLOWED_EXTRA = new Map([
  ["GET /v1/health", "kernel: liveness and readiness probe for the host"],
]);

// Load .ts files the way ts-jest does (CommonJS, decorators), without a build step.
const ts = require("typescript");
const Module = require("node:module");
const cfg = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile).config.compilerOptions;
const options = { ...ts.convertCompilerOptionsFromJson(cfg, ROOT).options, sourceMap: false, inlineSourceMap: false };
Module._extensions[".ts"] = (mod, file) => {
  const out = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: options, fileName: file });
  mod._compile(out.outputText, file);
};

const norm = (p) => {
  const s = p.replace(/:[A-Za-z0-9_]+/g, ":p").replace(/\/+/g, "/");
  return s.length > 1 ? s.replace(/\/$/, "") : s;
};

const prefix = process.env.TEST_DB_PREFIX || "fw";
const dbName = `${prefix}_test_routes_${process.pid}`;
let code = 1;
let app;
try {
  process.env.DATABASE_URL = createDb(dbName, prefix);
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const { standinEnv } = require(join(ROOT, "test/kit/env.ts"));
  for (const [k, v] of Object.entries(standinEnv())) if (process.env[k] === undefined || k === "PROVIDERS" || k === "NODE_ENV") process.env[k] = v;
  const { createTestApp } = require(join(ROOT, "test/kit/app.ts"));
  app = await createTestApp();
  const router = app.app.getHttpAdapter().getInstance().router;
  const routes = new Map(); // "METHOD path" -> true
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) {
      if (layer.route.methods[m] && m !== "_all") routes.set(`${m.toUpperCase()} ${norm(layer.route.path)}`, true);
    }
  }

  const registry = JSON.parse(readFileSync(join(ROOT, ".pipeline/registry.json"), "utf8"));
  const all = registry.resources.flatMap((r) => r.endpoints.map((e) => ({ ...e, resource: r.name })));
  // method INTERNAL (path "port:<resource>#<name>") is a call inside the app, not an HTTP route: it is counted, never expected as a route.
  const endpoints = all.filter((e) => e.method.toUpperCase() !== "INTERNAL");
  const internal = all.length - endpoints.length;
  const keyOf = (e) => `${e.method.toUpperCase()} ${norm(e.path)}`;
  const regKeys = new Set(endpoints.map(keyOf));
  const regPaths = new Map();
  for (const e of endpoints) regPaths.set(norm(e.path), [...(regPaths.get(norm(e.path)) ?? []), e.method.toUpperCase()]);
  const routePaths = new Map();
  for (const k of routes.keys()) {
    const [m, p] = k.split(" ");
    routePaths.set(p, [...(routePaths.get(p) ?? []), m]);
  }

  const missing = endpoints.filter((e) => !routes.has(keyOf(e)));
  const extra = [...routes.keys()].filter((k) => !regKeys.has(k) && !ALLOWED_EXTRA.has(k));
  const mismatch = [];
  for (const e of missing) {
    const have = routePaths.get(norm(e.path));
    if (have) mismatch.push(`${e.id} ${e.method} ${e.path}: the app has ${have.join(", ")} here`);
  }
  for (const k of extra) {
    const [m, p] = k.split(" ");
    const reg = regPaths.get(p);
    if (reg) mismatch.push(`${k}: the registry has ${reg.join(", ")} here`);
  }

  console.log(`registry endpoints ${all.length} (${endpoints.length} HTTP, ${internal} INTERNAL ports with no route), routes ${routes.size}, allowed extras ${ALLOWED_EXTRA.size}`);
  console.log(`MISSING (${missing.length})`);
  for (const e of missing) console.log(`  ${e.id} ${e.method} ${e.path} [${e.resource}]`);
  console.log(`EXTRA (${extra.length})`);
  for (const k of extra) console.log(`  ${k}`);
  console.log(`MISMATCH (${mismatch.length})`);
  for (const l of mismatch) console.log(`  ${l}`);

  // baseline: the lead's file
  const bfile = join(ROOT, "build/baselines/routes-missing.txt");
  const base = existsSync(bfile)
    ? readFileSync(bfile, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split("|")[0].trim())
    : [];
  const open = new Set([...missing.map((e) => e.id), ...missing.map(keyOf), ...extra]);
  const unbaselined = [...missing.filter((e) => !base.includes(e.id) && !base.includes(keyOf(e))).map((e) => `MISSING ${e.id} ${keyOf(e)}`), ...extra.filter((k) => !base.includes(k)).map((k) => `EXTRA ${k}`)];
  const stale = base.filter((b) => !open.has(b));
  for (const s of stale) console.log(`BASELINE no longer applies: ${s}`);
  console.log(unbaselined.length || stale.length ? `GATE FAIL: routes (${unbaselined.length} not in the baseline, ${stale.length} stale baseline lines)` : "gate ok: routes");
  code = unbaselined.length || stale.length ? 1 : 0;
} catch (e) {
  console.error(e);
} finally {
  try { await app?.close(); } catch { /* closing only */ }
  try { dropDb(dbName); } catch { /* reported by the next create */ }
}
process.exit(code);
