#!/usr/bin/env node
// Exports the config catalogues the web app holds today as constants into prisma/seed-data/*.json (ruling Q11), so their
// GETs are never empty. The files are committed; scripts/seed.mjs reads them. Staff editing these lists is not built.
//   WEB_REPO=/path/to/Firstwish-web node scripts/export-seed-data.mjs      (default: ../Firstwish-web beside this repo)
// The web files are TypeScript: each is transpiled in memory with the API's own `typescript` and run in a sandboxed
// CommonJS loader. Package imports (react, next, ...) get an inert stand-in; nothing is fetched and nothing is written
// outside prisma/seed-data. The source of every table is named in .pipeline/schema-map.json ("seedFrom").
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
  const src = readFileSync(file, "utf8");
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
  const src = readFileSync(join(WEB, "lib/engine/types.ts"), "utf8");
  const block = src.slice(src.indexOf("export type EndingPurpose ="), src.indexOf(";", src.indexOf("export type EndingPurpose =")) + 1);
  return [...block.matchAll(/\|\s*"([a-z-]+)"\s*(?:\/\/\s*(.*))?/g)].map((m) => ({ name: m[1], line: (m[2] || "").trim() }));
}

function chapterSpecs() {
  const { RECIPES } = web("lib/occasions.ts");
  const seen = new Map();
  for (const r of RECIPES) {
    for (const c of r.chapters) {
      const row = pick(c, ["type", "title", "heading", "line", "ask", "rule", "why"]);
      const k = JSON.stringify(row, Object.keys(row).sort());
      if (!seen.has(k)) seen.set(k, row);
    }
  }
  return [...seen.values()];
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
      return allStyles().map((s) => ({
        ...pick(s, ["slug", "name", "line", "feel", "say", "motion", "light", "look", "level", "tier", "get", "pace", "orientation", "moves", "mood"]),
        dimension: s.manifest.dimension, kinds: plain(s.manifest.kinds), occasions: plain(s.manifest.occasions ?? null),
        by: s.manifest.creator, house: s.manifest.creator === "firstwish", packaged: true,
      }));
    },
  },
  SavedReply: {
    from: "lib/admin/d-fixtures.ts (savedReplies)", key: (r) => r.name,
    rows: () => web("lib/admin/d-fixtures.ts").savedReplies.map((s) => pick(s, ["name", "text"])),
  },
  Provider: {
    from: "lib/admin/d-fixtures.ts (settings.providers)", key: (r) => r.key,
    rows: () => web("lib/admin/d-fixtures.ts").settings.providers.map((p) => pick(p, ["key", "name", "who", "state", "line"])),
  },
  MessageTemplate: {
    from: "lib/admin/d-fixtures.ts (templates)", key: (r) => `${r.key}:${r.locale}:${r.version}`,
    // INT-4: the staff invite has its own wording (plain short words); the web app's fixtures hold no such message.
    rows: () => web("lib/admin/d-fixtures.ts").templates.map((t) => ({ key: t.key, channel: "email", locale: "en-NG", version: 1, subject: t.subject, body: t.body })).concat([INVITE]),
  },
};

/** The staff invite (INT-4): a sign-in code with its own lead line. Wording the owner's rules allow: plain short words, no emoji. */
const INVITE = {
  key: "invite", channel: "email", locale: "en-NG", version: 1,
  subject: "You are invited to the Firstwish team",
  body: "Hi,\n\nYou are invited to the Firstwish team. Use this code to sign in: {code}. It works for 10 minutes.\n\nIf you did not expect this, you can leave this email.\n\nFirstwish",
};

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
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
