import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-04-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-6 case 2 (HR1): what a plan payment would do, one plan payment at a time, packs more than once. */
describe("HR1 plans: the plan read says what a payment does; a second plan start while one waits", () => {
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

  async function owner(over: Record<string, unknown> = {}) {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `ab6p-${run}-${++seq}@example.com`, sides: ["person", "business"], lastSide: "person" } });
    const token = `ab6p-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW, ...over } });
    return { accountId, token, businessId };
  }
  const plan = (token: string) => t.http().get("/v1/business/plan").set(bearer(token));
  const startPlan = (token: string, key: string, idem: string) => t.http().post("/v1/payments").set(bearer(token)).set("Idempotency-Key", idem).send({ purpose: "pro-plan", key });
  const startPack = (token: string, idem: string) => t.http().post("/v1/payments").set(bearer(token)).set("Idempotency-Key", idem).send({ purpose: "wish-pack", packs: 1 });
  const listKobo = async (sku: string) => Number((await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } })).listKobo);
  async function pay(reference: string) {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    expect((await settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
  }

  it("1. with no live plan every plan on offer starts today for a month", async () => {
    const o = await owner();
    const r = await plan(o.token);
    expect(r.status).toBe(200);
    expect(r.body.pending).toBeNull();
    expect((r.body.offers as { plan: string }[]).map((x) => x.plan)).toEqual(["starter", "studio"]);
    for (const x of r.body.offers) {
      expect(x).toMatchObject({ effect: "starts", addsTo: null, replaces: null, startsAt: NOW.toISOString(), runsUntil: "2027-05-10T09:00:00.000Z" });
      expect(x.priceKobo).toBe(await listKobo(`pro.${x.plan}`));
      expect(x.words).toMatch(/starts/);
    }
  });

  it("2. with a live plan: the same plan adds a month to its end; another plan replaces it from now and the time paid for is kept", async () => {
    const renews = new Date("2027-04-25T09:00:00.000Z");
    const o = await owner({ plan: "studio", allowance: 35, used: 3, rolled: 0, month: "2027-04", renews });
    const r = await plan(o.token);
    const studio = (r.body.offers as { plan: string; words: string; runsUntil: string }[]).find((x) => x.plan === "studio") as { plan: string; words: string; runsUntil: string };
    const starter = (r.body.offers as { plan: string; words: string; runsUntil: string }[]).find((x) => x.plan === "starter") as { plan: string; words: string; runsUntil: string };
    expect(studio).toMatchObject({ effect: "adds_month", addsTo: renews.toISOString(), runsUntil: "2027-05-25T09:00:00.000Z", replaces: null });
    expect(studio.words).toMatch(/adds a month/);
    expect(starter).toMatchObject({ effect: "replaces_plan", addsTo: renews.toISOString(), runsUntil: "2027-05-25T09:00:00.000Z", replaces: "studio" });
    expect(starter.words).toMatch(/from today/);
    expect(starter.words).toMatch(/time you paid for is kept/);
    // what the offer says is what the payment does
    const a = await startPlan(o.token, "starter", `ab6p-${run}-a`);
    expect(a.status).toBe(201);
    await pay(a.body.payment.reference);
    const b = await db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    expect(b.plan).toBe("starter");
    expect(b.renews?.toISOString()).toBe(starter.runsUntil);
  });

  it("3. a second plan start while one waits is 409 with words and the waiting payment's reference; the same plan hands that payment back", async () => {
    const o = await owner();
    const first = await startPlan(o.token, "starter", `ab6p-${run}-b1`);
    expect(first.status).toBe(201);
    const ref = first.body.payment.reference as string;
    const other = await startPlan(o.token, "studio", `ab6p-${run}-b2`);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("plan_payment_pending");
    expect(other.body.error.message).toMatch(/waiting to be paid/);
    expect(other.body.error.fields).toEqual({ reference: ref });
    const same = await startPlan(o.token, "starter", `ab6p-${run}-b3`);
    expect([200, 201]).toContain(same.status);
    expect(same.body.payment.reference).toBe(ref);
    expect(await db.payment.count({ where: { businessId: o.businessId, purpose: "pro_plan" } })).toBe(1);
    const r = await plan(o.token);
    expect(r.body.pending).toMatchObject({ reference: ref, plan: "starter" });
    // paid: the next plan start is free to go; a lapse (60 minutes) frees it too
    await pay(ref);
    expect((await plan(o.token)).body.pending).toBeNull();
    const next = await startPlan(o.token, "studio", `ab6p-${run}-b4`);
    expect(next.status).toBe(201);
    t.clock.set(new Date(NOW.getTime() + 61 * 60_000));
    expect((await plan(o.token)).body.pending).toBeNull();
    const late = await startPlan(o.token, "starter", `ab6p-${run}-b5`);
    expect(late.status).toBe(201);
    expect(late.body.payment.reference).not.toBe(next.body.payment.reference);
  });

  it("4. packs may be bought more than once, with a plan payment waiting too", async () => {
    const o = await owner();
    const p1 = await startPack(o.token, `ab6p-${run}-c1`);
    const p2 = await startPack(o.token, `ab6p-${run}-c2`);
    expect(p1.status).toBe(201);
    expect(p2.status).toBe(201);
    expect(p1.body.payment.reference).not.toBe(p2.body.payment.reference);
    expect((await startPlan(o.token, "starter", `ab6p-${run}-c3`)).status).toBe(201);
    expect((await startPack(o.token, `ab6p-${run}-c4`)).status).toBe(201);
    await pay(p1.body.payment.reference);
    await pay(p2.body.payment.reference);
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).pack).toBe(2 * ((await db.purchaseGrant.findFirstOrThrow({ where: { paymentId: (await db.payment.findFirstOrThrow({ where: { providerReference: p1.body.payment.reference } })).id } })).detail as { wishes: number }).wishes);
  });
});
