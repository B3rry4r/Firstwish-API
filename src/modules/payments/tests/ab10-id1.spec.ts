import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../settlement.service";
import { boot, ids } from "../../concierge/tests/kit";

const NOW = new Date("2027-04-05T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-10 case 1 (ID1): a wish is paid for once. */
describe("ID1: one ticket payment per wish", () => {
  let k: Kit;
  let db: PrismaService;
  let settle: SettlementService;
  beforeAll(async () => {
    k = await boot("ab10a", NOW);
    db = k.db;
    settle = k.t.app.get(SettlementService);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;
  const key = () => `ab10-${run}-${++n}-key`;
  const draft = (accountId: string, over: Record<string, unknown> = {}) => k.wish(accountId, { status: "draft", ...over });
  const start = (auth: string, ticket: string, wish: string, idem = key()) =>
    http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", idem).send({ purpose: "ticket", ticket, subjectId: wish });
  const readWish = (auth: string, id: string) => http().get(`/v1/wishes/${id}`).set("Authorization", auth);
  const readPay = (auth: string, ref: string) => http().get(`/v1/payments/${ref}`).set("Authorization", auth);
  const paid = (ref: string, kobo: bigint) => settle.settle({ reference: ref, status: "success", amountKobo: kobo, currency: "NGN", paidAt: NOW });

  /** A waiting payment row as older data held it: no start check had stopped it. */
  async function row(accountId: string, wish: string, sku: string, over: Record<string, unknown> = {}) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    await db.payment.create({
      data: {
        id, accountId, payerContact: "x@example.com", purpose: sku.startsWith("ticket.") ? "ticket" : "extra", subjectId: wish,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: sku.startsWith("ticket.") ? "ticket" : "extra", subjectId: wish }, server: { fingerprint: id, flags: [] } }, ...over,
      } as never,
    });
    return { id, reference: `fw-${id}`, total: unit };
  }
  const payRow = (reference: string) => db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
  /** The payment's ledger rows exist, and every journal of them balances (debits equal credits). */
  const balanced = async (paymentId: string) => {
    const rows = await db.$queryRaw<{ d: bigint; c: bigint }[]>`
      SELECT COALESCE(sum("amountKobo") FILTER (WHERE direction = 'debit'), 0)::bigint AS d, COALESCE(sum("amountKobo") FILTER (WHERE direction = 'credit'), 0)::bigint AS c
        FROM ledger_entry WHERE "paymentId" = ${paymentId}::uuid GROUP BY "journalId"`;
    return rows.length > 0 && rows.every((r) => r.d === r.c);
  };

  it("(a) (b) (c): a start while a ticket payment waits is 409 with the waiting reference; the wish read says it waits; the owner drops it and may start again", async () => {
    const a = await k.account();
    const other = await k.account();
    const w = await draft(a.id);
    const idem = key();
    const first = await start(a.auth, "moment", w, idem);
    expect(first.status).toBe(201);
    const ref = first.body.payment.reference as string;
    // the same ticket with the same key still returns the same payment
    const again = await start(a.auth, "moment", w, idem);
    expect([200, 201]).toContain(again.status);
    expect(again.body.payment.reference).toBe(ref);
    // any ticket of that wish with another key is 409 with words and the reference
    for (const ticket of ["keepsake", "moment"]) {
      const r = await start(a.auth, ticket, w);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("ticket_payment_pending");
      expect(r.body.error.message).toMatch(/waiting to be paid/);
      expect(r.body.error.fields).toMatchObject({ reference: ref, ticket: "moment" });
    }
    expect(await db.payment.count({ where: { subjectId: w, purpose: "ticket" } })).toBe(1);
    // another wish of the same person is not held up by it
    const w2 = await draft(a.id);
    expect((await start(a.auth, "keepsake", w2)).status).toBe(201);
    // (b) the wish read
    const read = await readWish(a.auth, w);
    expect(read.status).toBe(200);
    expect(read.body.ticketPayment).toEqual({ ticket: "moment", reference: ref, startedAt: NOW.toISOString(), lapsesAt: new Date(NOW.getTime() + 60 * 60_000).toISOString() });
    // another person drops nothing of mine
    expect((await http().post(`/v1/payments/${ref}/drop`).set("Authorization", other.auth)).status).toBe(404);
    expect((await payRow(ref)).status).toBe("pending");
    // (c) the owner drops it at once
    const dropped = await http().post(`/v1/payments/${ref}/drop`).set("Authorization", a.auth);
    expect(dropped.status).toBe(200);
    expect(dropped.body.status).toBe("abandoned");
    expect((await payRow(ref)).flags).toContain("dropped_by_owner");
    expect((await readWish(a.auth, w)).body.ticketPayment).toBeNull();
    // dropping it again changes nothing
    expect((await http().post(`/v1/payments/${ref}/drop`).set("Authorization", a.auth)).status).toBe(200);
    const next = await start(a.auth, "keepsake", w);
    expect(next.status).toBe(201);
    expect(next.body.payment.reference).not.toBe(ref);
    // a paid payment cannot be dropped; a payment that is not a ticket's is no such payment
    await paid(next.body.payment.reference, (await payRow(next.body.payment.reference)).amountKobo);
    const late = await http().post(`/v1/payments/${next.body.payment.reference}/drop`).set("Authorization", a.auth);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("ticket_payment_not_waiting");
    // IF3 made an extra's payment droppable (ab11a-if3.spec.ts), so the payment that is neither a ticket's nor an extra's is a keep's
    const keep = await row(a.id, w, "extra.qr-card", { purpose: "keep" });
    expect((await http().post(`/v1/payments/${keep.reference}/drop`).set("Authorization", a.auth)).status).toBe(404);
    // a lapsed waiting payment no longer holds the wish
    const w3 = await draft(a.id);
    const old = await start(a.auth, "moment", w3);
    k.t.clock.set(new Date(NOW.getTime() + 61 * 60_000));
    expect((await readWish(a.auth, w3)).body.ticketPayment).toBeNull();
    expect((await start(a.auth, "keepsake", w3)).status).toBe(201);
    expect(old.status).toBe(201);
  });

  it("(d): the one that settles second, on a wish that already holds a paid ticket, is refund due with words and a refund notice; the ledger balances", async () => {
    const a = await k.account();
    const w = await draft(a.id);
    // the verifier's case: two payments open (older data), both settled, 300000 and 600000 kobo
    const moment = await row(a.id, w, "ticket.moment");
    const keepsake = await row(a.id, w, "ticket.keepsake");
    expect(moment.total).toBe(300000n);
    expect(keepsake.total).toBe(600000n);
    expect((await paid(moment.reference, moment.total)).outcome).toBe("fulfilled");
    expect((await paid(keepsake.reference, keepsake.total)).outcome).toBe("fulfilled");
    const sealedAs = (await db.wish.findUniqueOrThrow({ where: { id: w } })).ticket;
    expect(sealedAs).toBe("moment");
    const second = await payRow(keepsake.reference);
    expect(second.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:ticket_already_paid"]));
    const read = await readPay(a.auth, keepsake.reference);
    expect(read.body.reason).toMatch(/already paid for/);
    expect(read.body.reason).toMatch(/marked to be refunded/);
    expect((await readPay(a.auth, moment.reference)).body.reason).toBe("");
    expect(await balanced(moment.id)).toBe(true);
    expect(await balanced(keepsake.id)).toBe(true);
    // the refund notice goes when the refund is made
    const owner = await k.staff(["owner"]);
    const refunded = await http().post(`/v1/admin/payments/${keepsake.reference}/refund`).set("Authorization", owner.auth).send({ reason: "paid twice for one wish" });
    expect(refunded.status).toBe(200);
    const refund = await db.refund.findFirstOrThrow({ where: { paymentId: keepsake.id } });
    const body = JSON.stringify({ event: "refund.processed", data: { id: 880000 + n, transaction_reference: keepsake.reference, amount: Number(keepsake.total), status: "processed" } });
    const hook = await http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", k.t.payments.sign(body)).send(body);
    expect(hook.status).toBe(200);
    expect(await db.messageDelivery.count({ where: { idempotencyKey: `refund:${refund.id}` } })).toBe(1);
    expect((await payRow(keepsake.reference)).status).toBe("refunded");
    // the ticket the first one gave is still there
    expect((await db.wish.findUniqueOrThrow({ where: { id: w } })).ticket).toBe("moment");
  });

  it("(d): an extra bought twice for one wish: the second is refund due", async () => {
    const a = await k.account();
    const w = await draft(a.id, { ticket: "keepsake" });
    const one = await row(a.id, w, "extra.qr-card");
    const two = await row(a.id, w, "extra.qr-card");
    expect((await paid(one.reference, one.total)).outcome).toBe("fulfilled");
    await paid(two.reference, two.total);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w } })).adds).toEqual(["extra.qr-card"]);
    const second = await payRow(two.reference);
    expect(second.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:extra_already_held"]));
    expect((await readPay(a.auth, two.reference)).body.reason).toMatch(/already had that extra/);
    expect((await payRow(one.reference)).flags).toEqual([]);
    expect(await balanced(two.id)).toBe(true);
  });

  it("attack: Moment and Keepsake started at the same moment, 30 pairs: one payment waits, the other is 409", async () => {
    const a = await k.account();
    for (let i = 0; i < 30; i++) {
      const w = await draft(a.id);
      const [m, c] = await Promise.all([start(a.auth, "moment", w), start(a.auth, "keepsake", w)]);
      expect([m.status, c.status].sort()).toEqual([201, 409]);
      const lost = m.status === 409 ? m : c;
      const won = m.status === 409 ? c : m;
      expect(lost.body.error.code).toBe("ticket_payment_pending");
      expect(lost.body.error.fields.reference).toBe(won.body.payment.reference);
      expect(await db.payment.count({ where: { subjectId: w, purpose: "ticket", status: { in: ["pending", "started"] } } })).toBe(1);
    }
  });

  it("attack: both settle at once where two rows already exist: one ticket on the wish, the other refund due, the ledger balanced (20 wishes)", async () => {
    const a = await k.account();
    for (let i = 0; i < 20; i++) {
      const w = await draft(a.id);
      const x = await row(a.id, w, "ticket.moment");
      const y = await row(a.id, w, "ticket.keepsake");
      await Promise.all([paid(x.reference, x.total), paid(y.reference, y.total)]);
      const rows = [await payRow(x.reference), await payRow(y.reference)];
      expect(rows.every((r) => r.status === "succeeded")).toBe(true);
      expect(rows.filter((r) => r.flags.includes("refund_due:ticket_already_paid"))).toHaveLength(1);
      const grants = await db.purchaseGrant.findMany({ where: { wishId: w, kind: "ticket" } });
      expect(grants.filter((g) => g.refusedReason === null)).toHaveLength(1);
      const held = (await db.wish.findUniqueOrThrow({ where: { id: w } })).ticket;
      const winner = rows.find((r) => !r.flags.includes("refund_due"));
      expect(held).toBe(winner?.id === x.id ? "moment" : "keepsake");
      expect(await balanced(x.id)).toBe(true);
      expect(await balanced(y.id)).toBe(true);
    }
  });

  it("attack: drop and settle at once give one outcome, and never two tickets", async () => {
    const a = await k.account();
    for (let i = 0; i < 12; i++) {
      const w = await draft(a.id);
      const p = await row(a.id, w, "ticket.moment");
      const [d, s] = await Promise.all([http().post(`/v1/payments/${p.reference}/drop`).set("Authorization", a.auth), paid(p.reference, p.total)]);
      expect([200, 409]).toContain(d.status);
      expect(s.outcome).toBe("fulfilled");
      const after = await payRow(p.reference);
      expect(after.status).toBe("succeeded");
      expect(after.verifiedAt).not.toBeNull();
      expect((await db.purchaseGrant.count({ where: { wishId: w, kind: "ticket", refusedReason: null } }))).toBeLessThanOrEqual(1);
      // nothing else paid for the wish since, so the late payment gave the ticket (or the drop was refused and it settled normally)
      expect((await db.wish.findUniqueOrThrow({ where: { id: w } })).ticket).toBe("moment");
      expect(after.flags).not.toContain("refund_due");
      expect(await balanced(p.id)).toBe(true);
    }
  });

  it("attack: a dropped payment that is paid later, after a new ticket was paid, is refund due (never two tickets)", async () => {
    const a = await k.account();
    const w = await draft(a.id);
    const first = await start(a.auth, "moment", w);
    const ref1 = first.body.payment.reference as string;
    await http().post(`/v1/payments/${ref1}/drop`).set("Authorization", a.auth).expect(200);
    const second = await start(a.auth, "keepsake", w);
    const ref2 = second.body.payment.reference as string;
    await paid(ref2, (await payRow(ref2)).amountKobo);
    const late = await paid(ref1, (await payRow(ref1)).amountKobo);
    expect(late.outcome).toBe("fulfilled");
    expect((await payRow(ref1)).flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:ticket_already_paid"]));
    expect((await db.wish.findUniqueOrThrow({ where: { id: w } })).ticket).toBe("keepsake");
  });

  it("attack: a business draft on its plan (no payment) beside a ticket start: nothing waits on it, and a waiting payment elsewhere does not hold it", async () => {
    const owner = await k.account(["person", "business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: owner.id, name: `Biz ${run}`, business: "Biz", since: NOW } });
    const planDraft = await draft(owner.id, { businessId });
    const plain = await draft(owner.id);
    expect((await start(owner.auth, "keepsake", plain)).status).toBe(201);
    const read = await readWish(owner.auth, planDraft);
    expect(read.status).toBe(200);
    expect(read.body.ticketPayment).toBeNull();
    expect(await db.payment.count({ where: { subjectId: planDraft } })).toBe(0);
    const s = await start(owner.auth, "moment", planDraft);
    expect(s.status).toBe(201);
    expect((await readWish(owner.auth, planDraft)).body.ticketPayment).toMatchObject({ ticket: "moment" });
    expect((await readWish(owner.auth, plain)).body.ticketPayment).toMatchObject({ ticket: "keepsake" });
  });
});
