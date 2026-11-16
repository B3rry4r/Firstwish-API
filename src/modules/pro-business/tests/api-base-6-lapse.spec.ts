import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { abandonPendingPayments } from "../../payments/abandon";
import { SettlementService } from "../../payments/settlement.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-04-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** P-API-BASE-6 F6 (HU6): a payment the sweep closed that is later reported paid. */
describe("HU6 late success after the sweep", () => {
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

  async function owner() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `ab6l-${run}-${++seq}@example.com`, sides: ["person", "business"], lastSide: "person" } });
    const token = `ab6l2-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW } });
    return { accountId, token, businessId };
  }
  const startPlan = (token: string, idem: string) => t.http().post("/v1/payments").set(bearer(token)).set("Idempotency-Key", idem).send({ purpose: "pro-plan", key: "starter" });
  const late = async (reference: string) => {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    return settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() });
  };

  it("1. the same plan paid for since: the late success is refund due and the plan is applied once", async () => {
    const o = await owner();
    const a = await startPlan(o.token, `ab6l-${run}-a`);
    expect(a.status).toBe(201);
    t.clock.set(new Date(NOW.getTime() + 61 * 60_000));
    expect(await abandonPendingPayments(db, t.clock.now())).toBeGreaterThanOrEqual(1);
    expect((await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } })).status).toBe("abandoned");
    const b = await startPlan(o.token, `ab6l-${run}-b`);
    expect(b.status).toBe(201);
    expect(b.body.payment.reference).not.toBe(a.body.payment.reference);
    expect((await late(b.body.payment.reference)).outcome).toBe("fulfilled");
    const renews = (await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).renews as Date;
    // the stand-in provider's late webhook for the abandoned one
    const r = await late(a.body.payment.reference);
    expect(r).toMatchObject({ outcome: "recorded_unfulfilled", flagged: true });
    const row = await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } });
    expect(row.flags).toEqual(expect.arrayContaining(["late_success_after_abandoned", "refund_due", "refund_due:paid_after_lapse"]));
    expect(row.fulfilledAt).toBeNull();
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).renews?.getTime()).toBe(renews.getTime());
    expect(await db.purchaseGrant.count({ where: { paymentId: row.id } })).toBe(0);
    // a second late delivery changes nothing
    expect((await late(a.body.payment.reference)).outcome).toBe("already");
    const read = await t.http().get(`/v1/payments/${a.body.payment.reference}`).set(bearer(o.token));
    expect(read.body.reason).toMatch(/refunded/);
  });

  it("2. nothing else paid since: the late success still fulfils once, flagged as before", async () => {
    const o = await owner();
    const a = await startPlan(o.token, `ab6l-${run}-c`);
    t.clock.set(new Date(NOW.getTime() + 61 * 60_000));
    await abandonPendingPayments(db, t.clock.now());
    expect((await late(a.body.payment.reference)).outcome).toBe("fulfilled");
    const row = await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } });
    expect(row.flags).toEqual(["late_success_after_abandoned"]);
    expect(row.fulfilledAt).not.toBeNull();
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).plan).toBe("starter");
  });
});
