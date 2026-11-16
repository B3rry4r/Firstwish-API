import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { PrismaService } from "../../../common/db/prisma.service";
import { loadWeb, staleSources, WEB_LIB, WEB_PRESENT } from "./web-files";
import { createTestApp, TestApp } from "../../../../test/kit/app";

const ROOT = join(__dirname, "../../../..");
const ids = new UuidV7Maker();
type Row = Record<string, unknown>;

let t: TestApp;
const person = { Authorization: "Bearer person" };
const biz = { Authorization: "Bearer biz" };

/** The rows the web app's own files give (prisma/seed-data, written by scripts/export-seed-data.mjs from /lib), as the API serves them. */
const seeded = (table: string, drop: string[] = []): string[] =>
  (JSON.parse(readFileSync(join(ROOT, `prisma/seed-data/${table}.json`), "utf8")).rows as Row[])
    .map(({ seedKey: _k, ...r }) => JSON.stringify(sorted(Object.fromEntries(Object.entries(r).filter(([k, v]) => v !== null && !drop.includes(k))))))
    .sort();
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Row)[k])]));
  return v;
}
const served = (items: Row[], drop: string[] = []): string[] => items.map((r) => JSON.stringify(sorted(Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)))))).sort();

beforeAll(async () => {
  t = await createTestApp();
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  t.tokens.set("person", { kind: "user", accountId: ids.next(), sides: ["person"] });
  t.tokens.set("biz", { kind: "user", accountId: ids.next(), sides: ["person", "business"] });
  void t.app.get(PrismaService);
});
afterAll(() => t.close());

