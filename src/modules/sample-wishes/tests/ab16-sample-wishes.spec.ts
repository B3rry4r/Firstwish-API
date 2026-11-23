import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import type { PublicWishView, SampleWish } from "../../../contracts";
import { ownDatabase } from "../../../../test/kit/own-db";
import { ensureEntitlements } from "../../stored-files/tests/files-kit";
import { WEB_LIB, WEB_PRESENT } from "../../reference-data/tests/web-files";
import { createTestApp, TestApp } from "../../../../test/kit/app";

const ROOT = join(__dirname, "../../../..");
type Row = Record<string, unknown>;
const seedFile = (): { rows: Row[] } => JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/SampleWish.json"), "utf8")) as { rows: Row[] };

let t: TestApp;
let db: PrismaService;
const seedNow = (): void => {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
};

// K2: the spec counts and snapshots whole tables (wish, sample_wish), which other specs also write in the shared database: it has a database of its own.
const own = ownDatabase("ab16");
beforeAll(async () => {
  own.use();
  t = await createTestApp();
  seedNow();
  db = t.app.get(PrismaService);
  await ensureEntitlements(db);
  t.tokens.set("person", { kind: "user", accountId: "01900000-0000-7000-8000-0000000000a1", sides: ["person"] });
});
afterAll(async () => {
  await t.close();
  own.drop();
});

/** The keys of an object and, for each value that is a plain object, its keys under it (arrays and `content` are the wish's own words, not its shape). */
const shape = (v: unknown, skip: string[] = ["content"]): unknown =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, skip.includes(k) ? "*" : shape((v as Row)[k], skip)])) : "*";

