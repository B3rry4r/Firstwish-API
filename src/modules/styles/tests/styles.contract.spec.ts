import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";

const ids = new UuidV7Maker();
const ROOT = join(__dirname, "../../../..");
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
let db: PrismaService;
const tok: Record<string, string> = {};
let staffIds: Record<string, string> = {};

async function addStyle(over: { level?: string; house?: boolean; on?: boolean; slug?: string } = {}) {
  const slug = over.slug ?? `t-${tag()}`;
  const level = over.level ?? "standard";
  await db.style.create({
    data: { id: ids.next(), slug, name: `Test ${slug}`, level, tier: level, house: over.house ?? true, on: over.on ?? true, by: "firstwish", get: `get ${level}`, record: [], addedAt: new Date("2025-12-01T00:00:00Z") },
  });
  await db.styleLevel.create({ data: { id: ids.next(), styleSlug: slug, slug, level: level as "starter", since: new Date("2025-12-01T00:00:00Z"), by: "seed" } });
  return slug;
}

/** The public levels read (one answer, X28), as slug -> level. */
async function allLevels(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const r = await t.http().get("/v1/styles/levels");
  expect(r.status).toBe(200);
  for (const i of r.body.items as Body[]) out[i.slug as string] = i.level as string;
  return out;
}

const auditRows = (styleSlug: string) =>
  db.style.findUniqueOrThrow({ where: { slug: styleSlug } }).then((s) => db.auditEntry.findMany({ where: { subjectType: "Style", subjectId: s.id } }));

beforeAll(async () => {
  t = await createTestApp();
  db = t.app.get(PrismaService);
  await seedRoleTable(db);
  for (const role of ["owner", "ops", "reviewer", "moderator", "finance"] as const) {
    const s = await makeStaff(db, [role]);
    staffIds = { ...staffIds, [role]: s.id };
    tok[role] = `staff-${role}-${tag()}`;
    t.tokens.set(tok[role], { kind: "staff", staffId: s.id, roles: [role] });
  }
  const acct = ids.next();
  await db.account.create({ data: { id: acct, lastSide: "me" } });
  tok.user = `user-${tag()}`;
  t.tokens.set(tok.user, { kind: "user", accountId: acct, sides: ["person", "creator"] });
});
afterAll(() => t.close());

const auth = (role: string) => ({ Authorization: `Bearer ${tok[role]}` });