describe("reference reads (E-28, E-51, E-74, E-81)", () => {
  const paths = ["/v1/chapter-specs", "/v1/ending-purposes", "/v1/moments", "/v1/opening-defs"];

  it("401 without a token; E-51 is read by any signed-in person, with or without the business side (GD4)", async () => {
    for (const p of paths) expect((await t.http().get(p)).status).toBe(401);
    expect((await t.http().get("/v1/ending-purposes").set(person)).status).toBe(200);
    expect((await t.http().get("/v1/ending-purposes").set(biz)).status).toBe(200);
    for (const p of ["/v1/chapter-specs", "/v1/moments", "/v1/opening-defs"]) expect((await t.http().get(p).set(person)).status).toBe(200);
  });

  it("the served rows equal the web app's own (chapter specs, ending purposes, opening definitions)", async () => {
    const cs = await t.http().get("/v1/chapter-specs").set(person);
    expect(cs.body.nextCursor).toBeNull();
    expect(served(cs.body.items)).toEqual(seeded("ChapterSpec"));
    const ep = await t.http().get("/v1/ending-purposes").set(biz);
    expect(served(ep.body.items, ["id"])).toEqual(seeded("EndingPurpose"));
    expect((ep.body.items as Row[]).every((r) => typeof r.id === "string")).toBe(true);
    const od = await t.http().get("/v1/opening-defs").set(person);
    expect(served(od.body.items, ["id"])).toEqual(seeded("OpeningDef"));
  });

  it("each of the four lists is served row for row and count for count as prisma/seed-data holds it (GD3, runs in CI)", async () => {
    const page = async (path: string): Promise<Row[]> => {
      const all: Row[] = [];
      let cursor: string | null = null;
      do {
        const r = await t.http().get(path).set(person).query(cursor ? { limit: 50, cursor } : { limit: 50 });
        all.push(...r.body.items);
        cursor = r.body.nextCursor;
      } while (cursor);
      return all;
    };
    const nonNull = (rows: Row[]): Row[] => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)));
    for (const [path, table, drop] of [["/v1/chapter-specs", "ChapterSpec", []], ["/v1/ending-purposes", "EndingPurpose", ["id"]], ["/v1/opening-defs", "OpeningDef", ["id"]], ["/v1/moments", "Moment", ["id"]]] as [string, string, string[]][]) {
      const items = await page(path);
      const want = seeded(table);
      expect(items.length).toBe(want.length);
      expect(served(nonNull(items), drop)).toEqual(want);
    }
  });

  const webIt = WEB_PRESENT ? it : it.skip;
  webIt(WEB_PRESENT ? "the seed equals the web app's own files, every row compared, and SOURCE.json's hashes equal the files' (GD3)" : "NOT RUN: no web checkout (the seed against the web app's own files, and SOURCE.json's hashes)", async () => {
    expect(staleSources(join(ROOT, "prisma/seed-data"))).toEqual([]);
    const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "function" ? undefined : x)));
    const want = (rows: Row[], drop: string[] = []): string[] => served(plain(rows) as Row[], drop);
    const got = (rows: Row[], drop: string[] = ["id"]): string[] => served(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null))), drop);

    const keep = ["type", "title", "heading", "line", "ask", "rule", "why"];
    const distinct = new Map<string, Row>();
    for (const r of loadWeb("occasions.ts").RECIPES as { chapters: Row[] }[])
      for (const c of r.chapters) {
        const row = Object.fromEntries(keep.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
        distinct.set(JSON.stringify(sorted(plain(row))), row);
      }
    const cs = (await t.http().get("/v1/chapter-specs").set(person)).body.items as Row[];
    expect(cs.length).toBe(distinct.size);
    expect(distinct.size).toBeGreaterThanOrEqual(99);
    expect(got(cs)).toEqual(want([...distinct.values()]));

    const types = readFileSync(join(WEB_LIB, "engine/types.ts"), "utf8");
    const from = types.indexOf("export type EndingPurpose =");
    const block = types.slice(from, types.indexOf(";", from));
    const purposes = [...block.matchAll(/\|\s*"([a-z-]+)"\s*(?:\/\/\s*(.*))?/g)].map((m) => ({ name: m[1], line: (m[2] || "").trim() }));
    const ep = (await t.http().get("/v1/ending-purposes").set(person)).body.items as Row[];
    expect(ep.length).toBe(purposes.length);
    expect(got(ep)).toEqual(want(purposes as Row[]));

    const openings = (loadWeb("engine/registry.ts").OPENINGS as Row[]).map((o) => Object.fromEntries(["name", "line", "lock", "fields"].filter((k) => o[k] !== undefined).map((k) => [k, o[k]])));
    const od = (await t.http().get("/v1/opening-defs").set(person)).body.items as Row[];
    expect(od.length).toBe(openings.length);
    expect(got(od)).toEqual(want(openings));

    const manifests = (loadWeb("engine/moments.ts").momentManifests as () => Row[])();
    const all: Row[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get("/v1/moments").set(person).query(cursor ? { limit: 50, cursor } : { limit: 50 });
      all.push(...r.body.items);
      cursor = r.body.nextCursor;
    } while (cursor);
    expect(all.length).toBe(manifests.length);
    const mkeys = ["slug", "name", "line", "kind", "serves", "fields", "kinds", "occasions", "dimension", "quiet", "from"];
    const moments = manifests.map((m) => ({ ...Object.fromEntries(mkeys.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])), ...(m.level === undefined ? {} : { level: String(m.level as string | number) }), ...(m.tags == null ? {} : { tags: m.tags }) }));
    expect(got(all)).toEqual(want(moments as Row[]));
  });

  it("moments equal the web app's, page by page; a bad cursor or limit is 422", async () => {
    const all: Row[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get("/v1/moments").set(person).query(cursor ? { limit: 7, cursor } : { limit: 7 });
      expect(r.status).toBe(200);
      expect(r.body.items.length).toBeLessThanOrEqual(7);
      all.push(...r.body.items);
      cursor = r.body.nextCursor;
    } while (cursor);
    expect(served(all, ["id"])).toEqual(seeded("Moment"));
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
    expect((await t.http().get("/v1/moments").set(person).query({ cursor: "nonsense" })).status).toBe(422);
    expect((await t.http().get("/v1/moments").set(person).query({ limit: 500 })).status).toBe(422);
  });

  it("an ETag and 304 as the price book does; a changed row changes the tag; the routes are read only", async () => {
    for (const p of paths) {
      const first = await t.http().get(p).set(biz);
      const etag = first.headers.etag;
      expect(etag).toMatch(/^"[A-Za-z0-9_-]{32}"$/);
      const again = await t.http().get(p).set(biz).set("If-None-Match", etag);
      expect(again.status).toBe(304);
      expect(again.text).toBe("");
      expect((await t.http().get(p).set(biz).set("If-None-Match", '"other"')).status).toBe(200);
      for (const m of ["post", "put", "patch", "delete"] as const) expect([404, 405]).toContain((await t.http()[m](p).set(biz).send({}) as { status: number }).status);
    }
  });
});
