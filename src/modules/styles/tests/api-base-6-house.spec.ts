import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";

const ROOT = join(__dirname, "../../../..");
const ids = new UuidV7Maker();

/** API-BASE-6 case 5 (HS3): one house wish per style that is on. */
describe("HS3 house wishes", () => {
  // This spec CHANGES a shared catalogue row (it switches the seeded noir style off and on), which other specs read in the shared database: it has a database of its own.
  const own = ownDatabase("hs3");
  let t: TestApp;
  let db: PrismaService;
  let ops = "";
  const address = uniqueAddress();
  const seed = (...args: string[]) => {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs"), ...args], { env: process.env, encoding: "utf8" });
    expect(r.status).toBe(0);
  };
  const house = () => db.wish.findMany({ where: { account: { handle: "firstwish" }, content: { path: ["house"], equals: true } } });

  beforeAll(async () => {
    own.use();
    t = await createTestApp();
    db = t.app.get(PrismaService);
    await seedRoleTable(db);
    const s = await makeStaff(db, ["ops"]);
    ops = `staff-ops-${tag()}`;
    t.tokens.set(ops, { kind: "staff", staffId: s.id, roles: ["ops"] });
    seed();
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });

  it("1. one house wish per style that is on, made by the house account from the style's package, with content marked as the house's", async () => {
    const on = await db.style.findMany({ where: { on: true, packaged: true } });
    expect(on.length).toBeGreaterThanOrEqual(43);
    const wishes = await house();
    expect(wishes.length).toBe(on.length);
    expect(new Set(wishes.map((w) => w.styleSlug)).size).toBe(on.length);
    const noir = wishes.find((w) => w.styleSlug === "noir");
    expect(noir).toMatchObject({ status: "live", ticket: "premiere", kind: "love" });
    expect(noir?.content).toMatchObject({ house: true, from: "Firstwish", note: { from: "Firstwish" } });
    const houseAccount = await db.account.findFirstOrThrow({ where: { handle: "firstwish" } });
    expect(noir?.accountId).toBe(houseAccount.id);
    expect(houseAccount.contact).toBeNull();
    expect(await db.creator.count({ where: { accountId: houseAccount.id, house: true } })).toBe(1);
  });

  it("2. the styles read gives each style's link and /w/<slug> plays the house wish", async () => {
    const r = await t.http().get("/v1/styles/noir");
    expect(r.status).toBe(200);
    expect(r.body.showcaseSlug).toBe("house-noir");
    const items: { slug: string; showcaseSlug: string | null }[] = [];
    let cursor: string | null = null;
    do {
      const page: { status: number; body: { items: typeof items; nextCursor: string | null } } = await t.http().get("/v1/styles").query(cursor ? { limit: 50, cursor } : { limit: 50 });
      expect(page.status).toBe(200);
      items.push(...page.body.items);
      cursor = page.body.nextCursor;
    } while (cursor);
    for (const i of items.filter((x) => x.showcaseSlug !== null)) expect(i.showcaseSlug).toBe(`house-${i.slug}`.slice(0, 32));
    expect(items.some((i) => i.showcaseSlug === "house-noir")).toBe(true);
    const w = await t.http().get("/v1/w/house-noir").set("x-forwarded-for", address);
    expect({ status: w.status, body: w.status === 200 ? null : w.body }).toEqual({ status: 200, body: null });
    expect(w.body).toMatchObject({ state: "open", styleSlug: "noir" });
    expect(w.body.content).toMatchObject({ house: true });
    expect(JSON.stringify(w.body)).not.toMatch(/firstwish@|accountId/);
  });

  it("3. a style with no house wish has no link (null)", async () => {
    const slug = `t-${tag()}`;
    await db.style.create({ data: { id: ids.next(), slug, name: "No house", level: "standard", tier: "standard", house: false, on: true, by: "x", get: "", record: [], addedAt: new Date() } });
    const r = await t.http().get(`/v1/styles/${slug}`);
    expect(r.status).toBe(200);
    expect(r.body.showcaseSlug).toBeNull();
  });

  it("4. running the seed again makes no second house wish", async () => {
    const before = (await house()).length;
    const links = await db.wishLink.count({ where: { slug: { startsWith: "house-" } } });
    seed();
    seed("styles");
    expect((await house()).length).toBe(before);
    expect(await db.wishLink.count({ where: { slug: { startsWith: "house-" } } })).toBe(links);
  });

  it("5. turning a style off unlists its house wish (link off, 410, no link on the staff read); on again brings it back; a re-run keeps it off", async () => {
    const off = await t.http().post("/v1/admin/styles/noir/switch").set({ Authorization: `Bearer ${ops}` }).send({ on: false, reason: "pulled for a check" });
    expect(off.status).toBe(200);
    expect(off.body.showcaseSlug).toBeNull();
    expect((await t.http().get("/v1/w/house-noir").set("x-forwarded-for", address)).status).toBe(410);
    expect((await t.http().get("/v1/styles/noir")).status).toBe(404);
    seed();
    expect((await t.http().get("/v1/w/house-noir").set("x-forwarded-for", address)).status).toBe(410);
    const on = await t.http().post("/v1/admin/styles/noir/switch").set({ Authorization: `Bearer ${ops}` }).send({ on: true, reason: "fine again" });
    expect(on.body.showcaseSlug).toBe("house-noir");
    expect((await t.http().get("/v1/w/house-noir").set("x-forwarded-for", address)).status).toBe(200);
  });
});
