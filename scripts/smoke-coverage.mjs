#!/usr/bin/env node
// Coverage of the registry by the specs: for every endpoint in .pipeline/registry.json (method INTERNAL ports left out), is there a spec
// (any .ts file under src/**/tests or test/) that calls that method and path at least once? It reads the specs as text: every string
// literal that contains a /v1/ path is a call, its method is the nearest get/post/put/patch/delete (or "GET" ...) just before it, and a
// ${...} in the path or a :param in the registry matches one segment. Lists the endpoints no spec calls. It writes no spec.
//   node scripts/smoke-coverage.mjs [--strict]     --strict exits 1 when any endpoint is uncalled (default: report only, exit 0)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
const walk = (dir) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== "node_modules") walk(p); }
    else if (d.name.endsWith(".ts") && (/[\\/]tests?[\\/]/.test(p) || d.name.endsWith(".spec.ts"))) files.push(p);
  }
};
walk(join(ROOT, "src"));
walk(join(ROOT, "test"));

const segs = (p) => p.split("?")[0].replace(/\/+$/, "").split("/").filter(Boolean).map((s) => (/^:|^\$\{/.test(s) || /\$\{/.test(s) ? ":p" : s));
const calls = []; // { method|null, segs, file }
const LIT = /(`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  let m;
  // a path kept in a variable: const url = `/v1/x/${id}/y`;  then  .post(url)  or  .patch(`${url}/z`)
  for (const v of text.matchAll(/(?:const|let)\s+([A-Za-z_]\w*)\s*(?::\s*string\s*)?=\s*(`(?:[^`\\]|\\.)*`|"[^"\n]*"|'[^'\n]*')/g)) {
    const lit = v[2].slice(1, -1);
    const k = lit.indexOf("/v1/");
    if (k < 0) continue;
    const name = v[1], base = lit.slice(k);
    const use = new RegExp(`(?:\\.|\\b)(get|post|put|patch|delete|del)[A-Za-z]*\\s*(?:<[^>]*>)?\\(\\s*(?:[A-Za-z_.]+\\s*,\\s*)?(?:\`\\$\\{${name}\\}([^\`]*)\`|${name}\\b)`, "gi");
    for (const u of text.matchAll(use)) calls.push({ method: u[1].toUpperCase().replace(/^DEL$/, "DELETE"), segs: segs(base + (u[2] || "")), file: relative(ROOT, f) });
  }
  while ((m = LIT.exec(text))) {
    const lit = m[1].slice(1, -1);
    const i = lit.indexOf("/v1/");
    const bare = i < 0 && /^\/[a-z]/.test(lit); // a helper that adds the /v1 itself: post(c, "/studio/styles")
    if (i < 0 && !bare && !lit.endsWith("/v1")) continue;
    const path = bare ? `/v1${lit}` : lit.slice(i);
    const before = text.slice(Math.max(0, m.index - 90), m.index);
    let method = null;
    const a = [...before.matchAll(/(?:\.|\b)(get|post|put|patch|delete|del)[A-Za-z]*\s*(?:<[^>]*>)?\(\s*(?:[A-Za-z_.]+\s*,\s*)?$/gi)];
    const b = [...before.matchAll(/["'`](GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*$/g)];
    const c = [...before.matchAll(/method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]/gi)];
    if (bare && !a.length) continue; // a bare "/x" string that is no call of a helper is not a route call
    if (a.length) method = a[a.length - 1][1];
    else if (b.length) method = b[b.length - 1][1];
    else if (c.length) method = c[c.length - 1][1];
    if (!method) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
      const d2 = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE)/i.exec(after);
      if (d2) method = d2[1];
    }
    if (method) method = method.toUpperCase().replace(/^DEL$/, "DELETE");
    calls.push({ method, segs: segs(path), file: relative(ROOT, f) });
  }
}

const matches = (reg, call) => reg.length === call.length && reg.every((s, i) => s === call[i] || s === ":p" || call[i] === ":p");
const registry = JSON.parse(readFileSync(join(ROOT, ".pipeline/registry.json"), "utf8"));
const all = registry.resources.flatMap((r) => r.endpoints.map((e) => ({ ...e, resource: r.name })));
const eps = all.filter((e) => e.method.toUpperCase() !== "INTERNAL");
const uncalled = [], weak = [];
for (const e of eps) {
  const rs = segs(e.path.replace(/:[A-Za-z0-9_]+/g, ":p"));
  const method = e.method.toUpperCase();
  const hits = calls.filter((c) => matches(rs, c.segs));
  if (hits.some((c) => c.method === method)) continue;
  if (hits.some((c) => c.method === null)) { weak.push(e); continue; }
  uncalled.push(e);
}
console.log(`registry endpoints: ${all.length} (${all.length - eps.length} INTERNAL ports left out), HTTP ${eps.length}; spec files read: ${files.length}; calls found: ${calls.length}`);
console.log(`called by a spec: ${eps.length - uncalled.length - weak.length}; path called but method not read from the text: ${weak.length}; no spec calls it: ${uncalled.length}`);
for (const e of uncalled) console.log(`UNCALLED ${e.id} ${e.method} ${e.path} (${e.resource})`);
for (const e of weak) console.log(`UNSURE   ${e.id} ${e.method} ${e.path} (${e.resource})`);
process.exit(process.argv.includes("--strict") && uncalled.length ? 1 : 0);
