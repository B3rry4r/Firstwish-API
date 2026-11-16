import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-06-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("B22 approved dates (E-239, E-238, DEC-168)", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  async function owner(over: Record<string, unknown> = {}) {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `b22d-${run}-${++seq}@example.com`, sides: ["person", "business"], lastSide: "person" } });
    const token = `b22d-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({
      data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW, plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2032-06", renews: new Date("2032-07-01T09:00:00.000Z"), ...over },
    });
    return { accountId, token, businessId };
  }
  const person = async (businessId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.person.create({ data: { id, businessId, name: "Kemi", birthday: new Date("1990-03-04T00:00:00Z"), start: new Date("2020-01-15T00:00:00Z"), ...over } });
    return id;
  };
  const post = (token: string | null, body: unknown) => {
    const r = t.http().post("/v1/business/approved-dates");
    return (token ? r.set(bearer(token)) : r).send(body as object);
  };
  const del = (token: string | null, body: unknown) => {
    const r = t.http().delete("/v1/business/approved-dates");
    return (token ? r.set(bearer(token)) : r).send(body as object);
  };
  const used = async (businessId: string) => (await db.business.findUniqueOrThrow({ where: { id: businessId } })).used;

  it("1. approve is idempotent (201, then 200 with the same row), appears in E-17, and takes no wish from the allowance", async () => {
    const o = await owner();
    const p = await person(o.businessId);
    const a = await post(o.token, { personId: p, kind: "b", year: 2033 });
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ key: `${p}:b:2033` });
    const b = await post(o.token, { personId: p.toUpperCase(), kind: "b", year: 2033 });
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(await db.approvedDate.count({ where: { businessId: o.businessId } })).toBe(1);
    expect(await used(o.businessId)).toBe(0);
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(0);
    const list = await t.http().get("/v1/business/approved-dates").set(bearer(o.token));
    expect(list.body.items).toEqual([{ key: `${p}:b:2033` }]);
    expect((await post(o.token, { personId: p, kind: "s", year: 2033 })).status).toBe(201);
    expect(await db.approvedDate.count({ where: { businessId: o.businessId } })).toBe(2);
  });

  it("2. take back is 204, also for a date never approved, and the same body can approve again", async () => {
    const o = await owner();
    const p = await person(o.businessId);
    expect((await del(o.token, { personId: p, kind: "b", year: 2033 })).status).toBe(204);
    await post(o.token, { personId: p, kind: "b", year: 2033 });
    expect((await del(o.token, { personId: p, kind: "b", year: 2033 })).status).toBe(204);
    expect(await db.approvedDate.count({ where: { businessId: o.businessId } })).toBe(0);
    expect((await post(o.token, { personId: p, kind: "b", year: 2033 })).status).toBe(201);
  });

  it("3. one way to draw: approving here never draws; E-32 draws once whatever the order and the takes back", async () => {
    const o = await owner();
    const p = await person(o.businessId);
    const wishBody = { client: "Kemi", day: "2033-03-04", key: `${p}:b:2033`, kind: "teams", occasion: "Staff birthday" };
    const e32 = () => t.http().post(`/v1/business/client-wishes/${p}/approve-date`).set(bearer(o.token)).send(wishBody);
    await post(o.token, { personId: p, kind: "b", year: 2033 });
    expect(await used(o.businessId)).toBe(0);
    const first = await e32();
    expect(first.status).toBe(201);
    expect(await used(o.businessId)).toBe(1);
    await post(o.token, { personId: p, kind: "b", year: 2033 });
    await del(o.token, { personId: p, kind: "b", year: 2033 });
    const second = await e32();
    expect(second.body.id).toBe(first.body.id);
    expect(await used(o.businessId)).toBe(1);
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(1);
    // twenty approvals at once: one row, no draw
    const q = await person(o.businessId);
    const rs = await Promise.all(Array.from({ length: 20 }, () => post(o.token, { personId: q, kind: "s", year: 2034 })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(19);
    expect(await used(o.businessId)).toBe(1);
  });

  it("4. another business's person is 404 and nothing of its dates is seen or changed; 401, 403, 422", async () => {
    const o = await owner();
    const other = await owner();
    const p = await person(o.businessId);
    await post(o.token, { personId: p, kind: "b", year: 2033 });
    expect((await post(other.token, { personId: p, kind: "b", year: 2033 })).status).toBe(404);
    expect((await del(other.token, { personId: p, kind: "b", year: 2033 })).status).toBe(404);
    expect(await db.approvedDate.count({ where: { businessId: o.businessId } })).toBe(1);
    expect(await db.approvedDate.count({ where: { businessId: other.businessId } })).toBe(0);
    expect((await t.http().get("/v1/business/approved-dates").set(bearer(other.token))).body.items).toEqual([]);
    expect((await post(o.token, { personId: "not-a-uuid", kind: "b", year: 2033 })).status).toBe(404);
    expect((await post(o.token, { personId: ids.next(), kind: "b", year: 2033 })).status).toBe(404);
    expect((await post(null, { personId: p, kind: "b", year: 2033 })).status).toBe(401);
    expect((await del(null, { personId: p, kind: "b", year: 2033 })).status).toBe(401);
    // a person with no business side is refused
    const plain = ids.next();
    await db.account.create({ data: { id: plain, contact: `b22d-${run}-plain@example.com`, sides: ["person"], lastSide: "person" } });
    t.tokens.set("b22d-plain", { kind: "user", accountId: plain, sides: ["person"] });
    expect((await post("b22d-plain", { personId: p, kind: "b", year: 2033 })).status).toBe(403);
    for (const bad of [{}, { personId: p, kind: "x", year: 2033 }, { personId: p, kind: "b", year: "2033" }, { personId: p, kind: "b", year: 1999 }, { personId: p, kind: "b", year: 2033, extra: 1 }]) {
      expect((await post(o.token, bad)).status).toBe(422);
      expect((await del(o.token, bad)).status).toBe(422);
    }
    const noDate = await person(o.businessId, { birthday: null });
    const r = await post(o.token, { personId: noDate, kind: "b", year: 2033 });
    expect(r.status).toBe(422);
    expect(Object.keys(r.body.error.fields)).toEqual(["kind"]);
  });
});
