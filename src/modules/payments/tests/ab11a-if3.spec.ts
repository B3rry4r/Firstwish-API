import { Money } from "../../../common/money/money";
import { SettlementService } from "../settlement.service";
import { boot } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-08-02T09:00:00.000Z");
const run = RUN;
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-11A case 3 (IF3): an extra is paid for once per wish, as a ticket is. */
describe("IF3: one waiting payment per extra per wish", () => {
  let k: Kit;
  let settle: SettlementService;
  beforeAll(async () => {
    k = await boot("ab11a3", NOW);
    settle = k.t.app.get(SettlementService);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;
  const key = () => `ab11a3-${run}-${++n}-key`;
  /** a wish that holds a Keepsake ticket and has not been sealed: it takes extras */
  const wish = (accountId: string) => k.wish(accountId, { status: "draft", ticket: "keepsake" });
  const start = (auth: string, extra: string, w: string, idem = key()) => http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", idem).send({ purpose: "extra", id: extra, subjectId: w });
  const drop = (auth: string, ref: string) => http().post(`/v1/payments/${ref}/drop`).set("Authorization", auth);
  const payRow = (ref: string) => k.db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
  const count = (w: string, sku: string) => k.db.payment.count({ where: { subjectId: w, purpose: "extra", lines: { path: ["0", "sku"], equals: sku } } });

  it("a start while the same extra's payment for that wish waits is 409 with the reference; the owner drops it (E-282) and may start again; two different extras are both allowed", async () => {
    const a = await k.account();
    const other = await k.account();
    const w = await wish(a.id);
    const idem = key();
    const first = await start(a.auth, "qr-card", w, idem);
    expect(first.status).toBe(201);
    const ref = first.body.payment.reference as string;
    // the same key still returns the same payment
    const again = await start(a.auth, "qr-card", w, idem);
    expect([200, 201]).toContain(again.status);
    expect(again.body.payment.reference).toBe(ref);
    // the same extra with another key is 409 with words and the waiting payment's reference
    const second = await start(a.auth, "qr-card", w);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("extra_payment_pending");
    expect(second.body.error.message).toMatch(/waiting to be paid/);
    expect(second.body.error.fields).toMatchObject({ reference: ref, extra: "qr-card" });
    expect(await count(w, "extra.qr-card")).toBe(1);
    // a different extra of the same wish is allowed; the same extra of another wish is allowed
    const different = await start(a.auth, "five-photos", w);
    expect(different.status).toBe(201);
    const w2 = await wish(a.id);
    expect((await start(a.auth, "qr-card", w2)).status).toBe(201);
    // another person drops nothing of mine
    expect((await drop(other.auth, ref)).status).toBe(404);
    expect((await payRow(ref)).status).toBe("pending");
    // the owner drops it at once (E-282): abandoned, flagged, and a new start is allowed
    const dropped = await drop(a.auth, ref);
    expect(dropped.status).toBe(200);
    expect(dropped.body.status).toBe("abandoned");
    expect((await payRow(ref)).flags).toContain("dropped_by_owner");
    expect((await drop(a.auth, ref)).status).toBe(200);
    const next = await start(a.auth, "qr-card", w);
    expect(next.status).toBe(201);
    expect(next.body.payment.reference).not.toBe(ref);
    // a paid extra's payment cannot be dropped
    k.t.payments.settle(next.body.payment.reference, "success", Money.kobo(BigInt(next.body.payment.amountKobo)));
    await settle.settle({ reference: next.body.payment.reference, status: "success", amountKobo: (await payRow(next.body.payment.reference)).amountKobo, currency: "NGN", paidAt: NOW });
    const late = await drop(a.auth, next.body.payment.reference);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("extra_payment_not_waiting");
    // a waiting payment that lapsed no longer holds the extra
    const w3 = await wish(a.id);
    expect((await start(a.auth, "qr-card", w3)).status).toBe(201);
    k.t.clock.set(new Date(NOW.getTime() + 61 * 60_000));
    expect((await start(a.auth, "qr-card", w3)).status).toBe(201);
  });

  it("30 pairs of starts of the same extra at once: one payment waits, the other is 409; 30 pairs of different extras: both are made", async () => {
    const a = await k.account();
    const same: { w: string; rs: { status: number; body: { error?: { code: string } } }[] }[] = [];
    for (let i = 0; i < 30; i++) {
      const w = await wish(a.id);
      const rs = await Promise.all([start(a.auth, "qr-card", w), start(a.auth, "qr-card", w)]);
      same.push({ w, rs });
    }
    for (const { w, rs } of same) {
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(rs.find((r) => r.status === 409)?.body.error?.code).toBe("extra_payment_pending");
      expect(await count(w, "extra.qr-card")).toBe(1);
    }
    const mixed: { w: string; rs: { status: number }[] }[] = [];
    for (let i = 0; i < 30; i++) {
      const w = await wish(a.id);
      mixed.push({ w, rs: await Promise.all([start(a.auth, "qr-card", w), start(a.auth, "five-photos", w)]) });
    }
    for (const { w, rs } of mixed) {
      expect(rs.map((r) => r.status)).toEqual([201, 201]);
      expect(await k.db.payment.count({ where: { subjectId: w, purpose: "extra" } })).toBe(2);
    }
    // a start and a drop at once never leave two waiting
    const w = await wish(a.id);
    const first = await start(a.auth, "qr-card", w);
    const both = await Promise.all([drop(a.auth, first.body.payment.reference), start(a.auth, "qr-card", w)]);
    expect(both[0].status).toBe(200);
    expect([201, 409]).toContain(both[1].status);
    const waiting = await k.db.payment.count({ where: { subjectId: w, purpose: "extra", status: { in: ["pending", "started"] } } });
    expect(waiting).toBeLessThanOrEqual(1);
  });
});
