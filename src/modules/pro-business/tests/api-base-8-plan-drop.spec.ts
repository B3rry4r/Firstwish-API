import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-05-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-8 case 1 (HY1, HR1, HU6): a waiting plan payment never traps the business; the owner drops it at once. */
describe("HY1 plan payments: lapse time, everyone who may pay reads it, the owner drops it", () => {
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

  async function account(tag: string) {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `ab8d-${run}-${tag}-${++seq}@example.com`, sides: ["person", "business"], lastSide: "person" } });
    const token = `ab8d-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    return { accountId, token, contact: `ab8d-${run}-${tag}-${seq}@example.com` };
  }
  async function owner() {
    const o = await account("o");
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: o.accountId, name: "Studio", business: "Studio", since: NOW } });
    return { ...o, businessId };
  }
  async function loginOf(businessId: string, status = "active") {
    const l = await account("l");
    await db.login.create({ data: { id: ids.next(), businessId, contact: l.contact, status } });
    return l;
  }
  const plan = (token: string) => t.http().get("/v1/business/plan").set(bearer(token));
  const startPlan = (token: string, key: string, idem: string) => t.http().post("/v1/payments").set(bearer(token)).set("Idempotency-Key", idem).send({ purpose: "pro-plan", key });
  const read = (token: string, ref: string) => t.http().get(`/v1/payments/${ref}`).set(bearer(token));
  const drop = (token: string, ref: string) => t.http().post(`/v1/business/plan/pending/${ref}/drop`).set(bearer(token));
  const idem = (s: string) => `ab8d-${run}-${s}-${++seq}`;
  async function pay(reference: string) {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    return settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() });
  }
  /** The pairs below make 90 paid payments: once checked they leave the "succeeded" state, so the shared database's newest-succeeded page reads as the other specs expect. */
  const retire = (paymentIds: string[]) => db.payment.updateMany({ where: { id: { in: paymentIds } }, data: { status: "refunded" } });
  async function balanced(paymentId: string) {
    const [l] = await db.$queryRaw<{ d: bigint; c: bigint; n: number }[]>`SELECT coalesce(sum("amountKobo") FILTER (WHERE direction = 'debit'),0) AS d, coalesce(sum("amountKobo") FILTER (WHERE direction = 'credit'),0) AS c, count(*)::int AS n FROM ledger_entry WHERE "paymentId" = ${paymentId}::uuid`;
    return l;
  }

  it("1. the plan read's pending says when the payment lapses", async () => {
    const o = await owner();
    const started = await startPlan(o.token, "starter", idem("a"));
    expect(started.status).toBe(201);
    const r = await plan(o.token);
    expect(r.body.pending).toMatchObject({ reference: started.body.payment.reference, plan: "starter", startedAt: NOW.toISOString(), lapsesAt: "2027-05-10T10:00:00.000Z" });
  });

  it("2. a login's plan payment is read by the owner and by another live login; an outsider and another business get 404", async () => {
    const o = await owner();
    const l1 = await loginOf(o.businessId);
    const l2 = await loginOf(o.businessId, "invited");
    const removed = await loginOf(o.businessId, "removed");
    const other = await owner();
    const started = await startPlan(l1.token, "studio", idem("b"));
    expect(started.status).toBe(201);
    const ref = started.body.payment.reference as string;
    for (const who of [l1, o, l2]) {
      const r = await read(who.token, ref);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ reference: ref, state: "pending", purpose: "pro-plan" });
    }
    expect((await read(other.token, ref)).status).toBe(404);
    expect((await read(removed.token, ref)).status).toBe(404);
    const outsider = await account("x");
    expect((await read(outsider.token, ref)).status).toBe(404);
    // the owner's own payment is not readable by a login of another business, and the plan read (the owner's) shows the login's waiting payment
    expect((await plan(o.token)).body.pending).toMatchObject({ reference: ref });
    // a person's payment that is no plan payment stays the payer's own
    expect((await read(o.token, `fw-${ids.next()}`)).status).toBe(404);
  });

  it("3. the owner drops a waiting payment at once; a new start is allowed; the audit row is the business's own act", async () => {
    const o = await owner();
    const l = await loginOf(o.businessId);
    const first = await startPlan(l.token, "starter", idem("c"));
    const ref = first.body.payment.reference as string;
    expect((await startPlan(o.token, "studio", idem("c2"))).status).toBe(409);
    const d = await drop(o.token, ref);
    expect(d.status).toBe(200);
    expect(d.body.pending).toBeNull();
    const row = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(row.status).toBe("abandoned");
    expect(row.flags).toContain("dropped_by_owner");
    const audit = await db.auditEntry.findMany({ where: { subjectId: row.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorType: "account", actorId: o.accountId, action: "plan.drop-pending", section: "/business/plan" });
    expect((await read(l.token, ref)).body.state).toBe("abandoned");
    const next = await startPlan(o.token, "studio", idem("c3"));
    expect(next.status).toBe(201);
    expect(next.body.payment.reference).not.toBe(ref);
  });

  it("4. a login cannot drop the owner's payment (403), another business's payment is 404, and neither changes it", async () => {
    const o = await owner();
    const l = await loginOf(o.businessId);
    const other = await owner();
    const ref = (await startPlan(o.token, "starter", idem("d"))).body.payment.reference as string;
    const byLogin = await drop(l.token, ref);
    expect(byLogin.status).toBe(403);
    expect(byLogin.body.error.message).toMatch(/owner/);
    expect((await drop(other.token, ref)).status).toBe(404);
    expect((await drop(o.token, `fw-${ids.next()}`)).status).toBe(404);
    expect((await db.payment.findUniqueOrThrow({ where: { providerReference: ref } })).status).toBe("pending");
    expect(await db.auditEntry.count({ where: { action: "plan.drop-pending", actorId: { in: [l.accountId, other.accountId] } } })).toBe(0);
  });

  it("5. a payment dropped twice writes one audit row; a settled one is 409 with words and is left as it is", async () => {
    const o = await owner();
    const ref = (await startPlan(o.token, "starter", idem("e"))).body.payment.reference as string;
    expect((await drop(o.token, ref)).status).toBe(200);
    const again = await drop(o.token, ref);
    expect(again.status).toBe(200);
    const row = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(await db.auditEntry.count({ where: { subjectId: row.id, action: "plan.drop-pending" } })).toBe(1);
    const paidRef = (await startPlan(o.token, "starter", idem("e2"))).body.payment.reference as string;
    expect((await pay(paidRef)).outcome).toBe("fulfilled");
    const late = await drop(o.token, paidRef);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("plan_payment_not_waiting");
    expect(late.body.error.message).toMatch(/paid/);
    expect((await db.payment.findUniqueOrThrow({ where: { providerReference: paidRef } })).status).toBe("succeeded");
  });

  it("6. a late paid for the dropped payment is fulfilled when nothing else has paid for a plan since", async () => {
    const o = await owner();
    const ref = (await startPlan(o.token, "starter", idem("f"))).body.payment.reference as string;
    expect((await drop(o.token, ref)).status).toBe(200);
    t.clock.set(new Date(NOW.getTime() + 5 * 60_000));
    const r = await pay(ref);
    expect(r).toEqual({ outcome: "fulfilled", flagged: true });
    const b = await db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    expect(b.plan).toBe("starter");
    expect(b.renews?.toISOString()).toBe("2027-06-10T09:05:00.000Z");
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(p.fulfilledAt).not.toBeNull();
    expect(p.flags).not.toContain("refund_due");
  });

  it("7. a late paid for the dropped payment is refund due when something else paid for a plan since (a login's payment, the owner's drop)", async () => {
    const o = await owner();
    const l = await loginOf(o.businessId);
    const ref = (await startPlan(l.token, "starter", idem("g"))).body.payment.reference as string;
    expect((await drop(o.token, ref)).status).toBe(200);
    t.clock.set(new Date(NOW.getTime() + 2 * 60_000));
    const second = (await startPlan(o.token, "studio", idem("g2"))).body.payment.reference as string;
    t.clock.set(new Date(NOW.getTime() + 4 * 60_000));
    expect((await pay(second)).outcome).toBe("fulfilled");
    t.clock.set(new Date(NOW.getTime() + 6 * 60_000));
    const late = await pay(ref);
    expect(late).toEqual({ outcome: "recorded_unfulfilled", flagged: true });
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(p.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:paid_after_drop"]));
    expect(p.fulfilledAt).toBeNull();
    const view = await read(l.token, ref);
    expect(view.body.reason).toMatch(/dropped/);
    // the plan is the second one's alone: studio, a month from its own payment
    const b = await db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    expect(b.plan).toBe("studio");
    expect(b.renews?.toISOString()).toBe("2027-06-10T09:04:00.000Z");
  });

  it("8. attack: a drop and a settle at the same moment, 30 pairs: one outcome each, the ledger balanced, one live plan, no lost payment", async () => {
    let dropped = 0;
    let settledFirst = 0;
    for (let i = 0; i < 30; i++) {
      const b = ids.next();
      const acct = await account("r");
      await db.business.create({ data: { id: b, accountId: acct.accountId, name: "Race", business: "Race", since: NOW } });
      const ref = (await startPlan(acct.token, "starter", idem(`r${i}`))).body.payment.reference as string;
      const [d, s] = await Promise.all([drop(acct.token, ref), pay(ref)]);
      const p = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
      // the payment was paid either way: settled first (the drop is 409) or dropped first (the late paid is fulfilled, nothing else paid)
      expect(s.outcome).toBe("fulfilled");
      expect(p.status).toBe("succeeded");
      expect(p.fulfilledAt).not.toBeNull();
      expect([200, 409]).toContain(d.status);
      if (d.status === 200) {
        dropped++;
        expect(p.flags).toContain("late_success_after_abandoned");
      } else {
        settledFirst++;
        expect(d.body.error.code).toBe("plan_payment_not_waiting");
        expect(p.flags).not.toContain("dropped_by_owner");
      }
      const led = await balanced(p.id);
      expect(led.n).toBeGreaterThan(0);
      expect(String(led.d)).toBe(String(led.c));
      expect(await db.payment.count({ where: { businessId: b, purpose: "pro_plan", status: "succeeded" } })).toBe(1);
      const biz = await db.business.findUniqueOrThrow({ where: { id: b } });
      expect(biz.plan).toBe("starter");
      expect(biz.renews?.toISOString()).toBe("2027-06-10T09:00:00.000Z");
      expect(await db.auditEntry.count({ where: { subjectId: p.id, action: "plan.drop-pending" } })).toBe(d.status === 200 ? 1 : 0);
      await retire([p.id]);
    }
    expect(dropped + settledFirst).toBe(30);
  });

  const at = (min: number) => t.clock.set(new Date(NOW.getTime() + min * 60_000));
  const row = (ref: string) => db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
  const invoices = (businessId: string) => db.invoice.count({ where: { businessId } });

  it("9. HZ3 drop A, start B, A paid then B paid: A is applied, B is refund due with words; one plan, one invoice", async () => {
    const o = await owner();
    const a = (await startPlan(o.token, "starter", idem("z1a"))).body.payment.reference as string;
    expect((await drop(o.token, a)).status).toBe(200);
    at(2);
    const b = (await startPlan(o.token, "starter", idem("z1b"))).body.payment.reference as string;
    at(4);
    expect((await pay(a)).outcome).toBe("fulfilled");
    at(6);
    expect(await pay(b)).toEqual({ outcome: "recorded_unfulfilled", flagged: true });
    const pb = await row(b);
    expect(pb.fulfilledAt).toBeNull();
    expect(pb.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:plan_applied_meanwhile"]));
    expect((await read(o.token, b)).body.reason).toMatch(/plan was paid for another way after this payment was started/);
    expect((await row(a)).fulfilledAt).not.toBeNull();
    expect(await invoices(o.businessId)).toBe(1);
    const biz = await db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    expect(biz.plan).toBe("starter");
    expect(biz.renews?.toISOString()).toBe("2027-06-10T09:04:00.000Z");
    for (const ref of [a, b]) {
      const led = await balanced((await row(ref)).id);
      expect(String(led.d)).toBe(String(led.c));
    }
  });

  it("10. HZ3 the other order: B paid then A late: A is refund due, B applied, one invoice", async () => {
    const o = await owner();
    const a = (await startPlan(o.token, "starter", idem("z2a"))).body.payment.reference as string;
    expect((await drop(o.token, a)).status).toBe(200);
    at(2);
    const b = (await startPlan(o.token, "studio", idem("z2b"))).body.payment.reference as string;
    at(4);
    expect((await pay(b)).outcome).toBe("fulfilled");
    at(6);
    expect(await pay(a)).toEqual({ outcome: "recorded_unfulfilled", flagged: true });
    expect((await row(a)).flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:paid_after_drop"]));
    expect(await invoices(o.businessId)).toBe(1);
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).plan).toBe("studio");
  });

  it("11. HZ3 after a lapse instead of a drop: the same, whichever of the two is reported paid first", async () => {
    for (const firstPaid of ["a", "b"] as const) {
      const o = await owner();
      const a = (await startPlan(o.token, "starter", idem(`z3a${firstPaid}`))).body.payment.reference as string;
      await db.payment.update({ where: { providerReference: a }, data: { status: "abandoned" } });
      at(2);
      const b = (await startPlan(o.token, "starter", idem(`z3b${firstPaid}`))).body.payment.reference as string;
      at(4);
      const [one, two] = firstPaid === "a" ? [a, b] : [b, a];
      expect((await pay(one)).outcome).toBe("fulfilled");
      at(6);
      expect((await pay(two)).outcome).toBe("recorded_unfulfilled");
      const late = await row(two);
      expect(late.fulfilledAt).toBeNull();
      expect(late.flags).toContain("refund_due");
      expect((await read(o.token, two)).body.reason).toMatch(/refunded/);
      expect(await invoices(o.businessId)).toBe(1);
      at(0);
    }
  });

  it("12. HZ3 paying again after the first was fulfilled is a new intent and adds a month", async () => {
    const o = await owner();
    const a = (await startPlan(o.token, "starter", idem("z4a"))).body.payment.reference as string;
    at(2);
    expect((await pay(a)).outcome).toBe("fulfilled");
    at(4);
    const c = (await startPlan(o.token, "starter", idem("z4c"))).body.payment.reference as string;
    at(6);
    expect((await pay(c)).outcome).toBe("fulfilled");
    expect(await invoices(o.businessId)).toBe(2);
    const biz = await db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    expect(biz.renews?.toISOString()).toBe("2027-07-10T09:02:00.000Z");
  });

  it("13. HZ4 a plan-payment start naming the pack is 422 with words; a pack bought as a pack still works", async () => {
    const o = await owner();
    const r = await startPlan(o.token, "pack", idem("z5"));
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toMatch(/pack/);
    expect(await db.payment.count({ where: { businessId: o.businessId } })).toBe(0);
    const ok = await t.http().post("/v1/payments").set(bearer(o.token)).set("Idempotency-Key", idem("z5b")).send({ purpose: "wish-pack" });
    expect([201, 200]).toContain(ok.status);
  });

  it("14. HZ3 attack: A dropped, B started, both reported paid at the same moment, 30 pairs: one fulfilled, one refund due, the ledger balanced", async () => {
    for (let i = 0; i < 30; i++) {
      const o = await owner();
      const a = (await startPlan(o.token, "starter", idem(`p${i}a`))).body.payment.reference as string;
      expect((await drop(o.token, a)).status).toBe(200);
      at(1);
      const b = (await startPlan(o.token, "starter", idem(`p${i}b`))).body.payment.reference as string;
      at(3);
      const out = await Promise.all([pay(a), pay(b)]);
      expect(out.map((x) => x.outcome).sort()).toEqual(["fulfilled", "recorded_unfulfilled"]);
      const rows = [await row(a), await row(b)];
      expect(rows.filter((r) => r.fulfilledAt !== null)).toHaveLength(1);
      expect(rows.filter((r) => r.flags.includes("refund_due"))).toHaveLength(1);
      for (const r of rows) {
        const led = await balanced(r.id);
        expect(led.n).toBeGreaterThan(0);
        expect(String(led.d)).toBe(String(led.c));
      }
      expect(await invoices(o.businessId)).toBe(1);
      await retire(rows.map((r) => r.id));
      at(0);
    }
  });
});
