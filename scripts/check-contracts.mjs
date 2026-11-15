#!/usr/bin/env node
// Contracts gate. Exit 0 when clean, 1 with each finding listed. Never edit this file to get a pass.
//  1. registry.json's sha256 equals .pipeline/registry.lock.json (the registry is frozen).
//  2. every registry endpoint has a contract (a row in src/contracts/endpoints.ts and an entry in EndpointContracts).
//  3. every registry resource is classified in .pipeline/schema-map.json, and every table, config and document in it
//     exists in prisma/schema.prisma (a hosted document: its host model and column).
//  4. no Float or Decimal anywhere in the schema, and every money field stored is BigInt kobo.
//  5. (AA2) every String, String[] and Json column of Account and of every table with an owner key (a relation to Account,
//     Business or Creator) has an erase rule in schema-map.json: blank, or keep with its reason. Id columns are keys.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const findings = [];
const report = (name, list) => {
  if (list.length) {
    console.log(`GATE FAIL: ${name}`);
    for (const l of list.slice(0, 50)) console.log(`  ${l}`);
    findings.push(name);
  } else console.log(`gate ok: ${name}`);
};

// 1. frozen registry
const raw = readFileSync(join(ROOT, ".pipeline/registry.json"));
const lock = JSON.parse(read(".pipeline/registry.lock.json"));
const sha = createHash("sha256").update(raw).digest("hex");
report("registry.json matches registry.lock.json", sha === lock.registrySha256 ? [] : [`sha256 ${sha} != lock ${lock.registrySha256}`]);

const registry = JSON.parse(raw.toString("utf8"));
const endpoints = registry.resources.flatMap((r) => r.endpoints.map((e) => ({ ...e, resource: r.name })));

// 2. one contract per endpoint
const rows = read("src/contracts/endpoints.ts");
const types = read("src/contracts/types.ts");
const map = types.slice(types.indexOf("export interface EndpointContracts"));
const missing = [];
for (const e of endpoints) {
  const row = new RegExp(`\\{ id: "${e.id}", method: "${e.method}", path: ${JSON.stringify(e.path).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")},`);
  if (!row.test(rows)) missing.push(`${e.id} ${e.method} ${e.path}: no row in src/contracts/endpoints.ts`);
  if (!map.includes(`"${e.id}": {`)) missing.push(`${e.id}: not in EndpointContracts`);
}
const known = new Set(endpoints.map((e) => e.id));
for (const m of rows.matchAll(/id: "(E-\d+)"/g)) if (!known.has(m[1])) missing.push(`${m[1]}: a contract for an endpoint the registry does not have`);
report(`every registry endpoint (${endpoints.length}) has a contract`, missing);
const resMissing = registry.resources.filter((r) => !new RegExp(`export interface ${r.name} \\{`).test(types)).map((r) => `${r.name}: no resource shape`);
report(`every registry resource (${registry.resources.length}) has a shape`, resMissing);

// 3. schema-map against schema.prisma
const schemaMap = JSON.parse(read(".pipeline/schema-map.json")).resources;
const schema = read("prisma/schema.prisma");
const models = new Map();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const fields = new Map();
  for (const line of m[2].split("\n")) {
    const f = /^\s+(\w+)\s+([\w[\]?]+)/.exec(line);
    if (f) fields.set(f[1], f[2]);
  }
  models.set(m[1], fields);
}
const classes = new Set(["table", "view", "config", "document", "not-stored"]);
const mapProblems = [];
for (const r of registry.resources) {
  const c = schemaMap[r.name];
  if (!c) mapProblems.push(`${r.name}: not classified`);
  else if (!classes.has(c.class) || !c.reason) mapProblems.push(`${r.name}: class "${c.class}" or reason missing`);
}
for (const [name, c] of Object.entries(schemaMap)) {
  if (!registry.resources.some((r) => r.name === name)) mapProblems.push(`${name}: classified but not in the registry`);
  if (c.class === "table" || c.class === "config") {
    if (!models.has(name)) mapProblems.push(`${name} (${c.class}): no model in schema.prisma`);
  } else if (c.class === "document") {
    const [hm, hc] = (c.host || "").split(".");
    if (!models.get(hm)?.has(hc)) mapProblems.push(`${name} (document): host ${c.host} not in schema.prisma`);
  } else if (models.has(name)) mapProblems.push(`${name} (${c.class}): has a model but is not stored`);
}
report("every table, config and document in schema-map exists in schema.prisma", mapProblems);

// 4. money
const money = [];
for (const m of schema.matchAll(/^\s+(\w+)\s+(Float|Decimal)\b/gm)) money.push(`${m[1]}: ${m[2]}`);
for (const r of registry.resources) {
  const fields = models.get(r.name);
  if (!fields) continue;
  const alias = schemaMap[r.name]?.alias ?? {};
  for (const f of r.fields) {
    if (!(f.classes || []).includes("money-kobo")) continue;
    const col = alias[f.name] ?? f.name;
    const t = fields.get(col);
    if (t && t.replace("?", "") !== "BigInt") money.push(`${r.name}.${col}: ${t}, money must be BigInt kobo`);
  }
}
for (const [name, fields] of models) for (const [f, t] of fields) if (/kobo$/i.test(f) && t.replace("?", "") !== "BigInt") money.push(`${name}.${f}: ${t}`);
report("no Float or Decimal; money fields are BigInt kobo", money);

// 5. erase rules (AA2)
const erase = [];
const OWNERS = new Set(["Account", "Business", "Creator"]);
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const name = m[1];
  const owned = name === "Account" || [...m[2].matchAll(/^\s+\w+\s+(\w+)\??\s+@relation\("[^"]+", fields: \[/gm)].some((x) => OWNERS.has(x[1]));
  if (!owned) continue;
  const rules = schemaMap[name]?.erase ?? {};
  for (const [col, type] of models.get(name)) {
    if (!/^(String|Json)(\[\])?\??$/.test(type) || col === "id" || col.endsWith("Id")) continue;
    const r = rules[col];
    if (!r) erase.push(`${name}.${col}: no erase rule`);
    else if (r.rule !== "blank" && !(r.rule === "keep" && typeof r.why === "string" && r.why.trim())) erase.push(`${name}.${col}: rule must be blank, or keep with why`);
  }
}
report("every text and json column of an owned table has an erase rule (AA2)", erase);

process.exit(findings.length ? 1 : 0);
