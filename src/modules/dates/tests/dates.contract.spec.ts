import { account, B12App, b12App, bearer, businessOwner, staff, Who } from "../../people/tests/b12-kit";

describe("dates E-45..E-48 /v1/me/dates (contract)", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b12App();
  });
  afterAll(() => t.close());

  const post = (w: Who, body: object) => t.http().post("/v1/me/dates").set(bearer(w.token)).send(body);
  const list = (w: Who, q = "") => t.http().get(`/v1/me/dates${q}`).set(bearer(w.token));
  const mum = { name: "Mum", who: "Family", what: "Birthday", date: "1990-05-17" };

  it("POST adds a date; the same date comes back for any zone; list and GET answer days, years and count", async () => {
    const w = await account(t);
    const made = await post(w, { ...mum, name: "  Mum " });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: "Mum", who: "Family", what: "Birthday", date: "1990-05-17", days: 127, years: 37, count: 1, key: "", person: null });
    expect(made.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = await t.db.dateRow.findUnique({ where: { id: made.body.id } });
    expect(row?.date?.toISOString()).toBe("1990-05-17T00:00:00.000Z");
    const one = await t.http().get(`/v1/me/dates/${made.body.id}`).set(bearer(w.token));
    expect(one.status).toBe(200);
    expect(one.body).toEqual(made.body);
    const l = await list(w);
    expect(l.status).toBe(200);
    expect(l.body).toEqual({ items: [made.body], nextCursor: null });
  });

  it("29 February is kept; in 2027 it falls on 28 February (49 days away), in 2028 on 29 February", async () => {
    const w = await account(t);
    const made = await post(w, { name: "Leap", who: "Friend", what: "Birthday", date: "2000-02-29" });
    expect(made.body).toMatchObject({ date: "2000-02-29", days: 49, years: 27 });
    const at = t.clock.now();
    t.clock.set(new Date("2027-03-01T08:00:00Z"));
    try {
      expect((await list(w)).body.items[0]).toMatchObject({ date: "2000-02-29", days: 365, years: 28 });
    } finally {
      t.clock.set(at);
    }
  });

  it("the list is sorted soonest first and pages by cursor, 500 dates included", async () => {
    const w = await account(t);
    const data = Array.from({ length: 500 }, (_, i) => {
      const d = new Date(Date.UTC(1980, 0, 1) + i * 86_400_000 * 3);
      return { id: t.id(), accountId: w.accountId, name: `P${i}`, who: "Friend", what: "Birthday", date: d };
    });
    await t.db.dateRow.createMany({ data });
    const seen: { id: string; days: number; count: number }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await list(w, `?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(10);
    expect(seen).toHaveLength(500);
    expect(new Set(seen.map((s) => s.id)).size).toBe(500);
    for (let i = 1; i < seen.length; i++) expect(seen[i].days).toBeGreaterThanOrEqual(seen[i - 1].days);
    expect(seen.every((s) => s.count === 500)).toBe(true);
  });

  it("the same date for the same person twice is one row (200 with the row kept), also when sent at once", async () => {
    const w = await account(t);
    const first = await post(w, mum);
    const again = await post(w, { ...mum, name: "MUM", what: "birthday", id: t.id() });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    const w2 = await account(t);
    const both = await Promise.all(Array.from({ length: 5 }, () => post(w2, mum)));
    expect(new Set(both.map((r) => (r.body as { id: string }).id)).size).toBe(1);
    expect(await t.db.dateRow.count({ where: { accountId: w2.accountId } })).toBe(1);
  });

  it("POST with the id of the caller's row changes it; undo re-adds a removed row by its id", async () => {
    const w = await account(t);
    const made = await post(w, mum);
    const changed = await post(w, { ...mum, id: made.body.id, date: "1990-05-18", who: "Partner" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id: made.body.id, date: "1990-05-18", who: "Partner" });
    expect((await t.http().delete(`/v1/me/dates/${made.body.id}`).set(bearer(w.token))).status).toBe(204);
    expect((await t.http().get(`/v1/me/dates/${made.body.id}`).set(bearer(w.token))).status).toBe(404);
    const back = await post(w, { ...mum, id: made.body.id });
    expect(back.status).toBe(201);
    expect(back.body.id).toBe(made.body.id);
  });

  it("another account cannot read, change or remove a row: and its id answers 404 (BB7)", async () => {
    const owner = await account(t);
    const other = await account(t);
    const made = await post(owner, mum);
    expect((await t.http().get(`/v1/me/dates/${made.body.id}`).set(bearer(other.token))).status).toBe(404);
    expect((await t.http().delete(`/v1/me/dates/${made.body.id}`).set(bearer(other.token))).status).toBe(404);
    const steal = await post(other, { ...mum, id: made.body.id, name: "Mine" });
    expect(steal.status).toBe(404);
    expect((await t.db.dateRow.findUnique({ where: { id: made.body.id } }))?.name).toBe("Mum");
    expect((await list(other)).body.items).toEqual([]);
  });

  it("401 without a token; 403 for a staff token; a non-uuid id is 404", async () => {
    expect((await t.http().get("/v1/me/dates")).status).toBe(401);
    expect((await t.http().post("/v1/me/dates").send(mum)).status).toBe(401);
    expect((await t.http().delete(`/v1/me/dates/${t.id()}`)).status).toBe(401);
    expect((await t.http().get("/v1/me/dates").set(bearer(staff(t)))).status).toBe(403);
    const w = await account(t);
    expect((await t.http().get("/v1/me/dates/not-a-uuid").set(bearer(w.token))).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await t.http().delete("/v1/me/dates/123").set(bearer(w.token))).status).toBe(404);
  });

  it("422 with fields for a bad body: no name, a timestamp or impossible date, a non-uuid client id, unknown fields", async () => {
    const w = await account(t);
    const bad = await post(w, { name: " ", who: "Family", what: "Birthday", date: "1990-05-17T00:00:00Z" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toMatchObject({ date: expect.any(String) });
    expect((await post(w, { ...mum, name: "  " })).body.error.fields.name).toBeDefined();
    expect((await post(w, { ...mum, date: "2027-02-29" })).body.error.fields.date).toBeDefined();
    expect((await post(w, { ...mum, date: "1850-01-01" })).body.error.fields.date).toBeDefined();
    expect((await post(w, { ...mum, id: "k3j4h5" })).body.error.fields.id).toBeDefined();
    expect((await post(w, { ...mum, days: 3 })).status).toBe(422);
    expect((await list(w, "?limit=0")).status).toBe(422);
    expect((await list(w, "?cursor=bogus")).status).toBe(422);
    expect(await t.db.dateRow.count({ where: { accountId: w.accountId } })).toBe(0);
  });

  it("a non-canonical date with spaces is normalised", async () => {
    const w = await account(t);
    const made = await post(w, { ...mum, date: " 1990-05-17 " });
    expect(made.status).toBe(201);
    expect(made.body.date).toBe("1990-05-17");
  });

  it("a business caller also sees its people's birthdays and work anniversaries, keyed as approvals are", async () => {
    const o = await businessOwner(t);
    await t.db.person.create({
      data: { id: t.id(), businessId: o.businessId, name: "Tola", team: "Sales", birthday: new Date("1995-01-12T00:00:00Z"), start: new Date("2020-01-15T00:00:00Z") },
    });
    await t.db.person.create({ data: { id: t.id(), businessId: o.businessId, name: "New", start: new Date("2027-03-01T00:00:00Z") } });
    await post(o, mum);
    const items = (await list(o)).body.items as { key: string; what: string; days: number; years: number; person: unknown; count: number }[];
    expect(items.map((i) => [i.what, i.days, i.years])).toEqual([
      ["Staff birthday", 2, 32],
      ["Work anniversary", 5, 7],
      ["Birthday", 127, 37],
    ]);
    expect(items[0].key).toMatch(/^[0-9a-f-]{36}:b:2027$/);
    expect(items[0].person).toMatchObject({ name: "Tola", team: "Sales" });
    expect(items.every((i) => i.count === 1)).toBe(true);
    const plain = await account(t);
    expect((await list(plain)).body.items).toEqual([]);
  });
});
