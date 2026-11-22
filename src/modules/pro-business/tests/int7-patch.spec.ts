import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../../modules/jobs/jobs.service";
import { SettlementService } from "../../../modules/payments/settlement.service";
import { giveBackDraws } from "../../purchases/draw-giveback";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { StandinRefundProvider } from "../../../common/ports/adapters/standin-refund-provider";
import { RefundProviderPort } from "../../../common/ports/refund-provider.port";
import { Money } from "../../../common/money/money";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2210-03-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";
const at = (s: string) => new Date(s);

describe("INT-7 patch: HF1 HF2 HF3", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  let settle: SettlementService;
  let provider: StandinRefundProvider;
  const staff: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    settle = t.app.get(SettlementService);
    provider = t.app.get<RefundProviderPort, StandinRefundProvider>(RefundProviderPort);
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
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const owner = async (over: Record<string, unknown> = {}) => {
    const accountId = ids.next();
    const email = `pi7-${run}-${++seq}@example.com`;
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
      const h = await hook("refund.processed", { id: 9000 + ++seq, transaction_reference: p.reference, amount: Number(p.total), status: "processed" });
      expect(h.status).toBe(200);
    };
  }
  const refund = async (p: { id: string; reference: string; total: bigint }) => (await refundSteps(p))();
  const packGrant = (paymentId: string) => db.purchaseGrant.findFirstOrThrow({ where: { paymentId, kind: "wish-pack" } });

  it("HF1a: pack of 5, 2 drafts drawn and removed, pack refunded, window ends: pack stays 0, next client wish is 402", async () => {
    const o = await owner({});
    const pk = await pay(o, "pro.pack");
    expect((await biz(o.businessId)).pack).toBe(5);
    const w1 = await make(o);
    const w2 = await make(o);
    expect((await biz(o.businessId)).pack).toBe(3);
    expect((await remove(o, w1)).status).toBe(200);
    expect((await remove(o, w2)).status).toBe(200);
    await refund(pk);
    expect((await packGrant(pk.id)).revokedAt).not.toBeNull();
    expect((await biz(o.businessId)).pack).toBe(0);
    t.clock.set(WINDOW_END);
    await jobs.runDue(10, [w1, w2]);
    expect((await biz(o.businessId)).pack).toBe(0);
    // the records are marked given back (once), nothing returned
    for (const w of [w1, w2]) expect((await db.clientWish.findUniqueOrThrow({ where: { wishId: w } })).drawnBackAt).not.toBeNull();
    expect((await tryMake(o)).status).toBe(402);
    expect((await biz(o.businessId)).pack).toBe(0);
  });

  it("HF1b: the refund AFTER the give-back: the revoke takes the whole pack, so the returned wishes are not left: pack is 0", async () => {
    const o = await owner({});
    const pk = await pay(o, "pro.pack");
    const w1 = await make(o);
    const w2 = await make(o);
    expect((await remove(o, w1)).status).toBe(200);
    expect((await remove(o, w2)).status).toBe(200);
    t.clock.set(WINDOW_END);
    await jobs.runDue(10, [w1, w2]);
    expect((await biz(o.businessId)).pack).toBe(5); // honoured while the pack stands
    await refund(pk);
    // the revoke takes the pack's size (5) off what is held (5, the 2 returned among them): nothing is left on the revoked source
    expect((await biz(o.businessId)).pack).toBe(0);
    expect((await tryMake(o)).status).toBe(402);
  });

  it("HF1c: a plan refunded mid-month: a removed draft's give-back returns nothing to the revoked plan", async () => {
    const o = await owner({});
    const pl = await pay(o, "pro.starter");
    const w = await make(o);
    expect((await biz(o.businessId)).used).toBe(1);
    expect((await remove(o, w)).status).toBe(200);
    await refund(pl);
    expect((await biz(o.businessId)).plan).toBeNull();
    const usedBefore = (await biz(o.businessId)).used;
    t.clock.set(WINDOW_END);
    await jobs.runDue(10, [w]);
    expect((await db.clientWish.findUniqueOrThrow({ where: { wishId: w } })).drawnBackAt).not.toBeNull();
    expect((await biz(o.businessId)).used).toBe(usedBefore);
  });

  it("HF1d: 20 give-backs racing the refund's event: no wish is left on the revoked pack", async () => {
    for (const refundFirst of [false, true]) {
      t.clock.set(NOW);
      const o = await owner({});
      const pk = await pay(o, "pro.pack");
      const w: string[] = [];
      for (let i = 0; i < 5; i++) w.push(await make(o));
      for (const x of w) expect((await remove(o, x)).status).toBe(200);
      const land = await refundSteps(pk);
      const wishId = (i: number) => w[i % w.length];
      const backs = Array.from({ length: 20 }, (_, i) => db.$transaction((tx) => giveBackDraws(tx, [wishId(i)], t.clock.now())));
      const landing = refundFirst ? land() : Promise.resolve().then(() => land());
      const out = await Promise.allSettled([...backs, landing]);
      expect(out.filter((r) => r.status === "rejected").map((r) => String((r).reason))).toEqual([]);
      await db.$transaction((tx) => giveBackDraws(tx, w, t.clock.now()));
      expect((await packGrant(pk.id)).revokedAt).not.toBeNull();
      expect((await biz(o.businessId)).pack).toBe(0);
      expect((await tryMake(o)).status).toBe(402);
    }
  });

  it("HF2: pack of 5, one draw given back, 5 more draws: each has its drawPaymentId", async () => {
    const o = await owner({});
    const pk = await pay(o, "pro.pack");
    const first = await make(o);
    expect((await remove(o, first)).status).toBe(200);
    t.clock.set(WINDOW_END);
    await jobs.runDue(5, [first]);
    expect((await biz(o.businessId)).pack).toBe(5);
    const w: string[] = [];
    for (let i = 0; i < 5; i++) w.push(await make(o));
    const recs = await db.clientWish.findMany({ where: { wishId: { in: w } } });
    expect(recs).toHaveLength(5);
    expect(recs.map((r) => r.drawPaymentId)).toEqual(Array(5).fill(pk.id));
    expect((await biz(o.businessId)).pack).toBe(0);
  });

  describe("HF3", () => {
    async function overOwner() {
      const o = await owner({});
      await pay(o, "pro.studio");
      const lg: string[] = [];
      for (let i = 0; i < 3; i++) {
        const acc = ids.next();
        const email = `pi7l-${run}-${seq}-${i}@studio.ng`;
        await db.account.create({ data: { id: acc, contact: email, sides: ["person"], lastSide: "person" } });
        const lid = ids.next();
        await db.login.create({ data: { id: lid, businessId: o.businessId, contact: email, status: "active" } });
        lg.push(lid);
      }
      return { o, lg };
    }
    const mails = (email: string) => db.messageDelivery.count({ where: { templateKey: "logins-over", to: email } });

    it("a second payment while still over sends none; a later downgrade after the logins were brought in line sends one again", async () => {
      const { o, lg } = await overOwner();
      expect(await mails(o.email)).toBe(0);
      await pay(o, "pro.starter");
      expect(await mails(o.email)).toBe(1);
      await pay(o, "pro.starter");
      expect(await mails(o.email)).toBe(1);
      // brought back in line: every extra login removed, then back up to Studio and 2 new logins
      for (const id of lg) await db.login.update({ where: { id }, data: { status: "removed" } });
      await pay(o, "pro.studio");
      for (let i = 0; i < 2; i++) {
        const lid = ids.next();
        await db.login.create({ data: { id: lid, businessId: o.businessId, contact: `pi7n-${run}-${seq}-${i}@studio.ng`, status: "active" } });
      }
      expect(await mails(o.email)).toBe(1);
      await refund(await (async () => { const p = await db.payment.findFirstOrThrow({ where: { businessId: o.businessId }, orderBy: { createdAt: "desc" } }); return { id: p.id, reference: p.providerReference, total: p.amountKobo }; })());
      // the refund of the newest payment leaves an older plan standing that allows fewer logins than there are: still one notice per state
      const total = await mails(o.email);
      expect(total).toBeGreaterThanOrEqual(1);
      await pay(o, "pro.starter");
      expect(await mails(o.email)).toBeGreaterThan(1);
    });

    it("the stand-in's refund lookup matches the amount", async () => {
      provider.created.clear();
      const ref = `ref-${run}-${seq}`;
      const a = await provider.refund({ refundId: "r1", paymentReference: ref, amount: Money.kobo(5000) });
      const b = await provider.refund({ refundId: "r2", paymentReference: ref, amount: Money.kobo(150000) });
      expect(b).not.toEqual(a);
      expect(await provider.findRefund(ref, Money.kobo(150000))).toEqual(b);
      expect(await provider.findRefund(ref, Money.kobo(5000))).toEqual(a);
      expect(await provider.findRefund(ref, Money.kobo(7777))).toBeNull();
    });

    it("a Numbers target set by a principal with no staff row is refused with a 4xx, never 500", async () => {
      // (vault_space, month) is this test's own pair: no other spec uses it; any row left there is cleared first.
      await db.numbersTarget.deleteMany({ where: { line: "vault_space", period: "month" } });
      const ghost = ids.next();
      const tk = `pi7-ghost-${ghost}`;
      t.tokens.set(tk, { kind: "staff", staffId: ghost, roles: ["finance"] });
      const g = await t.http().put("/v1/admin/numbers/targets").set(bearer(tk)).send({ line: "vault_space", period: "month", targetKobo: 100, reason: "plan" });
      expect([403, 422]).toContain(g.status);
      const ok = await t.http().put("/v1/admin/numbers/targets").set(bearer(staff.financeA.token)).send({ line: "vault_space", period: "month", targetKobo: 200, reason: "plan" });
      expect(ok.status).toBe(200);
    });
  });
});
