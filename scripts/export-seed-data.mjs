#!/usr/bin/env node
// Exports the config catalogues the web app holds today as constants into prisma/seed-data/*.json (ruling Q11), so their
// GETs are never empty. The files are committed; scripts/seed.mjs reads them. Staff editing these lists is not built.
//   WEB_REPO=/path/to/Firstwish-web node scripts/export-seed-data.mjs      (default: ../Firstwish-web beside this repo)
// The web files are TypeScript: each is transpiled in memory with the API's own `typescript` and run in a sandboxed
// CommonJS loader. Package imports (react, next, ...) get an inert stand-in; nothing is fetched and nothing is written
// outside prisma/seed-data. SavedReply, Provider and MessageTemplate are owned by this repo (OWNED below): never read from the web. The source of every table is named in .pipeline/schema-map.json ("seedFrom").
// Running it twice writes the same bytes (keys sorted, rows in the web app's order).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(process.env.WEB_REPO || join(ROOT, "..", "Firstwish-web"));
const OUT = join(ROOT, "prisma/seed-data");
const ts = createRequire(import.meta.url)("typescript");

if (!existsSync(join(WEB, "lib/engine/registry.ts"))) {
  console.error(`No web repo at ${WEB} (set WEB_REPO).`);
  process.exit(1);
}

