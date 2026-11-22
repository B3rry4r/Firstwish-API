import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { JobsService } from "../../../modules/jobs/jobs.service";
import { SettlementService } from "../../../modules/payments/settlement.service";
import { giveBackDraws } from "../draw-giveback";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2210-03-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
// The provider event ids this file sends sit in a block of their own: another spec's ids in the shared database would make the webhook a repeat that does nothing.
const EVENT_BASE = 100_000_000 + (process.pid % 50000) * 10_000;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";
const at = (s: string) => new Date(s);

describe("HJ1 pack refund", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  let settle: SettlementService;
  const staff: Record<string, { id: string; token: string }> = {};

  // Provider event ids and the newest price-book version are rows and counters of the whole database: the spec has its own.
  const own = ownDatabase("hj1");
  beforeAll(async () => {
    own.use();
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    for (const [name, roles] of [["financeA", ["finance"]], ["financeB", ["finance"]], ["owner", ["owner"]]] as const) {
      const s = await makeStaff(db, [...roles]);
      const token = `pi7-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [...roles] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });
  beforeEach(() => t.clock.set(NOW));

  const owner = async (over: Record<string, unknown> = {}) => {
    const accountId = ids.next();
    const email = `vp-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, sides: ["person", "business"], lastSide: "person" } });
    const token = `pi7-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW, ...over } });
    return { accountId, email, token, businessId };
  };
  const biz = (id: string) => db.business.findUniqueOrThrow({ where: { id } });
  async function make(o: { token: string }) {
    const res = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2210-06-04" });
    expect(res.status).toBe(201);
    return res.body.wishId as string;
  }
  const tryMake = (o: { token: string }) => t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ client: "x", kind: "birthday", occasion: "birthday", day: "2210-06-04" });
  const remove = (o: { token: string }, w: string) => t.http().delete(`/v1/wishes/${w}`).set(bearer(o.token));
  const WINDOW_END = at("2210-03-31T10:00:00Z");

  async function pay(o: { accountId: string; businessId: string }, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, payerContact: null, purpose: "ticket", subjectId: null,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${o.accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id } },
      },
    });
    expect((await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n })).outcome).toBe("fulfilled");
    return { id, reference, total };
  }
  const hook = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  /** Staff ask for the refund and a second approves it; the returned function lands the provider's event (the step the give-backs race). */
  async function refundSteps(p: { id: string; reference: string; total: bigint }) {
    const s = await t.http().post("/v1/admin/refunds").set(bearer(staff.financeA.token)).send({ paymentId: p.id, reason: REASON, amountKobo: Number(p.total) });
    expect(s.status).toBe(201);
    const r = await t.http().post(`/v1/admin/refunds/${s.body.id}/approve-refund`).set(bearer(staff.financeB.token)).send({ reason: REASON });
    expect(r.status).toBe(200);
    return async () => {
      const h = await hook("refund.processed", { id: EVENT_BASE + ++seq, transaction_reference: p.reference, amount: Number(p.total), status: "processed" });
      expect(h.status).toBe(200);
    };
  }
  const refund = async (p: { id: string; reference: string; total: bigint }) => (await refundSteps(p))();
  const packGrant = (paymentId: string) => db.purchaseGrant.findFirstOrThrow({ where: { paymentId, kind: "wish-pack" } });

  /** By hand: the sum over standing (not revoked) packs of size less the standing draws sourced to each. */
  async function byHand(businessId: string): Promise<number> {
    const grants = await db.purchaseGrant.findMany({ where: { businessId, kind: "wish-pack", revokedAt: null } });
    const standing = await db.clientWish.findMany({ where: { businessId, drawFrom: "pack", drawnBackAt: null } });
    return grants.reduce((a, g) => a + Math.max(((g.detail as { wishes?: number }).wishes ?? 5) - standing.filter((r) => r.drawPaymentId === g.paymentId).length, 0), 0);
  }

  it("1: pack A full, pack B with 2 drawn, refund A: counter stays 3, A.drawn is 5, B's next 3 work and the 4th is 402", async () => {
    const o = await owner({});
    const a = await pay(o, "pro.pack");
    t.clock.set(new Date(NOW.getTime() + 1000));
    const b = await pay(o, "pro.pack");
    t.clock.set(NOW);
    for (let i = 0; i < 7; i++) await make(o);
    expect((await biz(o.businessId)).pack).toBe(3);
    await refund(a);
    expect((await biz(o.businessId)).pack).toBe(3);
    const ga = await packGrant(a.id);
    expect(ga.revokedAt).not.toBeNull();
    expect((ga.detail as { drawn?: number }).drawn).toBe(5);
    for (let i = 0; i < 3; i++) expect((await tryMake(o)).status).toBe(201);
    expect((await tryMake(o)).status).toBe(402);
    expect((await biz(o.businessId)).pack).toBe(0);
    expect((await packGrant(b.id)).revokedAt).toBeNull();
  });

  it("2: refund B (2 drawn): counter drops by 3, A's wishes stay; refund both in either order: 0, never below", async () => {
    for (const order of ["ab", "ba"]) {
      const o = await owner({});
      const a = await pay(o, "pro.pack");
      t.clock.set(new Date(NOW.getTime() + 1000));
      const b = await pay(o, "pro.pack");
      t.clock.set(NOW);
      const ws: string[] = [];
      for (let i = 0; i < 7; i++) ws.push(await make(o));
      await refund(b);
      expect((await biz(o.businessId)).pack).toBe(0);
      expect((await packGrant(b.id)).detail).toMatchObject({ drawn: 2 });
      const standing = await db.clientWish.findMany({ where: { businessId: o.businessId, drawFrom: "pack", drawnBackAt: null } });
      expect(standing.filter((r) => r.drawPaymentId === a.id)).toHaveLength(5);
      expect((await tryMake(o)).status).toBe(402);
      await refund(a);
      expect((await biz(o.businessId)).pack).toBe(0);
      void order;
    }
    for (const order of ["ab", "ba"]) {
      const o = await owner({});
      const a = await pay(o, "pro.pack");
      t.clock.set(new Date(NOW.getTime() + 1000));
      const b = await pay(o, "pro.pack");
      t.clock.set(NOW);
      for (let i = 0; i < 2; i++) await make(o);
      const [x, y] = order === "ab" ? [a, b] : [b, a];
      await refund(x);
      expect((await biz(o.businessId)).pack).toBe(await byHand(o.businessId));
      await refund(y);
      expect((await biz(o.businessId)).pack).toBe(0);
    }
  }, 120000);

  it("3: a wish given back after its pack was refunded returns nothing; one given back to a standing pack while another is refunded returns to its own pack", async () => {
    const o = await owner({});
    const a = await pay(o, "pro.pack");
    t.clock.set(new Date(NOW.getTime() + 1000));
    const b = await pay(o, "pro.pack");
    t.clock.set(NOW);
    const ws: string[] = [];
    for (let i = 0; i < 7; i++) ws.push(await make(o)); // 5 on a, 2 on b
    expect((await remove(o, ws[0])).status).toBe(200); // on a
    expect((await remove(o, ws[5])).status).toBe(200); // on b
    await refund(a);
    expect((await biz(o.businessId)).pack).toBe(3);
    t.clock.set(WINDOW_END);
    await jobs.runDue(10, [ws[0], ws[5]]);
    t.clock.set(NOW);
    expect((await biz(o.businessId)).pack).toBe(4); // only b's wish came back
    expect((await biz(o.businessId)).pack).toBe(await byHand(o.businessId));
    const standing = await db.clientWish.findMany({ where: { businessId: o.businessId, drawFrom: "pack", drawnBackAt: null } });
    expect(standing.filter((r) => r.drawPaymentId === b.id)).toHaveLength(1);
  }, 120000);

  it("2b: a refund racing 20 draws and 20 give-backs: the counter equals the by-hand sum", async () => {
    const o = await owner({});
    const a = await pay(o, "pro.pack");
    t.clock.set(new Date(NOW.getTime() + 1000));
    await pay(o, "pro.pack");
    t.clock.set(NOW);
    const ws: string[] = [];
    for (let i = 0; i < 6; i++) ws.push(await make(o));
    for (const w of ws) expect((await remove(o, w)).status).toBe(200);
    const land = await refundSteps(a);
    t.clock.set(WINDOW_END);
    const out = await Promise.allSettled([
      ...Array.from({ length: 20 }, () => tryMake(o)),
      ...Array.from({ length: 20 }, (_, i) => db.$transaction((tx) => giveBackDraws(tx, [ws[i % 6]], t.clock.now()))),
      land(),
    ]);
    expect(out.filter((r) => r.status === "rejected").map((r) => String(r.reason))).toEqual([]);
    expect((await biz(o.businessId)).pack).toBe(await byHand(o.businessId));
    expect((await biz(o.businessId)).pack).toBeGreaterThanOrEqual(0);
  }, 120000);

  function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

  it("random: 200 orders over 2 and 3 packs, the counter equals the by-hand sum after every step", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const R = rng(seed * 7919);
      const nPacks = 2 + (seed % 2);
      const o = await owner({});
      const packs: { id: string; reference: string; total: bigint; refunded: boolean }[] = [];
      for (let i = 0; i < nPacks; i++) { t.clock.set(new Date(NOW.getTime() + i * 1000)); packs.push({ ...(await pay(o, "pro.pack")), refunded: false }); }
      t.clock.set(NOW);
      const removed: string[] = [];
      const live: string[] = [];
      for (let n = 0; n < 14; n++) {
        const x = R();
        if (x < 0.5) {
          const res = await tryMake(o);
          expect([201, 402]).toContain(res.status);
          if (res.status === 201) live.push(res.body.wishId);
        } else if (x < 0.75 && live.length) {
          const w = live.splice(Math.floor(R() * live.length), 1)[0];
          expect((await remove(o, w)).status).toBe(200);
          removed.push(w);
        } else if (x < 0.9 && removed.length) {
          const w = removed.splice(Math.floor(R() * removed.length), 1)[0];
          t.clock.set(WINDOW_END);
          await jobs.runDue(10, [w]);
          t.clock.set(NOW);
        } else {
          const open = packs.filter((p) => !p.refunded);
          if (open.length) { const p = open[Math.floor(R() * open.length)]; await refund(p); p.refunded = true; }
        }
        expect((await biz(o.businessId)).pack).toBe(await byHand(o.businessId));
      }
    }
  }, 1800000);
});
