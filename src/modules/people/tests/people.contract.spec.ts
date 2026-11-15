import { account, B12App, b12App, bearer, businessOwner, staff } from "./b12-kit";

describe("people E-117..E-121 and approved dates E-17 /v1/business (contract)", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b12App();
  });
  afterAll(() => t.close());

  const ada = { name: " Ada ", phone: "0803 147 2093", team: "Sales", birthday: "1990-05-17", start: "" };
  const add = (token: string, body: object) => t.http().post("/v1/business/people").set(bearer(token)).send(body);

  it("POST adds a person: dates are calendar dates, '' means none, the phone is stored E.164; GET lists by name", async () => {
    const o = await businessOwner(t);
    const made = await add(o.token, ada);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: "Ada", phone: "+2348031472093", team: "Sales", birthday: "1990-05-17", start: "", rows: [] });
    const row = await t.db.person.findUnique({ where: { id: made.body.id } });
    expect(row).toMatchObject({ businessId: o.businessId, start: null });
    expect(row?.birthday?.toISOString()).toBe("1990-05-17T00:00:00.000Z");
    await add(o.token, { ...ada, name: "Bola" });
    await add(o.token, { ...ada, name: "Abe" });
    const p1 = await t.http().get("/v1/business/people?limit=2").set(bearer(o.token));
    expect(p1.status).toBe(200);
    expect((p1.body.items as { name: string }[]).map((x) => x.name)).toEqual(["Abe", "Ada"]);
    const p2 = await t.http().get(`/v1/business/people?limit=2&cursor=${p1.body.nextCursor}`).set(bearer(o.token));
    expect(p2.body).toMatchObject({ items: [{ name: "Bola" }], nextCursor: null });
  });

  it("PATCH changes a person; another business gets 404 on PATCH and DELETE and sees none of them", async () => {
    const o = await businessOwner(t);
    const other = await businessOwner(t);
    const made = await add(o.token, ada);
    const patch = await t.http().patch(`/v1/business/people/${made.body.id}`).set(bearer(o.token)).send({ ...ada, start: "2020-01-15", birthday: "" });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ id: made.body.id, start: "2020-01-15", birthday: "" });
    expect((await t.http().patch(`/v1/business/people/${made.body.id}`).set(bearer(other.token)).send({ ...ada, name: "X" })).status).toBe(404);
    expect((await t.http().delete(`/v1/business/people/${made.body.id}`).set(bearer(other.token))).status).toBe(404);
    expect((await t.http().get("/v1/business/people").set(bearer(other.token))).body.items).toEqual([]);
    expect((await t.db.person.findUnique({ where: { id: made.body.id } }))?.name).toBe("Ada");
  });

  it("a person removed takes their dates with them: their coming dates and their approvals go", async () => {
    const o = await businessOwner(t);
    const made = await add(o.token, ada);
    await t.db.approvedDate.create({ data: { id: t.id(), key: `${made.body.id}:b:2027` } });
    expect((await t.http().get("/v1/business/approved-dates").set(bearer(o.token))).body.items).toEqual([{ key: `${made.body.id}:b:2027` }]);
    expect((await t.http().get("/v1/me/dates").set(bearer(o.token))).body.items).toHaveLength(1);
    expect((await t.http().delete(`/v1/business/people/${made.body.id}`).set(bearer(o.token))).status).toBe(204);
    expect((await t.http().get("/v1/me/dates").set(bearer(o.token))).body.items).toEqual([]);
    expect(await t.db.approvedDate.count({ where: { key: { startsWith: made.body.id } } })).toBe(0);
    expect((await t.http().delete(`/v1/business/people/${made.body.id}`).set(bearer(o.token))).status).toBe(404);
  });

  it("approved dates: only that business's members read them (owner and a login); another business sees none", async () => {
    const o = await businessOwner(t);
    const other = await businessOwner(t);
    const p = await add(o.token, ada);
    const keys = [`${p.body.id}:b:2027`, `${p.body.id}:s:2027`];
    for (const key of keys) await t.db.approvedDate.create({ data: { id: t.id(), key } });
    const page1 = await t.http().get("/v1/business/approved-dates?limit=1").set(bearer(o.token));
    expect(page1.status).toBe(200);
    const page2 = await t.http().get(`/v1/business/approved-dates?limit=1&cursor=${page1.body.nextCursor}`).set(bearer(o.token));
    expect([...page1.body.items, ...page2.body.items].map((x: { key: string }) => x.key).sort()).toEqual(keys.sort());
    expect(page2.body.nextCursor).toBeNull();
    expect((await t.http().get("/v1/business/approved-dates").set(bearer(other.token))).body.items).toEqual([]);
    const member = await account(t, ["person", "business"]);
    await t.db.login.create({ data: { id: t.id(), businessId: o.businessId, contact: member.email.toUpperCase(), status: "invited" } });
    expect((await t.http().get("/v1/business/approved-dates").set(bearer(member.token))).body.items).toHaveLength(2);
    expect((await t.http().get("/v1/business/people").set(bearer(member.token))).body.items).toHaveLength(1);
  });

  it("import adds the readable rows once and answers how many were added", async () => {
    const o = await businessOwner(t);
    const rows = [
      { name: "Kemi", phone: "08031472094", team: "Ops", birthday: "1992-03-04", start: "" },
      { name: "Kemi", phone: "", team: "Ops", birthday: "1992-03-04", start: "" },
      { name: "", birthday: "1992-03-04" },
      { name: "No date", birthday: "soon", start: "" },
      { name: "Femi", start: "2019-07-01" },
    ];
    const res = await t.http().post("/v1/business/people/import").set(bearer(o.token)).send({ rows });
    expect(res.status).toBe(200);
    expect(res.body).toBe(2);
    const again = await t.http().post("/v1/business/people/import").set(bearer(o.token)).send({ rows });
    expect(again.body).toBe(0);
    expect(await t.db.person.count({ where: { businessId: o.businessId } })).toBe(2);
    expect((await t.http().post("/v1/business/people/import").set(bearer(o.token)).send({ rows: "x" })).status).toBe(422);
  });

  it("401 without a token; 403 for a person without the business side, a business side with no business, and staff", async () => {
    expect((await t.http().get("/v1/business/people")).status).toBe(401);
    expect((await t.http().get("/v1/business/approved-dates")).status).toBe(401);
    expect((await t.http().post("/v1/business/people").send(ada)).status).toBe(401);
    const person = await account(t);
    expect((await t.http().get("/v1/business/people").set(bearer(person.token))).status).toBe(403);
    expect((await add(person.token, ada)).status).toBe(403);
    const noBusiness = await account(t, ["person", "business"]);
    expect((await t.http().get("/v1/business/approved-dates").set(bearer(noBusiness.token))).status).toBe(403);
    expect((await t.http().get("/v1/business/people").set(bearer(staff(t)))).status).toBe(403);
    const o = await businessOwner(t);
    expect((await t.http().patch("/v1/business/people/nope").set(bearer(o.token)).send(ada)).status).toBe(404);
  });

  it("422 with fields for a bad body", async () => {
    const o = await businessOwner(t);
    const bad = await add(o.token, { ...ada, birthday: "17/05/1990", phone: "abc" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["birthday", "phone"]);
    expect((await add(o.token, { ...ada, name: "  " })).body.error.fields.name).toBeDefined();
    expect((await add(o.token, { ...ada, rows: [] })).status).toBe(422);
    expect(await t.db.person.count({ where: { businessId: o.businessId } })).toBe(0);
  });
});
