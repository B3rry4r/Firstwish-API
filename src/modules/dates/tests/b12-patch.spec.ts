import { AccountErasureService } from "../../accounts/account-erasure.service";
import { SavedWishesService } from "../../saved-wishes/saved-wishes.service";
import { account, B12App, b12App, bearer, businessOwner, Who } from "../../people/tests/b12-kit";

/* Patch B12: AA1, AA3, BB6, BB7 against a real database. */
describe("B12 patch", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b12App();
  });
  afterAll(() => t.close());

  const erase = (accountId: string) => t.app.get(AccountErasureService).erase(accountId, { actor: { type: "account", id: accountId, requestId: "pb12" }, reason: null });
  const post = (w: Who, body: object) => t.http().post("/v1/me/dates").set(bearer(w.token)).send(body);
  const feedWish = async (wish: string | null = null) => {
    const id = t.id();
    await t.db.publishedWish.create({ data: { id, title: "A wish", wish } });
    return id;
  };
  const trial = <T,>(n: number, f: (i: number) => Promise<T>) => Array.from({ length: n }, (_, i) => i).reduce<Promise<void>>(async (p, i) => { await p; await f(i); }, Promise.resolve());

  it("AA1 race: erase against adding a date, 10 times: nothing lands on the erased account", async () => {
    await trial(10, async (i) => {
      const w = await account(t);
      const [res] = await Promise.all([post(w, { name: `Mum${i}`, who: "Family", what: "Birthday", date: "1990-05-17" }), erase(w.accountId)]);
      expect([201, 401]).toContain(res.status);
      expect(await t.db.dateRow.count({ where: { accountId: w.accountId, OR: [{ name: { not: null } }, { what: { not: null } }] } })).toBe(0);
      expect((await post(w, { name: "Late", who: "x", what: "Birthday", date: "1990-05-17" })).status).toBe(401);
      expect(await t.db.dateRow.count({ where: { accountId: w.accountId, name: { not: null } } })).toBe(0);
    });
  });

  it("AA1 race: erase against adding a person, 10 times: nothing lands on the erased account", async () => {
    await trial(10, async (i) => {
      const o = await businessOwner(t);
      const add = t.http().post("/v1/business/people").set(bearer(o.token)).send({ name: `Ada${i}`, birthday: "1990-05-17", start: "", team: "", phone: "08031472093" });
      const [res] = await Promise.all([add, erase(o.accountId)]);
      expect([201, 401]).toContain(res.status);
      expect(await t.db.person.count({ where: { businessId: o.businessId, name: { not: null } } })).toBe(0);
      const late = await t.http().post("/v1/business/people").set(bearer(o.token)).send({ name: "Late", birthday: "1990-05-17", start: "", team: "", phone: "08031472093" });
      expect(late.status).toBe(401);
      expect(await t.db.person.count({ where: { businessId: o.businessId, name: { not: null } } })).toBe(0);
    });
  });

  it("AA1 race: erase against saving a wish, 10 times: nothing lands on the erased account", async () => {
    await trial(10, async () => {
      const w = await account(t);
      const wish = await feedWish();
      const [res] = await Promise.all([t.http().put(`/v1/feed/wishes/${wish}/save`).set(bearer(w.token)).send({ wish }), erase(w.accountId)]);
      expect([200, 401]).toContain(res.status);
      expect(await t.db.savedWish.count({ where: { accountId: w.accountId } })).toBe(0); // BB6: a save that won the race is dropped by the erase itself
      const before = await t.db.savedWish.count({ where: { accountId: w.accountId } });
      expect((await t.http().put(`/v1/feed/wishes/${wish}/save`).set(bearer(w.token)).send({ wish })).status).toBe(401);
      expect(await t.db.savedWish.count({ where: { accountId: w.accountId } })).toBe(before);
    });
  });

  it("AA3: a NUL byte in a name, occasion or note is 422 on every route here", async () => {
    const o = await businessOwner(t);
    const own = await post(o, { name: "Mum", who: "Family", what: "Birthday", date: "1990-05-17" });
    const person = await t.http().post("/v1/business/people").set(bearer(o.token)).send({ name: "Ada", birthday: "1990-05-17", start: "", team: "", phone: "08031472093" });
    const wish = await feedWish();
    const nul = "a\u0000b";
    const auth = bearer(o.token);
    const calls = [
      ...["name", "who", "what"].map((k) => post(o, { name: "Mum", who: "Family", what: "Birthday", date: "1990-05-17", [k]: nul })),
      ...["name", "team", "phone"].map((k) => t.http().post("/v1/business/people").set(auth).send({ name: "Ada", birthday: "1990-05-17", start: "", team: "", phone: "08031472093", [k]: nul })),
      ...["name", "team"].map((k) => t.http().patch(`/v1/business/people/${person.body.id}`).set(auth).send({ name: "Ada", birthday: "1990-05-17", start: "", team: "", phone: "08031472093", [k]: nul })),
      t.http().post("/v1/business/people/import").set(auth).send({ rows: [{ name: nul, birthday: "1990-05-17", start: "", team: "", phone: "08031472093" }] }),
      t.http().put(`/v1/feed/wishes/${wish}/save`).set(auth).send({ wish: nul }),
      t.http().delete(`/v1/feed/wishes/${wish}/save`).set(auth).send({ wish: nul }),
      t.http().get(`/v1/me/dates?cursor=${encodeURIComponent(nul)}`).set(auth),
      t.http().get(`/v1/business/people?cursor=${encodeURIComponent(nul)}`).set(auth),
      t.http().get(`/v1/business/approved-dates?cursor=${encodeURIComponent(nul)}`).set(auth),
      t.http().get(`/v1/me/dates/${own.body.id}%00`).set(auth),
      t.http().delete(`/v1/me/dates/${own.body.id}%00`).set(auth),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(422);
    expect(await t.db.dateRow.count({ where: { accountId: o.accountId } })).toBe(1);
    expect(await t.db.person.count({ where: { businessId: o.businessId } })).toBe(1);
  });

  it("BB6: forgetForWishes(tx, wishIds) drops every saved row of those wishes in the caller's transaction", async () => {
    const owner = await account(t);
    const [a, b] = [await account(t), await account(t)];
    const mk = async () => {
      const id = t.id();
      await t.db.wish.create({ data: { id, accountId: owner.accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos" } });
      return { wish: id, feed: await feedWish(id) };
    };
    const gone = await mk();
    const kept = await mk();
    for (const w of [a, b]) for (const f of [gone.feed, kept.feed]) await t.http().put(`/v1/feed/wishes/${f}/save`).set(bearer(w.token)).send({ wish: f });
    const saved = t.app.get(SavedWishesService);
    const undone = new Error("roll back");
    await t.db.$transaction(async (tx) => {
      expect(await saved.forgetForWishes(tx, [gone.wish])).toBe(2);
      throw undone;
    }).catch((e: unknown) => expect(e).toBe(undone));
    expect(await t.db.savedWish.count({ where: { wish: gone.feed } })).toBe(2);
    expect(await t.db.$transaction((tx) => saved.forgetForWishes(tx, [gone.wish, "not-a-uuid"]))).toBe(2);
    expect(await t.db.savedWish.count({ where: { wish: gone.feed } })).toBe(0);
    expect(await t.db.savedWish.count({ where: { wish: kept.feed } })).toBe(2);
    expect(await t.db.$transaction((tx) => saved.forgetForWishes(tx, []))).toBe(0);
  });

  it("BB7: the dates list pages in the database; its cursor holds across midnight Lagos with nothing repeated or skipped", async () => {
    const o = await businessOwner(t);
    const day = (n: number) => new Date(Date.UTC(1985, 0, 1) + n * 86_400_000 * 5);
    await t.db.dateRow.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ id: t.id(), accountId: o.accountId, name: `P${i}`, who: "x", what: "Birthday", date: day(i) })) });
    await t.db.person.createMany({ data: Array.from({ length: 6 }, (_, i) => ({ id: t.id(), businessId: o.businessId, name: `S${i}`, birthday: day(i * 7 + 2), start: i % 2 ? day(i * 5) : null })) });
    const readAll = async (moves: Record<number, Date>) => {
      const ids: string[] = [];
      let cursor: string | null = null;
      let page = 0;
      const start = t.clock.now();
      try {
        do {
          if (moves[page]) t.clock.set(moves[page]);
          const res: { status: number; body: { items: { id: string }[]; nextCursor: string | null } } = await t.http().get(`/v1/me/dates?limit=7${cursor ? `&cursor=${cursor}` : ""}`).set(bearer(o.token));
          expect(res.status).toBe(200);
          ids.push(...res.body.items.map((r: { id: string }) => r.id));
          cursor = res.body.nextCursor;
          page++;
        } while (cursor);
      } finally {
        t.clock.set(start);
      }
      return ids;
    };
    const steady = await readAll({});
    expect(steady.length).toBeGreaterThanOrEqual(46);
    expect(new Set(steady).size).toBe(steady.length);
    const across = await readAll({ 1: new Date("2027-01-10T23:30:00Z") });
    expect(across).toEqual(steady);
  });

  it("BB7: a POST naming another account's row id answers 404 and leaves the row alone; two accounts sending one new id at once: one 201, one 404", async () => {
    const [a, b] = [await account(t), await account(t)];
    const made = await post(a, { name: "Mum", who: "Family", what: "Birthday", date: "1990-05-17" });
    const steal = await post(b, { id: made.body.id, name: "Mine", who: "x", what: "Birthday", date: "1990-05-17" });
    expect(steal.status).toBe(404);
    expect((await t.db.dateRow.findUniqueOrThrow({ where: { id: made.body.id } })).name).toBe("Mum");
    const id = t.id();
    const both = await Promise.all([a, b].map((w) => post(w, { id, name: "Same", who: "x", what: "Birthday", date: "1990-05-17" })));
    expect(both.map((r) => r.status).sort()).toEqual([201, 404]);
  });

  it("BB7: the people import answers {added, skipped: [{row, reason}]}", async () => {
    const o = await businessOwner(t);
    const res = await t.http().post("/v1/business/people/import").set(bearer(o.token)).send({
      rows: [{ name: "Kemi", birthday: "1992-03-04" }, { name: "", birthday: "1992-03-04" }, { name: "No date" }, "x", { name: "Kemi", birthday: "1992-03-04" }],
    });
    expect(res.status).toBe(200);
    // API-BASE-6 (HR5): each skipped row names its field, a person twice in the file says so, and `rows` answers every row sent
    expect(res.body).toEqual({
      added: 1,
      skipped: [
        { row: 2, reason: "Needs a name.", field: "name" },
        { row: 3, reason: "Needs a birthday or start date we can read.", field: "birthday" },
        { row: 4, reason: "Not a person.", field: "row" },
        { row: 5, reason: "The same person is in this file twice.", field: "name" },
      ],
      rows: [
        { row: 1, state: "accepted" },
        { row: 2, state: "refused", field: "name", reason: "Needs a name." },
        { row: 3, state: "refused", field: "birthday", reason: "Needs a birthday or start date we can read." },
        { row: 4, state: "refused", field: "row", reason: "Not a person." },
        { row: 5, state: "duplicate", field: "name", reason: "The same person is in this file twice." },
      ],
    });
  });
});
