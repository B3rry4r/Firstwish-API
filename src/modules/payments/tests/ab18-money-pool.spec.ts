import { PrismaService } from "../../../common/db/prisma.service";
import { StandinRefundProvider } from "../../../common/ports/adapters/standin-refund-provider";
import { RefundProviderPort } from "../../../common/ports/refund-provider.port";
import { ownDatabase } from "../../../../test/kit/own-db";
import { boot, ids } from "../../concierge/tests/kit";
import { SettlementService } from "../settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";

const NOW = new Date("2027-04-12T09:00:00.000Z");
const own = ownDatabase("ab18money");
const ROUNDS = 20;
const AT_ONCE = 20;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * API-BASE-18 (B2): the money paths the pool audit read as clean, run: twenty at once on a pool of three connections, each in its own database.
 * Every request must answer (no 503), and the money and the rows must be right after.
 */
describe("API-BASE-18: settle, seal and refund, twenty at once on a pool of three", () => {
  jest.setTimeout(900000);
  let k: Awaited<ReturnType<typeof boot>>;
  let db: PrismaService;
  let provider: StandinRefundProvider;
  const staff: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    own.use();
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${process.env.DATABASE_URL!.includes("?") ? "&" : "?"}connection_limit=3`;
    k = await boot("ab18m", NOW);
    db = k.db;
    provider = k.t.app.get<RefundProviderPort, StandinRefundProvider>(RefundProviderPort);
    await seedRoleTable(db);
    for (const name of ["financeA", "financeB"]) {
      const s = await makeStaff(db, ["finance"]);
      const token = `ab18-${s.id}`;
      k.t.tokens.set(token, { kind: "staff", staffId: s.id, roles: ["finance"] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(async () => {
    await k.t.close();
    own.drop();
  });

  const unbalanced = (entries: { journalId: string; direction: string; amountKobo: bigint }[]) => {
    const sums = new Map<string, bigint>();
    for (const e of entries) sums.set(e.journalId, (sums.get(e.journalId) ?? 0n) + (e.direction === "debit" ? e.amountKobo : -e.amountKobo));
    return [...sums.values()].filter((v) => v !== 0n);
  };
  const codes = (res: { status: number; body: { error?: { code?: string } } }[]) => {
    const out: Record<string, number> = {};
    for (const r of res) {
      const key = r.status === 200 || r.status === 201 ? String(r.status) : `${r.status}:${r.body?.error?.code}`;
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  };
  /** A concierge order and its pending payment (the pool spec's way), with the real concierge handler behind it. */
  async function ordered(buyer: { id: string; auth: string }, tag: string) {
    const created = await k.t.http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `ab18 ${tag}`, count: 1, kind: "single", rush: false });
    expect(created.status).toBe(201);
    const orderId = created.body.id as string;
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: orderId, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: orderId }, server: { fingerprint: payId, flags: [] } } },
    });
    return { orderId, payId, reference: `fw-${payId}`, amt };
  }
  let hookId = 910000;
  const chargeBody = (reference: string, amt: bigint, id = ++hookId) =>
    JSON.stringify({ event: "charge.success", data: { id, reference, amount: Number(amt), currency: "NGN", channel: "card", fees: 150, paid_at: NOW.toISOString() } });
  const hook = (body: string) => k.t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", k.t.payments.sign(body)).send(body);

  it("settle: the SAME event twenty at once, 20 rounds: all 200, one fulfilment, one stored event, a balanced ledger", async () => {
    const buyer = await k.account();
    let shape: number | undefined;
    for (let round = 0; round < ROUNDS; round++) {
      const o = await ordered(buyer, `same-${round}`);
      const body = chargeBody(o.reference, o.amt);
      const res = await Promise.all(Array.from({ length: AT_ONCE }, () => hook(body)));
      expect(codes(res)).toEqual({ "200": AT_ONCE });
      const p = await db.payment.findUniqueOrThrow({ where: { id: o.payId } });
      expect(p.status).toBe("succeeded");
      expect(p.fulfilledAt).not.toBeNull();
      expect((await db.conciergeOrder.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("paid");
      expect(await db.event.count({ where: { name: "paid", key: o.reference } })).toBe(1);
      expect(await db.webhookEvent.count({ where: { payload: { path: ["data", "reference"], equals: o.reference } } })).toBe(1);
      const entries = await db.ledgerEntry.findMany({ where: { paymentId: o.payId } });
      expect(entries.length).toBeGreaterThan(0);
      expect(unbalanced(entries)).toEqual([]);
      // one settle's worth of rows, not twenty: the same count every round
      shape = shape ?? entries.length;
      expect(entries.length).toBe(shape);
    }
  });

  it("settle: twenty DIFFERENT payments of one account at once, 20 rounds: all 200, every payment settled once, every order paid", async () => {
    const buyer = await k.account();
    for (let round = 0; round < ROUNDS; round++) {
      const made = [];
      for (let i = 0; i < AT_ONCE; i++) made.push(await ordered(buyer, `many-${round}-${i}`));
      const res = await Promise.all(made.map((o) => hook(chargeBody(o.reference, o.amt))));
      expect(codes(res)).toEqual({ "200": AT_ONCE });
      const pays = await db.payment.findMany({ where: { id: { in: made.map((o) => o.payId) } } });
      expect(pays.every((p) => p.status === "succeeded" && p.fulfilledAt !== null)).toBe(true);
      expect(await db.conciergeOrder.count({ where: { id: { in: made.map((o) => o.orderId) }, status: "paid" } })).toBe(AT_ONCE);
      expect(await db.event.count({ where: { name: "paid", key: { in: made.map((o) => o.reference) } } })).toBe(AT_ONCE);
      const entries = await db.ledgerEntry.findMany({ where: { paymentId: { in: made.map((o) => o.payId) } } });
      expect(unbalanced(entries)).toEqual([]);
    }
  });

  it("seal: twenty at once on one paid wish, 20 rounds: one 200, nineteen 409 not_allowed, one number, one link", async () => {
    const u = await k.account();
    for (let round = 0; round < ROUNDS; round++) {
      const w = await k.wish(u.id, { status: "draft", styleSlug: "noir", name: "Ada", content: { letter: { paras: ["Happy birthday."] } } });
      const book = await db.price.findFirstOrThrow({ where: { sku: "ticket.keepsake" }, orderBy: { version: "desc" } });
      const unit = book.promoKobo ?? book.listKobo;
      const payId = ids.next();
      await db.payment.create({
        data: { id: payId, accountId: u.id, payerContact: "x@example.com", purpose: "ticket", subjectId: w, lines: [{ sku: "ticket.keepsake", name: "t", qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN", priceBookVersion: book.version,
          status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${u.id}:${payId}`, channel: "card", options: { request: { purpose: "ticket", ticket: "keepsake", subjectId: w }, server: { fingerprint: payId, flags: [] } } },
      });
      const out = await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: NOW });
      expect(out.outcome).toBe("fulfilled");
      const before = await db.wish.findUniqueOrThrow({ where: { id: w } });
      expect(before.ticket).toBe("keepsake");
      const res = await Promise.all(Array.from({ length: AT_ONCE }, () => k.t.http().post(`/v1/wishes/${w}/seal`).set("Authorization", u.auth).send({ version: before.version, openNow: true })));
      expect(codes(res)).toEqual({ "200": 1, "409:not_allowed": AT_ONCE - 1 });
      const after = await db.wish.findUniqueOrThrow({ where: { id: w } });
      expect(after.status).toBe("sealed");
      expect(after.no).not.toBeNull();
      expect(await db.wishLink.count({ where: { wishId: w } })).toBe(1);
      expect(await db.payment.count({ where: { accountId: u.id, subjectId: w } })).toBe(1);
    }
    const nos = (await db.wish.findMany({ where: { accountId: u.id, status: "sealed" }, select: { no: true } })).map((r) => r.no);
    expect(new Set(nos).size).toBe(ROUNDS);
  });

  it("refund: twenty starts at once, then twenty approvals, then twenty provider events, 20 rounds: one refund, one provider ask, the ledger equals the provider", async () => {
    const buyer = await k.account();
    for (let round = 0; round < ROUNDS; round++) {
      const o = await ordered(buyer, `refund-${round}`);
      expect((await hook(chargeBody(o.reference, o.amt))).status).toBe(200);
      const starts = await Promise.all(Array.from({ length: AT_ONCE }, () => k.t.http().post("/v1/admin/refunds").set(bearer(staff.financeA.token)).send({ paymentId: o.payId, amountKobo: Number(o.amt), reason: "Customer asked, checked" })));
      expect(codes(starts)).toEqual({ "201": 1, "409:refund_open": AT_ONCE - 1 });
      const refundId = starts.find((r) => r.status === 201)!.body.id as string;
      const sends = await Promise.all(Array.from({ length: AT_ONCE }, () => k.t.http().post(`/v1/admin/refunds/${refundId}/approve-refund`).set(bearer(staff.financeB.token)).send({ reason: "Customer asked, checked" })));
      expect(codes(sends)).toEqual({ "200": 1, "409:refund_not_sendable": AT_ONCE - 1 });
      const asked = provider.asked.filter((a) => a.refundId === refundId);
      expect(asked.length).toBe(1);
      expect(provider.creations.filter((c) => c === refundId)).toEqual([refundId]);
      const events = await Promise.all(
        Array.from({ length: AT_ONCE }, () => {
          const body = JSON.stringify({ event: "refund.processed", data: { id: 77000 + round, transaction_reference: o.reference, amount: Number(o.amt), status: "processed" } });
          return hook(body);
        }),
      );
      expect(codes(events)).toEqual({ "200": AT_ONCE });
      expect(await db.refund.count({ where: { paymentId: o.payId } })).toBe(1);
      expect((await db.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe("succeeded");
      expect((await db.payment.findUniqueOrThrow({ where: { id: o.payId } })).status).toBe("refunded");
      const entries = await db.ledgerEntry.findMany({ where: { paymentId: o.payId } });
      expect(unbalanced(entries)).toEqual([]);
      const back = entries.filter((e) => e.refundId === refundId);
      expect(back.length).toBeGreaterThan(0);
      expect(unbalanced(back)).toEqual([]);
      // the refund journals (the provider keeps its fee, so that journal is not reversed) put back exactly what the provider was asked for, once
      expect(back.filter((e) => e.direction === "debit").reduce((sum, e) => sum + e.amountKobo, 0n)).toBe(o.amt);
      expect(BigInt(asked[0].amount.kobo)).toBe(o.amt);
    }
    expect(provider.creations.length).toBe(ROUNDS);
  });
});