describe("E-198 GET /v1/styles/levels (case 1)", () => {
  it("the seed holds the web app's 43 styles at the levels the app shows today", async () => {
    const run = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs"), "styles"], { env: process.env, encoding: "utf8" });
    expect(run.status).toBe(0);
    const doc = JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/Style.json"), "utf8")) as { rows: { slug: string; level: string }[] };
    expect(doc.rows).toHaveLength(43);
    const levels = await allLevels();
    for (const r of doc.rows) expect(levels[r.slug]).toBe(r.level);
    // a second run changes nothing (and never undoes a staff move)
    expect(spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs"), "styles"], { env: process.env }).status).toBe(0);
    expect(await db.style.count({ where: { slug: { in: doc.rows.map((r) => r.slug) } } })).toBe(43);
  });

  it("is public and cacheable with an ETag that answers 304 while nothing moved", async () => {
    await addStyle();
    const a = await t.http().get("/v1/styles/levels");
    expect(a.status).toBe(200);
    expect(a.headers["cache-control"]).toContain("public");
    const etag = String(a.headers.etag);
    expect(etag).toMatch(/^"/);
    const item = (a.body.items as Body[])[0];
    expect(Object.keys(item).sort()).toEqual(["by", "level", "reason", "since", "slug", "styleSlug"]);
    const b = await t.http().get("/v1/styles/levels").set("If-None-Match", etag);
    expect(b.status).toBe(304);
  });

  it("is one answer (X28): no paging, a stray cursor or limit is refused", async () => {
    expect((await t.http().get("/v1/styles/levels").query({ cursor: "nope" })).status).toBe(422);
    expect((await t.http().get("/v1/styles/levels").query({ limit: 99 })).status).toBe(422);
    const r = await t.http().get("/v1/styles/levels");
    expect(r.body.nextCursor).toBeNull();
    expect((r.body.items as Body[]).length).toBeGreaterThanOrEqual(43);
  });
});

describe("E-197 PUT /v1/admin/styles/:slug/level (case 2)", () => {
  it("moves the level: the public read and its ETag change at once; one audit row; a record entry", async () => {
    const slug = await addStyle({ level: "standard" });
    const before = await t.http().get("/v1/styles/levels");
    const r = await t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("reviewer")).send({ level: "premium", reason: "  sells well  " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ slug, level: "premium", tier: "Premium", on: true });
    expect((r.body.record as Body[]).at(-1)).toMatchObject({ what: "Moved from Standard to Premium", reason: "sells well" });
    expect((await allLevels())[slug]).toBe("premium");
    const after = await t.http().get("/v1/styles/levels");
    expect(after.headers.etag).not.toBe(before.headers.etag);
    const audit = await auditRows(slug);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: staffIds.reviewer, action: "style.move-level", section: "/admin/styles", reason: "sells well" });
    const moved = await db.styleLevel.findMany({ where: { styleSlug: slug }, orderBy: { since: "desc" } });
    expect(moved[0]).toMatchObject({ level: "premium", by: staffIds.reviewer });
    // the public read says staff set it, never who or why
    const pub = ((await t.http().get("/v1/styles/levels")).body.items as Body[]).find((i) => i.slug === slug);
    expect(pub).toMatchObject({ by: "staff", reason: null });
  });

  it("an unchanged level is not_allowed (409); a creator's style cannot be Starter; nothing is written", async () => {
    const slug = await addStyle({ level: "premium" });
    const same = await t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("ops")).send({ level: "premium", reason: "no change" });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("not_allowed");
    const creator = await addStyle({ level: "standard", house: false });
    const starter = await t.http().put(`/v1/admin/styles/${creator}/level`).set(auth("owner")).send({ level: "starter", reason: "try it" });
    expect(starter.status).toBe(409);
    expect(await auditRows(slug)).toHaveLength(0);
    expect(await auditRows(creator)).toHaveLength(0);
  });

  it("two moves at once: one wins, the other is refused, one audit row", async () => {
    const slug = await addStyle({ level: "standard" });
    const [a, b] = await Promise.all([
      t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("owner")).send({ level: "premium", reason: "first one" }),
      t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("ops")).send({ level: "premium", reason: "second one" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditRows(slug)).toHaveLength(1);
  });

  it("401 without a token; 403 for a user token and for a staff role the registry does not list", async () => {
    const slug = await addStyle();
    const body = { level: "premium", reason: "a reason" };
    expect((await t.http().put(`/v1/admin/styles/${slug}/level`).send(body)).status).toBe(401);
    expect((await t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("user")).send(body)).status).toBe(403);
    expect((await t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("moderator")).send(body)).status).toBe(403);
    expect((await t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("finance")).send(body)).status).toBe(403);
  });

  it("422 with fields for a bad level or a short reason", async () => {
    const slug = await addStyle();
    const bad = await t.http().put(`/v1/admin/styles/${slug}/level`).set(auth("owner")).send({ level: "gold", reason: "ab" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields as Body)).toEqual(expect.arrayContaining(["level", "reason"]));
  });

  it("a slug is matched exactly after lowercasing; an unknown style is 404 (case 5)", async () => {
    const slug = await addStyle({ level: "standard" });
    const r = await t.http().put(`/v1/admin/styles/${slug.toUpperCase()}/level`).set(auth("owner")).send({ level: "starter", reason: "make it free" });
    expect(r.status).toBe(200);
    expect(r.body.slug).toBe(slug);
    expect((await t.http().put(`/v1/admin/styles/${slug}x/level`).set(auth("owner")).send({ level: "premium", reason: "a reason" })).status).toBe(404);
    expect((await t.http().put(`/v1/admin/styles/${slug.slice(0, -1)}/level`).set(auth("owner")).send({ level: "premium", reason: "a reason" })).status).toBe(404);
    expect((await t.http().put(`/v1/admin/styles/%E2%9C%93/level`).set(auth("owner")).send({ level: "premium", reason: "a reason" })).status).toBe(404);
  });
});