describe("API-BASE-16 case 1: one sample wish (E-288)", () => {
  it("answers the designed sample of a kind and occasion with no sign-in, marked as a sample, in the shape a player reads", async () => {
    const r = await t.http().get("/v1/sample-wishes/love/birthday");
    expect(r.status).toBe(200);
    const w = r.body as SampleWish;
    expect(w).toMatchObject({ sample: true, kind: "love", occasion: "birthday", occasionName: "Birthday", state: "open", openable: true, receiverName: "Aisha", call: "Babe", date: "07 · 11 · 2026" });
    expect(Date.parse(w.opensAt)).toBeLessThan(Date.now());
    expect(typeof (w.content as { letter?: unknown }).letter).toBe("object");
    expect(w.photos.length).toBe(8);
    expect(w.photos.every((p) => /^\/img\/aisha-\d\.webp$/.test(p))).toBe(true);
    expect(w.files).toEqual(w.photos.map((url) => ({ role: "photo", url })));
    for (const k of ["slug", "id", "no", "accountId", "owner", "link"]) expect(r.body).not.toHaveProperty(k);
  });

  it("K1: carries every field an open public wish view carries, with a truthful fixed value for a sample", async () => {
    const w = (await t.http().get("/v1/sample-wishes/love/birthday")).body as SampleWish;
    expect(w).toMatchObject({ openedAt: w.opensAt, endsAt: null, opening: null, keepOffer: null, styleSlug: "", timeZone: "Africa/Lagos", wishNo: null, house: false });
    expect(Math.abs(Date.parse(w.serverTime) - t.clock.now().getTime())).toBe(0);
    expect((w.content as { files?: unknown }).files).toEqual(w.files);
    expect(w.files.length).toBe(8);
    // the two cannot drift: the sample's type is the public wish view's own (a compile-time check) and its keys are a real open wish's
    const asView: Omit<PublicWishView, "slug"> = w;
    expect(asView.kind).toBe("love");
    const ids = new UuidV7Maker();
    const owner = ids.next();
    await db.account.create({ data: { id: owner, sides: ["person"], lastSide: "person" } });
    const id = ids.next();
    const slug = `ab16-${process.pid}`;
    await db.wish.create({ data: { id, accountId: owner, status: "sealed", ticket: "moment", kind: "love", occasion: "birthday", styleSlug: "noir", timeZone: "Africa/Lagos", opensAt: new Date(t.clock.now().getTime() - 60_000), sealedAt: t.clock.now(), name: "Chidi", no: `AB16-${process.pid}`, content: { letter: { paras: ["Hello."] } } } as never });
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    const real = await t.http().post(`/v1/w/${slug}/opens`).send({});
    expect([real.status, real.body.state]).toEqual([200, "open"]);
    const { slug: _slug, ...realKeys } = real.body as Row;
    const sample = (await t.http().get("/v1/sample-wishes/love/birthday")).body as Row;
    for (const [k, v] of Object.entries(realKeys)) if (v === undefined) delete realKeys[k];
    const extra = Object.keys(sample).filter((k) => !(k in realKeys)).sort();
    expect(extra).toEqual(["call", "date", "occasionName", "photos", "sample"]);
    expect(shape(Object.fromEntries(Object.entries(sample).filter(([k]) => k in realKeys)))).toEqual(shape(Object.fromEntries(Object.entries(realKeys).filter(([k]) => k in sample))));
    expect(Object.keys(realKeys).filter((k) => !(k in sample))).toEqual([]);
    expect(Array.isArray((real.body.content as Row).files)).toBe(true);
    const list = ((await t.http().get("/v1/sample-wishes").query({ kind: "love" })).body.items as Row[]);
    for (const item of list) expect(Object.keys(item).sort()).toEqual(Object.keys(sample).sort());
    // the tag leaves out the clock, so a repeat is a 304
    const first = await t.http().get("/v1/sample-wishes/love/birthday");
    const again = await t.http().get("/v1/sample-wishes/love/birthday").set("If-None-Match", first.headers.etag);
    expect(again.status).toBe(304);
  });

  it("a kind and occasion each have their own words; the wedding date is said as the source says it", async () => {
    const a = (await t.http().get("/v1/sample-wishes/love/apology")).body as SampleWish;
    const b = (await t.http().get("/v1/sample-wishes/celebration/new-baby")).body as SampleWish;
    expect(a.call).toBe("Babe");
    expect(b.call).toBe("Little one");
    expect(JSON.stringify(a.content)).toContain("I am sorry");
    const w = (await t.http().get("/v1/sample-wishes/wedding/our-story")).body as SampleWish;
    expect(w.date).toBe("14 · 02 · 2027");
    expect(Date.parse(w.opensAt)).toBeLessThan(Date.now());
  });

  it("an unknown kind, an unknown occasion and an occasion of another kind are 404 in words", async () => {
    for (const [path, words] of [["/v1/sample-wishes/nothing/birthday", /no sample wish for the kind/], ["/v1/sample-wishes/love/nothing", /no sample wish for the occasion/], ["/v1/sample-wishes/love/graduation", /no sample wish for the occasion/], ["/v1/sample-wishes/LOVE/birthday", /no sample wish/]] as [string, RegExp][]) {
      const r = await t.http().get(path);
      expect(r.status).toBe(404);
      expect(String(r.body.message ?? r.body.error?.message ?? JSON.stringify(r.body))).toMatch(words);
    }
  });

  it("carries the headers of the public styles read, and answers 304 to the same tag", async () => {
    const levels = await t.http().get("/v1/styles/levels");
    const r = await t.http().get("/v1/sample-wishes/group/send-off");
    expect(r.headers["cache-control"]).toBe(levels.headers["cache-control"]);
    expect(r.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect(r.headers.etag).toMatch(/^"[A-Za-z0-9_-]{32}"$/);
    expect(r.headers.etag).toBe((await t.http().get("/v1/sample-wishes/group/send-off")).headers.etag);
    const again = await t.http().get("/v1/sample-wishes/group/send-off").set("If-None-Match", r.headers.etag);
    expect(again.status).toBe(304);
    expect(again.text).toBe("");
  });
});

describe("API-BASE-16 case 2: the list (E-287)", () => {
  it("answers one kind's samples, small enough for a page of tiles", async () => {
    const r = await t.http().get("/v1/sample-wishes").query({ kind: "celebration" });
    expect(r.status).toBe(200);
    const items = r.body.items as SampleWish[];
    expect(r.body.nextCursor).toBeNull();
    expect(items.length).toBe(13);
    expect(items.every((w) => w.kind === "celebration" && w.sample === true)).toBe(true);
    expect(new Set(items.map((w) => w.occasion)).size).toBe(13);
    expect(r.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect((await t.http().get("/v1/sample-wishes").query({ kind: "celebration" }).set("If-None-Match", r.headers.etag)).status).toBe(304);
  });

  it("names every kind when none is given (44 in one answer, under 100 kB a kind), and 404 for a kind that is not one", async () => {
    const all = await t.http().get("/v1/sample-wishes");
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBe(44);
    expect(new Set((all.body.items as SampleWish[]).map((w) => w.kind))).toEqual(new Set(["love", "celebration", "group", "wedding", "teams", "photographers"]));
    expect((await t.http().get("/v1/sample-wishes").query({ kind: "" })).body.items.length).toBe(44);
    for (const kind of ["love", "celebration", "group", "wedding", "teams", "photographers"]) {
      const r = await t.http().get("/v1/sample-wishes").query({ kind });
      expect(r.status).toBe(200);
      expect(Buffer.byteLength(JSON.stringify(r.body))).toBeLessThan(100_000);
    }
    const bad = await t.http().get("/v1/sample-wishes").query({ kind: "vendors" });
    expect(bad.status).toBe(404);
    expect(JSON.stringify(bad.body)).toMatch(/no sample wish for the kind/);
  });
});

describe("API-BASE-16 case 3: the data, seeded once and then owned (GD3)", () => {
  it("the table holds the 44 rows of prisma/seed-data/SampleWish.json, each kind by occasion once, and the served words are the file's", async () => {
    const file = seedFile().rows;
    expect(file.length).toBe(44);
    expect(await db.sampleWish.count()).toBe(44);
    const keys = new Set(file.map((r) => `${String(r.kind)}/${String(r.occasion)}`));
    expect(keys.size).toBe(44);
    for (const r of file) {
      const w = (await t.http().get(`/v1/sample-wishes/${String(r.kind)}/${String(r.occasion)}`)).body as SampleWish;
      expect(w.content).toEqual({ ...(r.content as Row), files: w.files });
      expect(w.photos).toEqual(r.photos);
      expect(w.receiverName).toBe(r.name);
      expect(w.date).toBe(r.date);
    }
  });

  it("the seed run twice changes nothing, and never rewrites a row the API holds", async () => {
    const snap = async (): Promise<string> => JSON.stringify((await db.sampleWish.findMany({ orderBy: { id: "asc" } })).map((r) => ({ ...r })));
    const before = await snap();
    seedNow();
    seedNow();
    expect(await snap()).toBe(before);
    const row = await db.sampleWish.findFirstOrThrow({ where: { kind: "love", occasion: "birthday" } });
    await db.sampleWish.update({ where: { id: row.id }, data: { call: "Changed here" } });
    seedNow();
    expect((await db.sampleWish.findUniqueOrThrow({ where: { id: row.id } })).call).toBe("Changed here");
    await db.sampleWish.update({ where: { id: row.id }, data: { call: row.call } });
    expect(await snap()).toBe(before);
  });

  it("SOURCE.json says the table is owned here and lists no web file only the samples read", () => {
    const src = JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/SOURCE.json"), "utf8")) as { files: { path: string }[]; owned: Record<string, string> };
    expect(Object.keys(src.owned)).toContain("SampleWish");
    const paths = src.files.map((f) => f.path);
    expect(paths).not.toContain("lib/engine/adapt.ts");
    expect(paths).not.toContain("lib/wish-model.ts");
  });

  const webIt = WEB_PRESENT ? it : it.skip;
  webIt(WEB_PRESENT ? "a second export leaves the file alone whatever the web's files say (the web's adapt.ts is never read again), and the first export gave one row for each kind and occasion of the web's catalogue" : "NOT RUN: no web checkout", () => {
    const web = join(WEB_LIB, "..");
    const dir = mkdtempSync(join(tmpdir(), "ab16-export-"));
    try {
      mkdirSync(join(dir, "scripts"));
      cpSync(join(ROOT, "scripts/export-seed-data.mjs"), join(dir, "scripts/export-seed-data.mjs"));
      cpSync(join(ROOT, "prisma/seed-data"), join(dir, "prisma/seed-data"), { recursive: true });
      const mine = join(dir, "prisma/seed-data/SampleWish.json");
      const doc = JSON.parse(readFileSync(mine, "utf8")) as { rows: Row[] };
      doc.rows[0] = { ...doc.rows[0], call: "Owned by the API" };
      const text = JSON.stringify(doc, null, 1) + "\n";
      writeFileSync(mine, text);
      const run = spawnSync(process.execPath, [join(dir, "scripts/export-seed-data.mjs")], { cwd: dir, env: { ...process.env, WEB_REPO: web, NODE_PATH: join(ROOT, "node_modules") }, encoding: "utf8" });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("SampleWish: owned here since its first export, left as it is");
      expect(readFileSync(mine, "utf8")).toBe(text);
      // and with the file absent, the first export is every kind by occasion of the catalogue
      rmSync(mine);
      const first = spawnSync(process.execPath, [join(dir, "scripts/export-seed-data.mjs")], { cwd: dir, env: { ...process.env, WEB_REPO: web, NODE_PATH: join(ROOT, "node_modules") }, encoding: "utf8" });
      expect(first.status).toBe(0);
      expect(existsSync(mine)).toBe(true);
      expect(readFileSync(mine, "utf8")).toBe(readFileSync(join(ROOT, "prisma/seed-data/SampleWish.json"), "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("API-BASE-16 case 4: a sample is never a real wish", () => {
  it("the table has no slug, owner, link, ticket or count column and is joined to no wish table", () => {
    const m = Prisma.dmmf.datamodel.models.find((x) => x.name === "SampleWish");
    expect(m?.fields.map((f) => f.name).sort()).toEqual(["call", "content", "date", "id", "kind", "name", "occasion", "occasionName", "photos"].sort());
    expect(m?.fields.some((f) => f.kind === "object")).toBe(false);
    for (const other of Prisma.dmmf.datamodel.models) expect(other.fields.some((f) => f.type === "SampleWish")).toBe(false);
  });

  it("the public wish routes, given a sample's id or any word of it, answer 404 (or refuse the body first) and make nothing", async () => {
    const row = await db.sampleWish.findFirstOrThrow({ where: { kind: "love", occasion: "birthday" } });
    const wishesBefore = await db.wish.count();
    for (const x of [row.id, row.id.toUpperCase(), "love-birthday", "sample-love-birthday", "love", "birthday"]) {
      for (const p of [`/v1/w/${x}`, `/v1/g/${x}`, `/v1/r/${x}`, `/v1/styles/${x}/wishes`, `/v1/w/${x}/keep/ref12345`]) expect([p, (await t.http().get(p)).status]).toEqual([p, 404]);
      expect([x, (await t.http().get(`/v1/wishes/${x}`).set({ Authorization: "Bearer person" })).status]).toEqual([x, 404]);
      for (const p of ["unlock", "opens", "reaction", "favourites", "keep", "wake"]) {
        const s = (await t.http().post(`/v1/w/${x}/${p}`).send({})).status;
        expect([`${x} ${p}`, [404, 422].includes(s)]).toEqual([`${x} ${p}`, true]);
      }
      expect((await t.http().post(`/v1/r/${x}/unlock`).send({})).status).toBeGreaterThanOrEqual(404);
    }
    expect(await db.wish.count()).toBe(wishesBefore);
  });

  it("is in no wish list, no Now showing, and the only routes are the two reads: a write of any kind stores nothing", async () => {
    const snap = async (): Promise<string> => JSON.stringify((await db.sampleWish.findMany({ orderBy: { id: "asc" } })).map((r) => ({ ...r })));
    const before = await snap();
    const showing = await t.http().get("/v1/showing");
    expect(JSON.stringify(showing.body)).not.toMatch(/sample-wish|aisha-\d\.webp/);
    expect(JSON.stringify((await t.http().get("/v1/wishes").set({ Authorization: "Bearer person" })).body)).not.toMatch(/aisha-\d\.webp/);
    for (const path of ["/v1/sample-wishes", "/v1/sample-wishes/love/birthday"]) {
      for (const m of ["post", "put", "patch", "delete"] as const) {
        const s = ((await t.http()[m](path).send({ call: "Typed by a person", content: { letter: "mine" }, kind: "love", occasion: "x" })) as { status: number }).status;
        expect([path, m, [401, 404, 405].includes(s)]).toEqual([path, m, true]);
      }
    }
    expect(await snap()).toBe(before);
    expect(await db.sampleWish.count()).toBe(44);
  });
});
