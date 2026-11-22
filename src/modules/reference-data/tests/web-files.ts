import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import * as ts from "typescript";

/** The web app's own files, read straight from its lib folder (a small loader of this test's own, not the export script's). */
export const WEB_LIB = process.env.WEB_LIB || "/home/user/Firstwish-web/lib";
/** True where the web checkout is present (WEB_LIB set, or the default path). CI checks out this repository only, so there it is false. */
export const WEB_PRESENT = existsSync(join(WEB_LIB, "occasions.ts"));
/** Each file named in prisma/seed-data/SOURCE.json whose bytes no longer match the hash written at the last export. */
export function staleSources(seedDir: string): string[] {
  const { files } = JSON.parse(readFileSync(join(seedDir, "SOURCE.json"), "utf8")) as { files: { path: string; sha256: string }[] };
  const root = join(WEB_LIB, "..");
  return files.filter((f) => !existsSync(join(root, f.path)) || createHash("sha256").update(readFileSync(join(root, f.path))).digest("hex") !== f.sha256).map((f) => f.path);
}
const inert = (): object =>
  new Proxy(function () { return inert(); }, { get: (_t, k) => (k === "__esModule" ? true : k === "then" ? undefined : inert()), apply: () => inert(), construct: () => inert() });
const cache = new Map<string, { exports: Record<string, any> }>(); // eslint-disable-line @typescript-eslint/no-explicit-any

function pathOf(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(WEB_LIB, "..", spec.slice(2)) : resolve(dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((c) => /\.tsx?$/.test(c) && existsSync(c)) ?? null;
}

export function loadWeb(rel: string): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return loadFile(join(WEB_LIB, rel));
}
function loadFile(file: string): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const hit = cache.get(file);
  if (hit) return hit.exports;
  const mod = { exports: {} as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  cache.set(file, mod);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const req = (spec: string): unknown => {
    if (/\.(css|svg|png|jpg|webp|mp3|woff2?)$/.test(spec)) return {};
    if (spec.startsWith("@/") || spec.startsWith(".")) {
      const f = pathOf(spec, file);
      return f ? loadFile(f) : inert();
    }
    return inert();
  };
  (vm.runInThisContext(`(function (exports, require, module) {${js}\n})`, { filename: file }) as (e: unknown, r: unknown, m: unknown) => void)(mod.exports, req, mod);
  return mod.exports;
}

/**
 * The style rows the web still owns, built as scripts/export-seed-data.mjs builds them, WITHOUT `get`: a style's `get` (what its level gets you)
 * is owned by the API repo since the web dropped its typed copy (lib/catalog.ts LEVEL_GET), so it is checked against the rule, not the web.
 */
export function webStyleRows(): Record<string, unknown>[] {
  const keys = ["slug", "name", "line", "feel", "say", "motion", "light", "look", "level", "tier", "pace", "orientation", "moves", "mood"];
  const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "function" ? undefined : x)));
  type Manifest = { dimension: unknown; kinds: unknown; occasions?: unknown; creator: unknown };
  const all = (loadWeb("styles.ts").allStyles as () => unknown)() as (Record<string, unknown> & { manifest: Manifest })[];
  return all.map((s) => ({
    ...Object.fromEntries(keys.filter((k) => s[k] !== undefined).map((k) => [k, plain(s[k])])),
    dimension: s.manifest.dimension, kinds: plain(s.manifest.kinds), occasions: plain(s.manifest.occasions ?? null),
    by: s.manifest.creator, house: s.manifest.creator === "firstwish", packaged: true,
  }));
}