describe("E-194 POST /v1/admin/styles/:slug/switch (case 3)", () => {
  it("off leaves the public reads; on brings it back; one audit row each", async () => {
    const slug = await addStyle();
    const off = await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("ops")).send({ on: false, reason: "broken on old phones" });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ slug, on: false });
    expect((await allLevels())[slug]).toBeUndefined();
    expect((await t.http().get(`/v1/styles/${slug}`)).status).toBe(404);
    const again = await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("ops")).send({ on: false, reason: "twice over" });
    expect(again.status).toBe(409);
    // the staff list still shows it
    const staff = await t.http().get("/v1/admin/styles").set(auth("reviewer")).query({ limit: 50 });
    expect(staff.status).toBe(200);
    const on = await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("reviewer")).send({ on: true, reason: "fixed now" });
    expect(on.status).toBe(200);
    expect((await allLevels())[slug]).toBe("standard");
    expect((await t.http().get(`/v1/styles/${slug}`)).status).toBe(200);
    const audit = await auditRows(slug);
    expect(audit.map((a) => a.action).sort()).toEqual(["style.switch-off", "style.switch-on"]);
  });

  it("401, 403 and 422 with fields", async () => {
    const slug = await addStyle();
    expect((await t.http().post(`/v1/admin/styles/${slug}/switch`).send({ on: false, reason: "a reason" })).status).toBe(401);
    expect((await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("moderator")).send({ on: false, reason: "a reason" })).status).toBe(403);
    const bad = await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("owner")).send({ on: "no", reason: "" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields as Body)).toEqual(expect.arrayContaining(["on", "reason"]));
  });
});

describe("E-193 GET /v1/admin/styles (case 5)", () => {
  it("pages and filters by level; counts are this quarter's sums of events", async () => {
    const slugs = [await addStyle({ slug: `zz-a-${tag()}`, level: "premium" }), await addStyle({ slug: `zz-b-${tag()}`, level: "premium" })];
    await db.event.createMany({
      data: [
        { id: ids.next(), name: "style_previewed", styleSlug: slugs[0], at: t.clock.now(), props: { key: `k-${tag()}-1` } },
        { id: ids.next(), name: "style_previewed", styleSlug: slugs[0], at: t.clock.now(), props: { key: `k-${tag()}-2` } },
        { id: ids.next(), name: "paid", styleSlug: slugs[0], at: t.clock.now(), props: { key: `k-${tag()}-3` } },
        { id: ids.next(), name: "style_previewed", styleSlug: slugs[0], at: new Date("2025-10-01T00:00:00Z"), props: { key: `k-${tag()}-4` } },
      ],
    });
    const seen: Body[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r = await t.http().get("/v1/admin/styles").set(auth("ops")).query({ level: "premium", limit: 5, ...(cursor ? { cursor } : {}) });
      expect(r.status).toBe(200);
      seen.push(...(r.body.items as Body[]));
      cursor = r.body.nextCursor as string | null;
      pages++;
    } while (cursor);
    expect(seen.every((s) => s.level === "premium")).toBe(true);
    expect(new Set(seen.map((s) => String(s.slug))).size).toBe(seen.length);
    const a = seen.find((s) => s.slug === slugs[0]);
    expect(a).toMatchObject({ previews: 2, paid: 1, rate: null });
    expect(seen.find((s) => s.slug === slugs[1])).toBeDefined();
    expect(pages).toBeGreaterThan(1);
  });

  it("a level that is not one is 422; 401 and 403", async () => {
    expect((await t.http().get("/v1/admin/styles").set(auth("ops")).query({ level: "gold" })).status).toBe(422);
    expect((await t.http().get("/v1/admin/styles")).status).toBe(401);
    expect((await t.http().get("/v1/admin/styles").set(auth("finance"))).status).toBe(403);
    expect((await t.http().get("/v1/admin/styles").set(auth("user"))).status).toBe(403);
  });
});

