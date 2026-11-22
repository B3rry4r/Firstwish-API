import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { testSlug, testWishNo } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-07-14T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();

/** API-BASE-11B case 3 (HU2): the public view says whether the wish is the house's and types what it offers to keep it. */
describe("HU2 PublicWishView.house and PublicWishView.keepOffer", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function wish(owner: string, over: Record<string, unknown> = {}) {
    const accountId = owner === "house" ? (await db.account.findFirstOrThrow({ where: { handle: "firstwish" } })).id : owner;
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - 9 * DAY), openedAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() + 5 * DAY), ...over } as never,
    });
    const slug = testSlug("hu2");
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    return { id, slug };
  }
  async function person() {
    const id = ids.next();
    await db.account.create({ data: { id, sides: ["person"], lastSide: "person" } });
    return id;
  }
  const view = (slug: string, method: "get" | "head" = "get") => t.http()[method](`/v1/w/${slug}`).set("x-forwarded-for", uniqueAddress());

  it("3a. house is false for a person's wish and true for the house's own; the keep offer is typed as it is served", async () => {
    const mine = await wish(await person());
    const v = await view(mine.slug);
    expect(v.status).toBe(200);
    expect(v.body.house).toBe(false);
    const offer = v.body.keepOffer as Record<string, unknown>;
    expect(Object.keys(offer).sort()).toEqual(["keeps", "proof", "proofExpiresAt", "resting", "wake", "wishId"]);
    expect(offer).toMatchObject({ wishId: mine.id, resting: false, wake: false });
    expect(typeof offer.proof).toBe("string");
    expect(new Date(offer.proofExpiresAt as string).toISOString()).toBe(offer.proofExpiresAt);
    const keeps = offer.keeps as Record<string, unknown>[];
    expect(keeps.map((k) => k.key)).toEqual(["month", "half", "year"]);
    for (const k of keeps) {
      expect(Object.keys(k).sort()).toEqual(["days", "key", "name", "priceKobo"]);
      expect(typeof k.name).toBe("string");
      expect(Number.isInteger(k.days)).toBe(true);
      expect(Number.isInteger(k.priceKobo)).toBe(true);
    }
    const house = await wish("house");
    const h = await view(house.slug);
    expect(h.status).toBe(200);
    expect(h.body.house).toBe(true);
    expect(h.body.keepOffer ?? null).toBeNull(); // a house wish cannot be kept or woken (HU2)
  });

  it("3b. every state of the view carries house: sealed and resting, a house wish at rest, and a head read", async () => {
    const owner = await person();
    const sealed = await wish(owner, { status: "sealed", openedAt: null, endsAt: null, opensAt: new Date(NOW.getTime() + DAY) });
    expect((await view(sealed.slug)).body).toMatchObject({ state: "countdown", house: false });
    const resting = await wish(owner, { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY) });
    const r = await view(resting.slug);
    expect(r.body).toMatchObject({ state: "resting", house: false });
    expect(r.body.keepOffer).toMatchObject({ wishId: resting.id, resting: true, wake: true });
    const houseResting = await wish("house", { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY) });
    expect((await view(houseResting.slug)).body).toMatchObject({ state: "resting", house: true, keepOffer: null });
    const open = await wish(owner);
    const head = await view(open.slug, "head");
    expect(head.status).toBe(200);
  });
});
