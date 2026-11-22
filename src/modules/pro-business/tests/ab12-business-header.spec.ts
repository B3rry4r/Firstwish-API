import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { StandinStorage } from "../../../common/ports/adapters/standins";
import { StoragePort } from "../../../common/ports/storage.port";
import { PNG } from "../../stored-files/tests/files-kit";
import { SettlementService } from "../../payments/settlement.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-06-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-12 case 1 (HR3, IF2a): one person in two businesses works in the one the header names, in their role there. */
describe("HR3: the people, payment and brand routes follow x-business-id", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function account(tag: string, sides: string[] = ["person", "business"]) {
    const accountId = ids.next();
    const contact = `ab12-${run}-${tag}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact, sides, lastSide: "person" } as never });
    const token = `ab12-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: sides as never });
    return { accountId, token, contact };
  }
  async function business(accountId: string, name: string) {
    const id = ids.next();
    await db.business.create({ data: { id, accountId, name, business: name, since: NOW } });
    return id;
  }
  const loginOf = async (businessId: string, contact: string, status = "active") => {
    await db.login.create({ data: { id: ids.next(), businessId, contact, status } });
  };
  /** A person who owns A and is a login of B, another who owns two businesses, and a login of both with no business of their own. */
  async function cast() {
    const p = await account("p");
    const a = await business(p.accountId, "Alpha");
    const o = await account("o");
    const b = await business(o.accountId, "Beta");
    await loginOf(b, p.contact);
    const two = await account("two");
    const t1 = await business(two.accountId, "Twin one");
    const t2 = await business(two.accountId, "Twin two");
    const l = await account("l", ["person"]);
    await loginOf(a, l.contact);
    await loginOf(b, l.contact);
    const stranger = await account("s");
    const sb = await business(stranger.accountId, "Elsewhere");
    return { p, a, o, b, two, t1, t2, l, stranger, sb };
  }

  const people = (token: string, header?: string) => (header === undefined ? t.http().get("/v1/business/people").set(bearer(token)) : t.http().get("/v1/business/people").set(bearer(token)).set("x-business-id", header));
  const addPerson = (token: string, name: string, header?: string) => {
    const r = t.http().post("/v1/business/people").set(bearer(token));
    return (header === undefined ? r : r.set("x-business-id", header)).send({ name, phone: `0803${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, team: "Team" });
  };
  const startPlan = (token: string, header: string | undefined, key = "starter", idem = `ab12-${run}-${++seq}-plan`) => {
    const r = t.http().post("/v1/payments").set(bearer(token)).set("Idempotency-Key", idem);
    return (header === undefined ? r : r.set("x-business-id", header)).send({ purpose: "pro-plan", key });
  };
  const names = (res: { body: { items: { name: string }[] } }) => res.body.items.map((x) => x.name).sort();

  it("1a. People: each business has its own, read, added and removed through the header, in upper case too; no header is as today", async () => {
    const c = await cast();
    expect((await addPerson(c.p.token, "OnlyAlpha")).status).toBe(201);
    expect((await addPerson(c.p.token, "OnlyBeta", c.b)).status).toBe(201); // a login of B adds there
    expect((await addPerson(c.o.token, "BetaOwner")).status).toBe(201);
    expect(names(await people(c.p.token))).toEqual(["OnlyAlpha"]);
    expect(names(await people(c.p.token, c.a))).toEqual(["OnlyAlpha"]);
    expect(names(await people(c.p.token, c.b))).toEqual(["BetaOwner", "OnlyBeta"]);
    expect(names(await people(c.p.token, c.b.toUpperCase()))).toEqual(["BetaOwner", "OnlyBeta"]);
    const rows = await db.person.findMany({ where: { name: "OnlyBeta" } });
    expect(rows.map((r) => r.businessId)).toEqual([c.b]);
    // the person of the other business is reached through the header only; removal is of the named business's rows
    const items = (await people(c.p.token, c.b)).body.items as { id: string; name: string }[];
    const mine = items.find((x) => x.name === "OnlyBeta") as { id: string };
    expect((await t.http().delete(`/v1/business/people/${mine.id}`).set(bearer(c.p.token)).send({})).status).toBe(404); // not A's
    expect((await t.http().delete(`/v1/business/people/${mine.id}`).set(bearer(c.p.token)).set("x-business-id", c.b).send({})).status).toBe(204);
    expect(names(await people(c.p.token, c.b))).toEqual(["BetaOwner"]);
    // a login of both, with no business of their own, reads each
    expect(names(await people(c.l.token, c.a))).toEqual(["OnlyAlpha"]);
    expect(names(await people(c.l.token, c.b))).toEqual(["BetaOwner"]);
    // an owner of two businesses: each is its own
    await addPerson(c.two.token, "Twin1", c.t1);
    await addPerson(c.two.token, "Twin2", c.t2);
    expect(names(await people(c.two.token, c.t1))).toEqual(["Twin1"]);
    expect(names(await people(c.two.token, c.t2))).toEqual(["Twin2"]);
    const dates = await t.http().get("/v1/business/approved-dates").set(bearer(c.two.token)).set("x-business-id", c.t2.toUpperCase());
    expect(dates.status).toBe(200);
  });

  it("1b. Attacks on the header: a business the caller is not in is 404, a non-id 422 in words, a business that does not exist 404", async () => {
    const c = await cast();
    const stranger = await people(c.p.token, c.sb);
    expect(stranger.status).toBe(404);
    expect(stranger.body.error.message).toBe("No such business.");
    expect((await addPerson(c.p.token, "Nope", c.sb)).status).toBe(404);
    expect((await people(c.p.token, ids.next())).status).toBe(404);
    for (const bad of ["not-a-uuid", "1", "'; drop table person;--", `${c.a},${c.b}`]) {
      const r = await people(c.p.token, bad);
      expect(r.status).toBe(422);
      expect(r.body.error.fields["x-business-id"]).toBe("Must be a business id.");
    }
    expect((await startPlan(c.p.token, "nope")).status).toBe(422);
    expect((await startPlan(c.p.token, c.sb)).status).toBe(404);
    expect(await db.person.count({ where: { name: "Nope" } })).toBe(0);
    // a login removed from B is told so with words, as on every business read
    await db.login.updateMany({ where: { businessId: c.b, contact: c.l.contact }, data: { status: "removed" } });
    const gone = await people(c.l.token, c.b);
    expect(gone.status).toBe(403);
    expect(gone.body.error.code).toBe("login_removed");
    expect((await people(c.l.token, c.a)).status).toBe(200);
  });

  it("1c. Payments: a plan or a pack is started for the named business by its owner; a login of it is refused in words; nothing lands on the other", async () => {
    const c = await cast();
    // an owner of A who is a login of B pays B's plan: refused in words, and nothing is stored
    const refused = await startPlan(c.p.token, c.b);
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain("Only the owner of a business can pay for it");
    const pack = await t.http().post("/v1/payments").set(bearer(c.p.token)).set("x-business-id", c.b).set("Idempotency-Key", `ab12-${run}-${++seq}-pk`).send({ purpose: "wish-pack", packs: 1 });
    expect(pack.status).toBe(403);
    expect((await startPlan(c.l.token, c.b)).status).toBe(403);
    expect(await db.payment.count({ where: { businessId: c.b } })).toBe(0);
    // the same person pays A's plan through the header, in upper case, and with no header as today
    const own = await startPlan(c.p.token, c.a.toUpperCase());
    expect(own.status).toBe(201);
    expect((await db.payment.findUniqueOrThrow({ where: { providerReference: own.body.payment.reference } })).businessId).toBe(c.a);
    // an owner of two businesses: a plan started for the second never lands on the first (payment row, ledger, plan rows)
    const second = await startPlan(c.two.token, c.t2.toUpperCase(), "studio");
    expect(second.status).toBe(201);
    const ref = second.body.payment.reference as string;
    const row = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(row.businessId).toBe(c.t2);
    expect((await settle.settle({ reference: ref, status: "success", amountKobo: row.amountKobo, currency: "NGN", paidAt: NOW })).outcome).toBe("fulfilled");
    const settled = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(settled.businessId).toBe(c.t2);
    expect((await db.business.findUniqueOrThrow({ where: { id: c.t2 } })).plan).toBe("studio");
    expect((await db.business.findUniqueOrThrow({ where: { id: c.t1 } })).plan).toBeNull();
    expect(await db.purchaseGrant.count({ where: { paymentId: row.id, businessId: c.t2 } })).toBeGreaterThan(0);
    expect(await db.purchaseGrant.count({ where: { businessId: c.t1 } })).toBe(0);
    const ledger = await db.$queryRaw<{ d: bigint; c: bigint; n: number }[]>`SELECT coalesce(sum("amountKobo") FILTER (WHERE direction = 'debit'), 0) AS d, coalesce(sum("amountKobo") FILTER (WHERE direction = 'credit'), 0) AS c, count(*)::int AS n FROM ledger_entry WHERE "paymentId" = ${row.id}::uuid`;
    expect(ledger[0].n).toBeGreaterThan(0);
    expect(String(ledger[0].d)).toBe(String(ledger[0].c));
    // the plan and usage reads follow the header: the second shows the plan, the first none
    const read = (path: string, b: string) => t.http().get(path).set(bearer(c.two.token)).set("x-business-id", b);
    expect((await read("/v1/business/plan", c.t2)).body.plan).toBe("studio");
    expect((await read("/v1/business/plan", c.t1)).body.plan).not.toBe("studio");
    expect((await read("/v1/business/usage", c.t2)).body.plan).toBe("studio");
    // the same key naming another business is another payment: 409, not the first one handed back
    const key = `ab12-${run}-${++seq}-same`;
    expect((await startPlan(c.two.token, c.t1, "starter", key)).status).toBe(201);
    const again = await startPlan(c.two.token, c.t2, "starter", key);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("idempotency_key_reused");
    // invoices are the owner's: a login of the business is refused (as every owner-only business route already does)
    expect((await t.http().get("/v1/business/invoices").set(bearer(c.l.token)).set("x-business-id", c.a)).status).toBe(403);
    expect((await t.http().get("/v1/business/invoices").set(bearer(c.two.token)).set("x-business-id", c.t2)).status).toBe(200);
  });

  it("1d. Brand: an upload and the brand itself go to the named business, by its owner alone", async () => {
    const c = await cast();
    const ticket = (token: string, header?: string) => {
      const r = t.http().post("/v1/uploads").set(bearer(token));
      return (header === undefined ? r : r.set("x-business-id", header)).send({ purpose: "brand", contentType: "image/png", bytes: 1000 });
    };
    const forSecond = await ticket(c.two.token, c.t2.toUpperCase());
    expect(forSecond.status).toBe(201);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: forSecond.body.id } })).businessId).toBe(c.t2);
    const forFirst = await ticket(c.two.token, c.t1);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: forFirst.body.id } })).businessId).toBe(c.t1);
    expect((await ticket(c.p.token, c.b)).status).toBe(403); // a login of B
    expect((await ticket(c.p.token, c.sb)).status).toBe(404);
    expect((await ticket(c.p.token, "nope")).status).toBe(422);
    expect((await ticket(c.p.token)).status).toBe(201); // no header: the person's own, as today
    // the brand is set on the named business; a logo uploaded for the other business is refused there
    const file = async (businessId: string, ownerAccountId: string) => {
      const id = ids.next();
      t.app.get<StandinStorage>(StoragePort).put(`files/${id}`, PNG(10), "image/png");
      await db.storedFile.create({ data: { id, ownerAccountId, businessId, purpose: "brand_logo", objectKey: `files/${id}`, contentType: "image/png", bytes: BigInt(10), status: "ready", variants: [], driver: "r2" } as never });
      return id;
    };
    const patch = (token: string, header: string, brand: object) => t.http().patch("/v1/business").set(bearer(token)).set("x-business-id", header).send({ brand });
    const res = await patch(c.two.token, c.t2.toUpperCase(), { line: "Second only" });
    expect(res.status).toBe(200);
    expect((await db.business.findUniqueOrThrow({ where: { id: c.t2 } })).brand).toMatchObject({ line: "Second only" });
    expect((await db.business.findUniqueOrThrow({ where: { id: c.t1 } })).brand ?? {}).not.toMatchObject({ line: "Second only" });
    const logo1 = await file(c.t1, c.two.accountId);
    expect((await patch(c.two.token, c.t2, { logo: logo1 })).status).toBe(422);
    expect((await patch(c.two.token, c.t1, { logo: logo1 })).status).toBe(200);
    expect((await patch(c.p.token, c.b, { line: "Mine now" })).status).toBe(403);
    expect((await patch(c.p.token, c.sb, { line: "Mine now" })).status).toBe(404);
    expect((await patch(c.p.token, "nope", { line: "x" })).status).toBe(422);
  });
});