describe("E-199 GET /v1/admin/styles/preview-to-paid (case 4)", () => {
  it("the rate is null under 200 previews in the quarter and paid / previews from 200", async () => {
    const big = await addStyle();
    const small = await addStyle();
    const at = t.clock.now();
    await db.event.createMany({
      data: [
        ...Array.from({ length: 200 }, (_, i) => ({ id: ids.next(), name: "style_previewed" as const, styleSlug: big, at, props: { key: `p-${big}-${i}` } })),
        ...Array.from({ length: 50 }, (_, i) => ({ id: ids.next(), name: "paid" as const, styleSlug: big, at, props: { key: `q-${big}-${i}` } })),
        ...Array.from({ length: 199 }, (_, i) => ({ id: ids.next(), name: "style_previewed" as const, styleSlug: small, at, props: { key: `p-${small}-${i}` } })),
      ],
    });
    const rows: Body[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get("/v1/admin/styles/preview-to-paid").set(auth("reviewer")).query({ quarter: "2026-q1", limit: 50, ...(cursor ? { cursor } : {}) });
      expect(r.status).toBe(200);
      rows.push(...(r.body.items as Body[]));
      cursor = r.body.nextCursor as string | null;
    } while (cursor);
    expect(rows.find((x) => x.styleSlug === big)).toMatchObject({ quarter: "2026-Q1", previews: 200, paid: 50, rate: 0.25 });
    expect(rows.find((x) => x.styleSlug === small)).toMatchObject({ previews: 199, rate: null });
    const other = await t.http().get("/v1/admin/styles/preview-to-paid").set(auth("owner")).query({ quarter: "2025-Q4", limit: 50 });
    expect(((other.body.items as Body[]).find((x) => x.styleSlug === big) ?? {}).previews ?? 0).toBe(0);
  });

  it("422 for a quarter that is not one or missing; ops is 403 (owner and reviewer only); 401", async () => {
    expect((await t.http().get("/v1/admin/styles/preview-to-paid").set(auth("owner")).query({ quarter: "2026-5" })).status).toBe(422);
    expect((await t.http().get("/v1/admin/styles/preview-to-paid").set(auth("owner"))).status).toBe(422);
    expect((await t.http().get("/v1/admin/styles/preview-to-paid").set(auth("ops")).query({ quarter: "2026-Q1" })).status).toBe(403);
    expect((await t.http().get("/v1/admin/styles/preview-to-paid").query({ quarter: "2026-Q1" })).status).toBe(401);
  });
});

