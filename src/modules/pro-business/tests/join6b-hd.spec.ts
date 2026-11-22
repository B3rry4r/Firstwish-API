import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2208-02-03T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const ALLOWED = [201, 402, 403, 409, 429];

describe("join 6 patch: HD1 login erase, HD3 login check under the owner's lock", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  });
  afterAll(() => t.close());

  const who = async (name: string, sides: string[] = []) => {
    const accountId = ids.next();
    const email = `j6b-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, name, sides: ["person", ...sides] as never, lastSide: "person" } });
    const token = `j6b-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] as never });
    return { accountId, email, token, name };
  };
  const owner = async (allowance = 500) => {
    const w = await who(`Ownerzq${run}${seq}`, ["business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "J6b Studio", business: "J6b Studio", since: NOW, plan: "studio", allowance, used: 0, rolled: 0, month: "2208-02", renews: new Date("2208-03-01T09:00:00.000Z") } });
    return { ...w, businessId };
  };
  const loginOf = async (o: { businessId: string }, name: string) => {
    const w = await who(name);
    const loginId = ids.next();
    await db.login.create({ data: { id: loginId, businessId: o.businessId, contact: w.email, status: "active" } });
    return { ...w, loginId };
  };
  const draft = async (token: string) => {
    const r = await t.http().post("/v1/wishes").set(bearer(token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: "noir" });
    expect(r.status).toBe(201);
    const s = await t.http().patch(`/v1/wishes/${r.body.id}`).set(bearer(token)).send({ version: r.body.version, content: { letter: { paras: ["Hello there."] } } });
    expect(s.status).toBe(200);
    return r.body.id as string;
  };
  const planSeal = async (token: string, id: string) => {
    const row = await db.wish.findUniqueOrThrow({ where: { id }, select: { version: true } });
    return t.http().post(`/v1/wishes/${id}/seal`).set(bearer(token)).send({ version: row.version, usePlan: true, opensAt: "2208-03-10T09:00:00.000Z", timeZone: "Africa/Lagos" });
  };
  const body = (i: number) => ({ client: `Race ${i}`, kind: "birthday", occasion: "birthday", day: "2208-06-04" });

  async function holders(strings: string[]): Promise<string[]> {
    const cols = await db.$queryRaw<{ t: string; c: string }[]>`
      SELECT table_name AS t, column_name AS c FROM information_schema.columns
       WHERE table_schema = 'public' AND (data_type IN ('text', 'character varying', 'json', 'jsonb') OR data_type = 'ARRAY')`;
    const found: string[] = [];
    for (const { t: table, c } of cols) {
      for (const s of strings) {
        const n = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}" WHERE "${c}"::text ILIKE $1`, `%${s}%`);
        if (Number(n[0].n) > 0) found.push(`${table}.${c}:${s}`);
      }
    }
    return found;
  }

  it("HD1: a login's own erase leaves neither their email nor their name in any table, login rows included", async () => {
    const o = await owner();
    const l = await loginOf(o, `Loginzq${run} Okafor`);
    const other = await loginOf(o, "Other Login");
    expect(await db.login.count({ where: { contact: l.email } })).toBe(1);
    await t.app.get(AccountErasureService).erase(l.accountId, { actor: { type: "system", id: null, requestId: "j6b" }, reason: "test" });
    expect(await holders([l.email, `Loginzq${run}`])).toEqual([]);
    const row = await db.login.findUniqueOrThrow({ where: { id: l.loginId } });
    expect(row.contact).toBeNull();
    // another login's row, and the owner's, are untouched
    expect((await db.login.findUniqueOrThrow({ where: { id: other.loginId } })).contact).toBe(other.email);
  });

  it("HD3a: 20 wishes and 10 plan seals in flight while the login is removed: all the owner's, none readable by the removed login, counts exact", async () => {
    const errs: string[] = [];
    const spy = jest.spyOn(Logger.prototype, "error").mockImplementation((m: unknown, ...rest: unknown[]) => { errs.push(String(m).slice(0, 600) + " | " + String(rest[0]).slice(0, 900)); });
    const o = await owner();
    const l = await loginOf(o, "Racer Login");
    const drafts: string[] = [];
    for (let i = 0; i < 10; i++) drafts.push(await draft(l.token));
    const before = await db.business.findUniqueOrThrow({ where: { id: o.businessId }, select: { used: true } });
    const ops: Promise<{ status: number }>[] = [];
    for (let i = 0; i < 20; i++) ops.push(t.http().post("/v1/business/client-wishes").set(bearer(l.token)).send(body(i)));
    for (const id of drafts) ops.push(planSeal(l.token, id));
    const removal = t.http().delete(`/v1/business/logins/${l.loginId}`).set(bearer(o.token));
    const res = await Promise.all([...ops, removal]);
    spy.mockRestore();
    if (res[res.length - 1].status !== 204) console.log("ERRS", JSON.stringify([...new Set(errs)].slice(0, 3)));
    expect(res[res.length - 1].status).toBe(204);
    for (const r of res.slice(0, -1)) expect([200, 201, 402, 403, 404, 409, 429]).toContain(r.status);
    const made = res.slice(0, 20).filter((r) => r.status === 201).length;
    const sealed = res.slice(20, 30).filter((r) => r.status === 200).length;
    const all = await db.wish.findMany({ where: { businessId: o.businessId } });
    expect(all.filter((w) => w.accountId === l.accountId)).toEqual([]);
    for (const w of all) expect(w.accountId).toBe(o.accountId);
    expect(all.length).toBe(made + sealed);
    for (const w of all) expect((await t.http().get(`/v1/wishes/${w.id}`).set(bearer(l.token))).status).toBe(404);
    const after = await db.business.findUniqueOrThrow({ where: { id: o.businessId }, select: { used: true } });
    expect((after.used ?? 0) - (before.used ?? 0)).toBe(made + sealed);
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(made + sealed);
    // a login removed before the request gets nothing and draws nothing
    const late = await t.http().post("/v1/business/client-wishes").set(bearer(l.token)).send(body(99));
    expect([403, 404]).toContain(late.status);
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId }, select: { used: true } })).used).toBe(after.used);
  });

  it("HD3b: POST /v1/business/client-wishes under 20 at once, 40 runs, answers only 201, 402, 403, 409 or 429", async () => {
    const errs: string[] = [];
    const spy = jest.spyOn(Logger.prototype, "error").mockImplementation((m: unknown) => { errs.push(String(m).slice(0, 900)); });
    const o = await owner(300);
    const l = await loginOf(o, "Load Login");
    const bad: string[] = [];
    for (let run40 = 0; run40 < 40; run40++) {
      const res = await Promise.all(Array.from({ length: 20 }, (_, i) => t.http().post("/v1/business/client-wishes").set(bearer(run40 % 2 ? l.token : o.token)).send(body(i))));
      for (const r of res) if (!ALLOWED.includes(r.status)) bad.push(`${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    }
    spy.mockRestore();
    expect({ bad: [...new Set(bad)].slice(0, 3), errs: [...new Set(errs)].slice(0, 3) }).toEqual({ bad: [], errs: [] });
  }, 300000);
});
