import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";

const ROOT = join(__dirname, "../../../..");
// A start no other spec uses.
const NOW = new Date("2027-06-07T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("ZB4 and ZB5 (wave 6 join): a business's wishes are reached only through the business", () => {
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

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const who = async (sides: ("business" | "creator")[] = []) => {
    const accountId = ids.next();
    const email = `j6zb-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, name: "Ada Obi", sides: ["person", ...sides], lastSide: "person" } });
    const token = `j6zb-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, email, token };
  };
  const live = { plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2027-06", renews: new Date("2027-07-01T09:00:00.000Z") };
  const owner = async () => {
    const w = await who(["business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Studio", since: NOW, ...live } });
    return { ...w, businessId };
  };
  const login = async (businessId: string) => {
    const w = await who();
    const loginId = ids.next();
    await db.login.create({ data: { id: loginId, businessId, contact: w.email, status: "active" } });
    return { ...w, loginId };
  };
  const letter = { letter: { paras: ["Happy birthday."] } };
  async function draft(token: string) {
    const r = await t.http().post("/v1/wishes").set(bearer(token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: "noir" });
    expect(r.status).toBe(201);
    const s = await t.http().patch(`/v1/wishes/${r.body.id}`).set(bearer(token)).send({ version: r.body.version, content: letter });
    expect(s.status).toBe(200);
    return r.body.id as string;
  }
  const seal = async (token: string, id: string, extra: Record<string, unknown> = {}) => {
    const row = await db.wish.findUniqueOrThrow({ where: { id }, select: { version: true } });
    return t.http().post(`/v1/wishes/${id}/seal`).set(bearer(token)).send({ version: row.version, openNow: true, ...extra });
  };
  /** A login with a sealed wish (on the plan) and a draft from the sheet, both carrying the business. */
  async function setup() {
    const o = await owner();
    const l = await login(o.businessId);
    const sealed = await draft(l.token);
    expect((await seal(l.token, sealed, { usePlan: true })).status).toBe(200);
    const sheet = await t.http().post("/v1/business/client-wishes").set(bearer(l.token)).send({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2027-08-04" });
    expect(sheet.status).toBe(201);
    return { o, l, sealed, drafted: sheet.body.wishId as string };
  }

  it("ZB5: removing a login through the route passes its wishes to the owner in the same step; the login gets 404 and cannot read or seal them; they keep playing", async () => {
    const { o, l, sealed, drafted } = await setup();
    const slug = (await db.wishLink.findFirstOrThrow({ where: { wishId: sealed } })).slug;
    expect((await t.http().get(`/v1/wishes/${drafted}`).set(bearer(l.token))).status).toBe(200);
    expect((await t.http().delete(`/v1/business/logins/${l.loginId}`).set(bearer(o.token))).status).toBe(204);
    for (const id of [sealed, drafted]) {
      expect(await db.wish.findUniqueOrThrow({ where: { id } })).toMatchObject({ accountId: o.accountId, businessId: o.businessId });
      expect((await t.http().get(`/v1/wishes/${id}`).set(bearer(l.token))).status).toBe(404);
      expect((await t.http().get(`/v1/wishes/${id}`).set(bearer(o.token))).status).toBe(200);
    }
    const row = await db.wish.findUniqueOrThrow({ where: { id: drafted } });
    expect((await t.http().patch(`/v1/wishes/${drafted}`).set(bearer(l.token)).send({ version: row.version, content: letter })).status).toBe(404);
    expect((await seal(l.token, drafted)).status).toBe(404);
    expect((await seal(l.token, drafted, { usePlan: true })).status).toBe(403);
    // the owner can write and seal the passed draft
    const mine = await db.wish.findUniqueOrThrow({ where: { id: drafted } });
    expect((await t.http().patch(`/v1/wishes/${drafted}`).set(bearer(o.token)).send({ version: mine.version, content: letter })).status).toBe(200);
    expect((await seal(o.token, drafted)).status).toBe(200);
    // the sealed one keeps playing at its link
    expect((await t.http().get(`/v1/w/${slug}`)).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: sealed } })).status).not.toBe("removed");
  });

  it("ZB5: a wish the login made outside the business, or another business's, does not move", async () => {
    const { o, l } = await setup();
    const personal = await t.http().post("/v1/wishes").set(bearer(l.token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: "noir" });
    const other = await owner();
    const otherLogin = await login(other.businessId);
    const theirs = await draft(otherLogin.token);
    await db.wish.update({ where: { id: theirs }, data: { businessId: other.businessId } });
    expect((await t.http().delete(`/v1/business/logins/${l.loginId}`).set(bearer(o.token))).status).toBe(204);
    expect(await db.wish.findUniqueOrThrow({ where: { id: personal.body.id } })).toMatchObject({ accountId: l.accountId, businessId: null });
    expect(await db.wish.findUniqueOrThrow({ where: { id: theirs } })).toMatchObject({ accountId: otherLogin.accountId });
    expect((await t.http().get(`/v1/wishes/${personal.body.id}`).set(bearer(l.token))).status).toBe(200);
  });

  it("ZB4: erasing the login's own account passes its business wishes (drafts and sealed) to the owner and keeps them playing; its personal wish goes", async () => {
    const { o, l, sealed, drafted } = await setup();
    const personal = await t.http().post("/v1/wishes").set(bearer(l.token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: "noir" });
    const slug = (await db.wishLink.findFirstOrThrow({ where: { wishId: sealed } })).slug;
    await t.app.get(AccountErasureService).erase(l.accountId, { actor: { type: "system", id: null, requestId: "j6" }, reason: "test" });
    for (const id of [sealed, drafted]) {
      expect(await db.wish.findUniqueOrThrow({ where: { id } })).toMatchObject({ accountId: o.accountId, businessId: o.businessId, erasedAt: null });
      expect((await t.http().get(`/v1/wishes/${id}`).set(bearer(o.token))).status).toBe(200);
    }
    expect((await db.wish.findUniqueOrThrow({ where: { id: sealed } })).name).not.toBeNull();
    expect((await t.http().get(`/v1/w/${slug}`)).status).toBe(200);
    expect(await db.wish.findUniqueOrThrow({ where: { id: personal.body.id } })).toMatchObject({ status: "removed", name: null });
    expect((await t.http().get(`/v1/wishes/${drafted}`).set(bearer(l.token))).status).toBe(404);
    // erasing twice changes nothing
    await t.app.get(AccountErasureService).erase(l.accountId, { actor: { type: "system", id: null, requestId: "j6" }, reason: "test" });
    expect((await db.wish.findUniqueOrThrow({ where: { id: sealed } })).accountId).toBe(o.accountId);
  });
});
