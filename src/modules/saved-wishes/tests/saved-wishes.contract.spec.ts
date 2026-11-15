import { SavedWishesService } from "../saved-wishes.service";
import { account, B12App, b12App, bearer, staff, Who } from "../../people/tests/b12-kit";

describe("saved wishes E-155, E-156 /v1/feed/wishes/:id/save (contract)", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b12App();
  });
  afterAll(() => t.close());

  const put = (w: Who, id: string, wish = id) => t.http().put(`/v1/feed/wishes/${id}/save`).set(bearer(w.token)).send({ wish });
  const del = (w: Who, id: string, wish = id) => t.http().delete(`/v1/feed/wishes/${id}/save`).set(bearer(w.token)).send({ wish });

  async function feedWish(behind?: { status?: "live" | "removed"; erased?: boolean }): Promise<string> {
    const id = t.id();
    let wishId: string | null = null;
    if (behind) {
      const owner = await account(t);
      wishId = t.id();
      await t.db.wish.create({
        data: {
          id: wishId, accountId: owner.accountId, status: behind.status ?? "live", kind: "birthday", occasion: "birthday", styleSlug: "classic",
          timeZone: "Africa/Lagos", erasedAt: behind.erased ? t.clock.now() : null,
        },
      });
    }
    await t.db.publishedWish.create({ data: { id, title: "A wish", wish: wishId } });
    return id;
  }

  it("save and unsave are idempotent and answer the counts kept in the database", async () => {
    const id = await feedWish({ status: "live" });
    const a = await account(t);
    const b = await account(t);
    await t.db.reaction.create({ data: { id: t.id(), accountId: b.accountId, wish: id, reaction: "love" } });
    const s1 = await put(a, id);
    expect(s1.status).toBe(200);
    expect(s1.body).toEqual({ saved: true, counts: { reactions: 1, saves: 1 } });
    expect((await put(a, id)).body).toEqual({ saved: true, counts: { reactions: 1, saves: 1 } });
    expect((await put(b, id)).body.counts.saves).toBe(2);
    const u1 = await del(a, id);
    expect(u1.status).toBe(200);
    expect(u1.body).toEqual({ saved: false, counts: { reactions: 1, saves: 1 } });
    expect((await del(a, id)).body).toEqual({ saved: false, counts: { reactions: 1, saves: 1 } });
  });

  it("the same save sent at once makes one row", async () => {
    const id = await feedWish();
    const a = await account(t);
    const all = await Promise.all(Array.from({ length: 6 }, () => put(a, id)));
    expect(all.every((r) => r.status === 200 && r.body.saved === true)).toBe(true);
    expect(await t.db.savedWish.count({ where: { wish: id } })).toBe(1);
  });

  it("a wish taken down, removed or erased cannot be saved, and leaves every saved list", async () => {
    const a = await account(t);
    const taken = await feedWish();
    await put(a, taken);
    await t.db.publishedWish.delete({ where: { id: taken } });
    expect(await t.app.get(SavedWishesService).forget([taken])).toBe(1);
    expect(await t.db.savedWish.count({ where: { wish: taken } })).toBe(0);
    expect((await put(a, taken)).status).toBe(404);
    expect((await put(a, await feedWish({ status: "removed" }))).status).toBe(404);
    expect((await put(a, await feedWish({ erased: true }))).status).toBe(404);
    expect((await put(a, t.id())).status).toBe(404);
    expect((await del(a, taken)).body).toEqual({ saved: false, counts: { reactions: 0, saves: 0 } });
  });

  it("401 without a token; 403 for staff; a non-uuid id is 404; a body naming another wish is 422", async () => {
    const id = await feedWish();
    expect((await t.http().put(`/v1/feed/wishes/${id}/save`).send({ wish: id })).status).toBe(401);
    expect((await t.http().delete(`/v1/feed/wishes/${id}/save`).send({ wish: id })).status).toBe(401);
    expect((await t.http().put(`/v1/feed/wishes/${id}/save`).set(bearer(staff(t))).send({ wish: id })).status).toBe(403);
    const a = await account(t);
    expect((await put(a, "not-a-uuid")).status).toBe(404);
    const other = await put(a, id, t.id());
    expect(other.status).toBe(422);
    expect(other.body.error.fields.wish).toBeDefined();
    const missing = await t.http().put(`/v1/feed/wishes/${id}/save`).set(bearer(a.token)).send({});
    expect(missing.status).toBe(422);
    expect(missing.body.error.fields.wish).toBeDefined();
  });

  it("a wish id sent with spaces in the body is read as the same wish", async () => {
    const id = await feedWish();
    const a = await account(t);
    expect((await put(a, id, `  ${id} `)).body.saved).toBe(true);
  });
});