// ---------------------------------------------------------------- a small loader for the web app's TypeScript
const inert = () => {
  const f = function () { return inert(); };
  return new Proxy(f, {
    get: (_t, k) => (k === "__esModule" ? true : k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : inert()),
    apply: () => inert(),
    construct: () => inert(),
  });
};
const cache = new Map();
const readFiles = new Set(); // every web file read, for SOURCE.json
const readWeb = (file) => { readFiles.add(file); return readFileSync(file, "utf8"); };
function resolveFile(spec, from) {
  const base = spec.startsWith("@/") ? join(WEB, spec.slice(2)) : resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && /\.(ts|tsx)$/.test(c)) return c;
  }
  return null;
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const src = readWeb(file);
  const js = ts.transpileModule(src, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const req = (spec) => {
    if (/\.(css|scss|svg|png|jpg|webp|mp3|woff2?)$/.test(spec)) return {};
    if (spec.startsWith("@/") || spec.startsWith(".")) {
      const f = resolveFile(spec, file);
      return f ? load(f) : inert();
    }
    return inert(); // a package (react, next, ...): never run here
  };
  const fn = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {${js}\n})`, { filename: file });
  fn(mod.exports, req, mod, file, dirname(file));
  return mod.exports;
}
const web = (p) => load(join(WEB, p));

// ---------------------------------------------------------------- rows (plain JSON only)
const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "function" ? undefined : x)));
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, plain(o[k])]));

function endingPurposes() {
  // A type union in lib/engine/types.ts: each member carries its line as a comment.
  const src = readWeb(join(WEB, "lib/engine/types.ts"));
  const block = src.slice(src.indexOf("export type EndingPurpose ="), src.indexOf(";", src.indexOf("export type EndingPurpose =")) + 1);
  return [...block.matchAll(/\|\s*"([a-z-]+)"\s*(?:\/\/\s*(.*))?/g)].map((m) => ({ name: m[1], line: (m[2] || "").trim() }));
}

/** JSON with every object's keys sorted at every depth: two rows differing only in a nested field get different keys (GD3). */
const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

function chapterSpecs() {
  const { RECIPES } = web("lib/occasions.ts");
  const seen = new Map();
  for (const r of RECIPES) {
    for (const c of r.chapters) {
      const row = pick(c, ["type", "title", "heading", "line", "ask", "rule", "why"]);
      const k = stable(row);
      if (!seen.has(k)) seen.set(k, row);
    }
  }
  return [...seen.values()];
}

// A style's "get" (what its level gets you) is owned here since the web dropped its typed copy (lib/catalog.ts LEVEL_GET): it is
// taken from the committed Style.json row of the same slug, never from the web. A slug new to the web gets the "get" of its level's
// other house styles (the rule styles.service.ts getLineFor uses: the first house style of that level by slug with a "get") and is listed.
const committedGets = (() => {
  const f = join(OUT, "Style.json");
  return existsSync(f) ? new Map(JSON.parse(readFileSync(f, "utf8")).rows.map((r) => [r.slug, r.get])) : new Map();
})();
function withOwnedGet(rows) {
  const byLevel = new Map();
  for (const r of [...rows].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    const g = committedGets.get(r.slug);
    if (r.house && g != null && !byLevel.has(r.level)) byLevel.set(r.level, g);
  }
  return rows.map((r) => {
    if (committedGets.has(r.slug) && committedGets.get(r.slug) != null) return { ...r, get: committedGets.get(r.slug) };
    const g = byLevel.get(r.level);
    console.log(`Style ${r.slug}: new to the committed seed; "get" taken from the other ${r.level} house styles${g == null ? " (none: left out)" : ""}`);
    return g == null ? r : { ...r, get: g };
  });
}

const TABLES = {
  EndingPurpose: { from: "lib/engine/types.ts (EndingPurpose)", key: (r) => r.name, rows: endingPurposes },
  OpeningDef: {
    from: "lib/engine/registry.ts (OPENINGS)", key: (r) => r.name,
    rows: () => web("lib/engine/registry.ts").OPENINGS.map((o) => pick(o, ["name", "line", "lock", "fields"])),
  },
  ChapterSpec: { from: "lib/occasions.ts (RECIPES[].chapters, each distinct spec once)", key: (r) => `${r.type}:${createHash("sha256").update(JSON.stringify(r)).digest("hex").slice(0, 12)}`, rows: chapterSpecs },
  Moment: {
    from: "lib/engine/moments.ts (momentManifests())", key: (r) => r.slug,
    rows: () => web("lib/engine/moments.ts").momentManifests().map((m) => ({
      ...pick(m, ["slug", "name", "line", "kind", "serves", "fields", "kinds", "occasions", "dimension", "quiet", "from"]),
      level: m.level === undefined ? undefined : String(m.level), tags: plain(m.tags ?? null),
    })),
  },
  Template: {
    from: "lib/studio.ts (HOUSE)", key: (r) => r.base,
    rows: () => web("lib/studio.ts").HOUSE.map((t) => pick(t, ["name", "handle", "house", "base", "pace", "orientation", "dimension", "kinds", "mood", "line", "theme"])),
  },
  // B14: the server keeps slug, level, on/off, creator and counts (DEC-69); the copy rides along for the staff list. Levels
  // are each style's level as the app shows it today (lib/levels.ts levelOf, the manifests' own), never retyped.
  Style: {
    from: "lib/styles.ts (allStyles(), levels from lib/levels.ts)", key: (r) => r.slug,
    rows: () => {
      const { allStyles } = web("lib/styles.ts");
      const built = allStyles().map((s) => ({
        ...pick(s, ["slug", "name", "line", "feel", "say", "motion", "light", "look", "level", "tier", "pace", "orientation", "moves", "mood"]),
        dimension: s.manifest.dimension, kinds: plain(s.manifest.kinds), occasions: plain(s.manifest.occasions ?? null),
        by: s.manifest.creator, house: s.manifest.creator === "firstwish", packaged: true,
      }));
      return withOwnedGet(built);
    },
  },
};

/**
 * SampleWish (API-BASE-16, IJ1, IJ1a) was seeded once from the web's sample wishes; the web no longer holds them, so this script never
 * reads the web for it and never writes it: prisma/seed-data/SampleWish.json is the API's own data (as a style's "get" is). Present, it is
 * left as it is; missing, the run stops before writing anything. The files only these rows once read are not in SOURCE.json.
 */
const ONCE = ["SampleWish"];

/** Owned here since 17 Nov 2026 (the web's fixtures were removed): recorded in prisma/seed-data, never read from the web, never rewritten. */
const OWNED = ["MessageTemplate", "Provider", "SavedReply", "SampleWish"];
const OWNED_NOTE = "owned here since 17 Nov 2026 (the web's fixtures were removed)";
const OWNED_ONCE = new Set(ONCE);

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
for (const table of ONCE) {
  if (!existsSync(join(OUT, `${table}.json`))) {
    console.error(`${table}: prisma/seed-data/${table}.json is missing. That file is the API's own data (the web no longer holds the sample wishes): restore it from git (git checkout -- prisma/seed-data/${table}.json). Nothing was written.`);
    process.exit(1);
  }
}
mkdirSync(OUT, { recursive: true });
for (const [table, t] of Object.entries(TABLES)) {
  const rows = t.rows().map((r) => sortKeys(plain(r)));
  if (!rows.length) throw new Error(`${table}: the web app's ${t.from} gave no rows`);
  const keys = rows.map(t.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${table}: two rows share a key`);
  const doc = { table, from: `Firstwish-web ${t.from}`, rows: rows.map((r, i) => ({ seedKey: keys[i], ...r })) };
  writeFileSync(join(OUT, `${table}.json`), JSON.stringify(doc, null, 1) + "\n");
  console.log(`${table}: ${rows.length} rows from ${t.from}`);
}

const filesOfTables = [...readFiles];
for (const table of ONCE) console.log(`${table}: owned here since its first export, left as it is`);

// SOURCE.json: each web file read, its path relative to the web repo and the sha256 of its bytes. A test that has the web
// checkout compares these with the files, so a web change with no new export fails there.
const files = filesOfTables.map((f) => ({ path: f.slice(WEB.length + 1), sha256: createHash("sha256").update(readFileSync(f)).digest("hex") })).sort((a, b) => (a.path < b.path ? -1 : 1));
const owned = Object.fromEntries(OWNED.map((t) => {
  if (!existsSync(join(OUT, `${t}.json`))) throw new Error(`${t}: owned here, but prisma/seed-data/${t}.json is missing`);
  return [t, OWNED_ONCE.has(t) ? "seeded once from the web's sample wishes (API-BASE-16, IJ1), owned here since" : OWNED_NOTE];
}));
writeFileSync(join(OUT, "SOURCE.json"), JSON.stringify({ files, owned }, null, 1) + "\n");
console.log(`SOURCE.json: ${files.length} web files`);