describe("E-195, E-196 public style reads", () => {
  it("list and one leave out the staff record; a slug is matched lowercased; unknown is 404", async () => {
    const slug = await addStyle();
    await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("owner")).send({ on: false, reason: "off a while" });
    await t.http().post(`/v1/admin/styles/${slug}/switch`).set(auth("owner")).send({ on: true, reason: "back again" });
    const one = await t.http().get(`/v1/styles/${slug.toUpperCase()}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ slug, record: [], reason: "" });
    expect((await t.http().get(`/v1/styles/no-such-${tag()}`)).status).toBe(404);
    expect((await t.http().get("/v1/styles/0190a0b0-0000-7000-8000-000000000000")).status).toBe(404);
    const list = await t.http().get("/v1/styles").query({ limit: 50 });
    expect(list.status).toBe(200);
    expect((list.body.items as Body[]).every((s) => s.on === true && (s.record as unknown[]).length === 0)).toBe(true);
  });
});

describe("contract shapes and the one-answer levels read", () => {
  it("X1: Style.rate is a number or null, from the contract's own type", async () => {
    const slug = await addStyle();
    const at = t.clock.now();
    await db.event.createMany({
      data: [
        ...Array.from({ length: 200 }, (_, i) => ({ id: ids.next(), name: "style_previewed" as const, styleSlug: slug, at, key: `x1p-${slug}-${i}` })),
        ...Array.from({ length: 20 }, (_, i) => ({ id: ids.next(), name: "paid" as const, styleSlug: slug, at, key: `x1q-${slug}-${i}` })),
      ],
    });
    const hot = await t.http().get(`/v1/styles/${slug}`);
    expect(hot.body.rate).toBe(0.1);
    const cold = await addStyle();
    const one = await t.http().get(`/v1/styles/${cold}`);
    expect(one.body.rate).toBeNull();
    const staff = await t.http().get("/v1/admin/styles").set(auth("owner")).query({ level: "standard", limit: 50 });
    expect(staff.status).toBe(200);
    for (const s of staff.body.items as Body[]) expect(s.rate === null || typeof s.rate === "number").toBe(true);
  });

  it("X2: the level filter is the contract's: exact values only", async () => {
    const slug = await addStyle({ level: "premium" });
    const ok = await t.http().get("/v1/admin/styles").set(auth("ops")).query({ level: "premium", limit: 50 });
    expect(ok.status).toBe(200);
    expect((ok.body.items as Body[]).every((s) => s.level === "premium")).toBe(true);
    expect((await t.http().get("/v1/admin/styles").set(auth("ops")).query({ level: "PREMIUM" })).status).toBe(422);
    expect((await t.http().get("/v1/admin/styles").set(auth("ops")).query({ level: "gold" })).status).toBe(422);
    expect(slug).toBeTruthy();
  });

  it("X3: a StyleRate row is {styleSlug, name, level, quarter, previews, paid, rate}", async () => {
    const slug = await addStyle({ level: "premium" });
    const rows: Body[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get("/v1/admin/styles/preview-to-paid").set(auth("owner")).query({ quarter: "2026-Q1", limit: 50, ...(cursor ? { cursor } : {}) });
      expect(r.status).toBe(200);
      rows.push(...(r.body.items as Body[]));
      cursor = r.body.nextCursor as string | null;
    } while (cursor);
    const row = rows.find((x) => x.styleSlug === slug);
    expect(row).toBeDefined();
    expect(Object.keys(row as Body).sort()).toEqual(["level", "name", "paid", "previews", "quarter", "rate", "styleSlug"]);
    expect(row).toMatchObject({ level: "premium", quarter: "2026-Q1", previews: 0, paid: 0, rate: null });
  });

  it("X28: every style that is on comes in one answer, and the ETag covers all of it", async () => {
    const slugs: string[] = [];
    for (let i = 0; i < 25; i++) slugs.push(await addStyle({ slug: `zz-${tag()}-${String(i).padStart(2, "0")}` }));
    const last = slugs.sort().at(-1) as string;
    const a = await t.http().get("/v1/styles/levels");
    expect(a.status).toBe(200);
    expect(a.body.nextCursor).toBeNull();
    const got = new Set((a.body.items as Body[]).map((i) => String(i.slug)));
    expect(got.size).toBeGreaterThan(60);
    for (const s of slugs) expect(got.has(s)).toBe(true);
    // a change to the last style on the list changes the ETag, so a page-one-only hash would fail here
    const mv = await t.http().put(`/v1/admin/styles/${last}/level`).set(auth("ops")).send({ level: "premium", reason: "X28 check" });
    expect(mv.status).toBe(200);
    const b = await t.http().get("/v1/styles/levels");
    expect(b.headers.etag).not.toBe(a.headers.etag);
    expect((await t.http().get("/v1/styles/levels").set("If-None-Match", String(b.headers.etag))).status).toBe(304);
  });
});
