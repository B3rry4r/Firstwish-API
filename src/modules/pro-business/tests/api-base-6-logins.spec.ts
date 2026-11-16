import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";

const NOW = new Date("2027-05-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-6 case 3 (HR3): /me carries the businesses the person is a login of; a removed login's reads say so. */
describe("HR3 logins: /me lists the businesses; a removed login is told", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    // the live login's read needs the price book, so this spec seeds it itself (it passed before only when another spec had seeded the shared database)
    const r = spawnSync(process.execPath, [join(__dirname, "../../../../scripts/seed.mjs")], { env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  async function person(sides: ("business" | "creator")[] = []) {
    const accountId = ids.next();
    const email = `ab6l-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, sides: ["person", ...sides], lastSide: "person" } });
    const token = `ab6l-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, email, token };
  }
  async function business(name: string) {
    const o = await person(["business"]);
    const id = ids.next();
    await db.business.create({ data: { id, accountId: o.accountId, name, business: name, since: NOW } });
    return { ...o, businessId: id, name };
  }
  const login = (businessId: string, contact: string, status: string) => db.login.create({ data: { id: ids.next(), businessId, contact: contact.toUpperCase(), status } });
  const me = (token: string) => t.http().get("/v1/me").set(bearer(token));

  it("1. /me carries the business the person owns and each business they are a login of, with the login's state", async () => {
    const a = await business("Alpha Studio");
    const b = await business("Beta Events");
    const c = await business("Gamma Cakes");
    const p = await business("Own Shop");
    await login(a.businessId, p.email, "active");
    await login(b.businessId, p.email, "invited");
    await login(c.businessId, p.email, "removed");
    const r = await me(p.token);
    expect(r.status).toBe(200);
    // HU5: a business the person was removed from (c) is not listed
    expect(r.body.businesses).toEqual([
      { id: p.businessId, name: "Own Shop", role: "owner", state: "owner" },
      ...[a, b].map((x) => ({ id: x.businessId, name: x.name, role: "login", state: ({ [a.businessId]: "active", [b.businessId]: "invited" } as Record<string, string>)[x.businessId] })),
    ]);
  });

  it("2. a person who is only a login sees the business in /me and no owned one; a person with none sees an empty list; another person's logins are not listed", async () => {
    const a = await business("Delta Prints");
    const only = await person();
    await login(a.businessId, only.email, "active");
    const stranger = await person();
    expect((await me(only.token)).body.businesses).toEqual([{ id: a.businessId, name: "Delta Prints", role: "login", state: "active" }]);
    expect((await me(stranger.token)).body.businesses).toEqual([]);
    expect((await me(a.token)).body.businesses).toEqual([{ id: a.businessId, name: "Delta Prints", role: "owner", state: "owner" }]);
  });

  it("3. a removed login's business reads answer 403 with words that say so (with and without the business header); a live login still works", async () => {
    const a = await business("Epsilon Frames");
    const gone = await person();
    await login(a.businessId, gone.email, "removed");
    const goneBiz = await person(["business"]);
    await login(a.businessId, goneBiz.email, "removed");
    // HU5: the same refusal on every business read (people, approved dates and the vault's files too), for a person of any side
    for (const who of [gone, goneBiz]) for (const path of ["/v1/business/people", "/v1/business/approved-dates", "/v1/business/vault-files"]) {
      const r = await t.http().get(path).set(bearer(who.token));
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("login_removed");
    }
    for (const path of ["/v1/business", "/v1/business/plan", "/v1/business/usage", "/v1/business/client-wishes"]) {
      const plain = await t.http().get(path).set(bearer(gone.token));
      expect(plain.status).toBe(403);
      expect(plain.body.error.code).toBe("login_removed");
      expect(plain.body.error.message).toMatch(/removed from this business/);
      const named = await t.http().get(path).set(bearer(gone.token)).set("x-business-id", a.businessId);
      expect(named.status).toBe(403);
      expect(named.body.error.code).toBe("login_removed");
    }
    const none = await person();
    const plainNo = await t.http().get("/v1/business").set(bearer(none.token));
    expect(plainNo.status).toBe(403);
    expect(plainNo.body.error.message).toBe("You are not part of a business.");
    const other = await t.http().get("/v1/business").set(bearer(none.token)).set("x-business-id", a.businessId);
    expect(other.body.error.message).toBe("You are not part of that business.");
    const live = await person();
    await login(a.businessId, live.email, "active");
    expect((await t.http().get("/v1/business").set(bearer(live.token))).status).toBe(200);
  });
});
