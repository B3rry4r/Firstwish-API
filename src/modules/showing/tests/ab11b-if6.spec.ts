import { PrismaService } from "../../../common/db/prisma.service";
import { ownDatabase } from "../../../../test/kit/own-db";
import { testSlug } from "../../../../test/kit/unique";
import { uniqueHandle } from "../../accounts/tests/sides.kit";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { account, B12App, b13App, bearer, liveWish, staffOf, type Who } from "./b13-kit";

const DAY = 86_400_000;

/** API-BASE-11B case 4 (IF6): Now showing by style, the wishes in a style, a creator's styles and wishes, through the real routes. */
describe("IF6 the public reads the designed pages draw", () => {
  let t: B12App;
  let db: PrismaService;
  let mod: { id: string; token: string };
  // The public lists are one page of the whole database's listed wishes: the spec has a database of its own.
  const own = ownDatabase("if6");
  beforeAll(async () => {
    own.use();
    t = await b13App();
    db = t.db;
    mod = await staffOf(t, "moderator");
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });

  async function style(name: string, over: Record<string, unknown> = {}) {
    const slug = testSlug("st");
    const row = await db.style.create({ data: { id: t.id(), slug, name, level: "standard", tier: "standard", house: false, on: true, by: "x", get: "", record: [], addedAt: new Date(), ...over } as never });
    return { slug, id: row.id };
  }
  /** A creator with a public page (a creator side, a handle, a creator row). */
  async function creator(name = "Ada Maker") {
    const who = await account(t, ["creator"]);
    const handle = uniqueHandle("c");
    await db.account.update({ where: { id: who.accountId }, data: { handle, name } });
    const row = await db.creator.create({ data: { id: t.id(), accountId: who.accountId, name } });
    return { ...who, handle, creatorId: row.id };
  }
  async function publish(owner: Who, styleSlug: string, name = "Ada") {
    const w = await liveWish(t, owner, { name });
    await db.wish.update({ where: { id: w.id }, data: { styleSlug } });
    expect((await t.http().post(`/v1/wishes/${w.id}/publish-requests`).set(bearer(owner.token)).send({ consent: true })).status).toBe(201);
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id, status: "waiting" } });
    expect((await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(mod.token)).send({ decision: "approve", reason: "Looks lovely" })).status).toBe(200);
    const row = await db.publishedWish.findFirstOrThrow({ where: { wishId: w.id } });
    return { ...w, rowId: row.id };
  }
  type Item = { id: string; style: string; styleName: string; title: string; creator: { handle?: string; name: string } | null; mine: object };
  const ids = (r: { body: { items: Item[] } }) => r.body.items.map((i) => i.id);

  it("4a. a showing row carries the style and the title as they were when it was listed, and they do not move when the style or the wish does", async () => {
    const s = await style("Golden Hour");
    const owner = await creator();
    const w = await publish(owner, s.slug, "Ada");
    const row = ((await t.http().get("/v1/showing")).body.items as Item[]).find((i) => i.id === w.rowId);
    expect(row).toMatchObject({ style: s.slug, styleName: "Golden Hour", title: "A birthday wish for Ada" });
    await db.style.update({ where: { id: s.id }, data: { name: "Renamed later" } });
    await db.wish.update({ where: { id: w.id }, data: { styleSlug: "classic", name: "Someone else" } });
    const again = ((await t.http().get("/v1/showing")).body.items as Item[]).find((i) => i.id === w.rowId);
    expect(again).toMatchObject({ style: s.slug, styleName: "Golden Hour", title: "A birthday wish for Ada" });
  });

  it("4b. GET /v1/showing takes a style filter: only the wishes listed in that style, paged; a style nobody used is an empty page; a bad name is 422; the answer is cached as the other public reads are", async () => {
    const a = await style("Style A");
    const b = await style("Style B");
    const owner = await creator();
    const wa = [await publish(owner, a.slug), await publish(owner, a.slug)];
    const wb = await publish(owner, b.slug);
    const all = await t.http().get("/v1/showing?limit=50");
    expect(ids(all)).toEqual(expect.arrayContaining([...wa.map((w) => w.rowId), wb.rowId]));
    const onlyA = await t.http().get(`/v1/showing?style=${a.slug}&limit=50`);
    expect(ids(onlyA).sort()).toEqual(wa.map((w) => w.rowId).sort());
    expect((onlyA.body.items as Item[]).every((i) => i.style === a.slug)).toBe(true);
    // upper case reads as the same style
    expect(ids(await t.http().get(`/v1/showing?style=${a.slug.toUpperCase()}`)).sort()).toEqual(wa.map((w) => w.rowId).sort());
    // paged: one at a time, the cursor keeps the filter
    const p1 = await t.http().get(`/v1/showing?style=${a.slug}&limit=1`);
    expect(p1.body.items).toHaveLength(1);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await t.http().get(`/v1/showing?style=${a.slug}&limit=1&cursor=${encodeURIComponent(p1.body.nextCursor)}`);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
    expect([ids(p1)[0], ids(p2)[0]].sort()).toEqual(wa.map((w) => w.rowId).sort());
    expect(ids(await t.http().get(`/v1/showing?style=never-used-style`))).toEqual([]);
    const bad = await t.http().get("/v1/showing?style=Not%20a%20style!");
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain("style");
    // cached: an ETag, revalidated each time, shared; a signed-in viewer's read (it carries their marks) is private and varies by the token
    const c = await t.http().get(`/v1/showing?style=${a.slug}`);
    expect(c.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect(c.headers.etag).toMatch(/^"/);
    expect((await t.http().get(`/v1/showing?style=${a.slug}`).set("if-none-match", c.headers.etag)).status).toBe(304);
    const mine = await t.http().get(`/v1/showing?style=${a.slug}`).set(bearer(owner.token));
    expect(mine.headers["cache-control"]).toBe("private, max-age=0, must-revalidate");
    expect(mine.headers.vary).toContain("Authorization");
  });

  it("4c. GET /v1/styles/:id/wishes: the wishes in a style (by its name or its id), never one that is hidden, resting, ended, removed, passcoded or not listed; a style that is off or unknown is 404", async () => {
    const s = await style("Style C");
    const owner = await creator();
    const shown = await publish(owner, s.slug);
    const hidden = await publish(owner, s.slug);
    const resting = await publish(owner, s.slug);
    const ended = await publish(owner, s.slug);
    const removed = await publish(owner, s.slug);
    const passcoded = await publish(owner, s.slug);
    const unlisted = await publish(owner, s.slug);
    const all = [shown, hidden, resting, ended, removed, passcoded, unlisted];
    const list = async (key = s.slug) => ids(await t.http().get(`/v1/styles/${key}/wishes?limit=50`));
    expect((await list()).sort()).toEqual(all.map((w) => w.rowId).sort());
    expect((await list(s.id)).sort()).toEqual(all.map((w) => w.rowId).sort());
    await t.app.get(WishLifecycleService).takeDown(hidden.id, "staff-take-down"); // staff take it down
    await db.wish.update({ where: { id: resting.id }, data: { status: "resting", restingSince: t.clock.now() } });
    await db.wish.update({ where: { id: ended.id }, data: { endsAt: new Date(t.clock.now().getTime() - DAY) } });
    const owned = owner.token;
    expect((await t.http().delete(`/v1/wishes/${removed.id}`).set(bearer(owned)).send({})).status).toBe(200);
    await db.wish.update({ where: { id: passcoded.id }, data: { passcodeHash: "scrypt$00$00" } });
    expect((await t.http().post(`/v1/admin/showing/listed/${unlisted.no}/unlist`).set(bearer(mod.token)).send({ reason: "Not suitable" })).status).toBe(200);
    expect(await list()).toEqual([shown.rowId]);
    const r = await t.http().get(`/v1/styles/${s.slug}/wishes`);
    expect(r.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect((r.body.items as Item[])[0].mine).toEqual({});
    // paged
    const second = await publish(owner, s.slug);
    const p1 = await t.http().get(`/v1/styles/${s.slug}/wishes?limit=1`);
    expect(p1.body.items).toHaveLength(1);
    const p2 = await t.http().get(`/v1/styles/${s.slug}/wishes?limit=1&cursor=${encodeURIComponent(p1.body.nextCursor)}`);
    expect([ids(p1)[0], ids(p2)[0]].sort()).toEqual([shown.rowId, second.rowId].sort());
    // a style that is off or unknown, and a name that is not one, answer as GET /v1/styles/:id does
    await db.style.update({ where: { id: s.id }, data: { on: false } });
    expect((await t.http().get(`/v1/styles/${s.slug}/wishes`)).status).toBe(404);
    expect((await t.http().get("/v1/styles/no-such-style/wishes")).status).toBe(404);
    expect((await t.http().get("/v1/styles/Not%20a%20style!/wishes")).status).toBe(404);
  });

  it("4d. a creator's public reads: their wishes on show and their styles that are on; paged; nothing private; a creator who is suspended, has no creator side or is erased, and a handle that is not one, are 404", async () => {
    const s1 = await style("Mine one");
    const owner = await creator("Ada Maker");
    const other = await creator("Bola Maker");
    await db.style.update({ where: { id: s1.id }, data: { creator: { creatorId: owner.creatorId } } });
    const s2 = await style("Mine two", { creator: { creatorId: owner.creatorId } });
    await style("Off one", { on: false, creator: { creatorId: owner.creatorId } });
    await style("Theirs", { creator: { creatorId: other.creatorId } });
    await style("House", { house: true });
    const w1 = await publish(owner, s1.slug);
    const w2 = await publish(owner, s2.slug);
    await publish(other, s1.slug);
    const wishes = await t.http().get(`/v1/creators/${owner.handle}/wishes?limit=50`);
    expect(wishes.status).toBe(200);
    expect(ids(wishes).sort()).toEqual([w1.rowId, w2.rowId].sort());
    expect((wishes.body.items as Item[]).every((i) => i.creator?.handle === owner.handle)).toBe(true);
    expect(wishes.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    const styles = await t.http().get(`/v1/creators/${owner.handle}/styles?limit=50`);
    expect(styles.status).toBe(200);
    expect((styles.body.items as { slug: string }[]).map((x) => x.slug).sort()).toEqual([s1.slug, s2.slug].sort());
    expect(styles.headers.etag).toMatch(/^"/);
    // handle in any case; paged
    expect((await t.http().get(`/v1/creators/${owner.handle.toUpperCase()}/styles`)).status).toBe(200);
    const p1 = await t.http().get(`/v1/creators/${owner.handle}/styles?limit=1`);
    expect(p1.body.items).toHaveLength(1);
    const p2 = await t.http().get(`/v1/creators/${owner.handle}/styles?limit=1&cursor=${encodeURIComponent(p1.body.nextCursor)}`);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
    // nothing private: no staff record on a style, no account, email, screening or staff decision on a wish row
    const text = JSON.stringify([styles.body, wishes.body]);
    expect(text).not.toContain(owner.accountId);
    expect(text).not.toContain(owner.email);
    expect((styles.body.items as Record<string, unknown>[]).every((x) => !("record" in x) || (x.record as unknown[]).length === 0)).toBe(true);
    expect((wishes.body.items as Record<string, unknown>[]).every((x) => JSON.stringify(x.screen) === "{}" && x.decided === null)).toBe(true);
    // a wish that is not listed any more leaves the creator's list
    await t.app.get(WishLifecycleService).takeDown(w2.id, "staff-take-down");
    expect(ids(await t.http().get(`/v1/creators/${owner.handle}/wishes`))).toEqual([w1.rowId]);

    // 404: a suspended creator (an account ban), one whose creator side is off, an erased one; and the same for the creator page itself
    const gone = async (c: { accountId: string; handle: string }) => {
      for (const path of ["", "/styles", "/wishes"]) expect([c.handle, path, (await t.http().get(`/v1/creators/${c.handle}${path}`)).status]).toEqual([c.handle, path, 404]);
    };
    await db.ban.create({ data: { id: t.id(), accountId: other.accountId, scope: "account", reason: "test", by: "staff" } });
    await gone(other);
    const noSide = await creator();
    await db.account.update({ where: { id: noSide.accountId }, data: { sides: ["person"] } });
    await gone(noSide);
    const erased = await creator();
    await db.account.update({ where: { id: erased.accountId }, data: { erasedAt: t.clock.now() } });
    await gone(erased);
    expect((await t.http().get("/v1/creators/no-such-creator-here/wishes")).status).toBe(404);
    expect((await t.http().get("/v1/creators/Not%20a%20handle!/styles")).status).toBe(404);
    // the creator who is still public is unchanged by all that
    expect((await t.http().get(`/v1/creators/${owner.handle}`)).status).toBe(200);
  });
});
