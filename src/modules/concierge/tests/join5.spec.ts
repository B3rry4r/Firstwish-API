import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids } from "./kit";

/* Wave 5 join: J5 (CA3) a business's Concierge order leaves an invoice, a person's does not; J3 (YY4) the flag; J9 (CB5) no quote while a payment is pending. */
const NOW = new Date("2026-12-09T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;

describe("wave 5 join: Concierge (J3, J5, J9)", () => {
  let k: Kit;
  let db: PrismaService;
  let settle: SettlementService;
  beforeAll(async () => {
    k = await boot("j5c", NOW);
    db = k.db;
    settle = k.t.app.get(SettlementService);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const http = () => k.t.http();
  const place = (auth: string) => http().post("/v1/concierge-orders").set("Authorization", auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false });
  const quote = (auth: string, id: string, quoteKobo: number) => http().post(`/v1/admin/concierge-orders/${id}/quote`).set("Authorization", auth).send({ quoteKobo, reason: "agreed by phone" });
  const business = async (accountId: string) => {
    const id = ids.next();
    await db.business.create({ data: { id, accountId, name: "Rose Studio" } });
    return id;
  };
  /** The payment the start would have stored (pending), and then the provider's answer through the one settle path when `settleIt`. */
  async function payment(accountId: string, orderId: string, businessId: string | null, settleIt: boolean, amount?: bigint) {
    const order = await db.$queryRaw<{ amountKobo: bigint }[]>`SELECT "amountKobo" FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`;
    const total = amount ?? order[0].amountKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    const book = await db.price.findFirstOrThrow({ where: { sku: "concierge.single" }, orderBy: { version: "desc" } });
    await db.payment.create({
      data: {
        id, accountId, businessId, payerContact: "x@example.com", purpose: "concierge", subjectId: orderId,
        lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "concierge", id: "single", subjectId: orderId }, server: { fingerprint: id, flags: [] } },
      },
    });
    if (settleIt) await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: k.t.clock.now() });
    return { id, reference, total };
  }
  const invoicesOf = (businessId: string) => db.$queryRaw<{ id: string; amount: bigint }[]>`
    SELECT i.id::text AS id, i.amount FROM invoice i JOIN invoice_link l ON l."invoiceId" = i.id WHERE i."businessId" = ${businessId}::uuid`;

  it("J5 (CA3): a business's paid order leaves one invoice, linked on the order; a replay adds none; a person's order leaves none", async () => {
    const b = await k.account(["person", "business"]);
    const biz = await business(b.id);
    const orderId = (await place(b.auth).expect(201)).body.id;
    const p = await payment(b.id, orderId, biz, true);
    const rows = await invoicesOf(biz);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(p.total);
    const order = await db.conciergeOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("paid");
    expect(order.invoiceId).toBe(rows[0].id);
    const read = await http().get(`/v1/admin/concierge/orders/${orderId}`).set("Authorization", (await k.staff(["ops"])).auth).expect(200);
    expect(read.body.invoiceId).toBe(rows[0].id);
    await settle.settle({ reference: p.reference, status: "success", amountKobo: p.total, currency: "NGN", paidAt: NOW });
    expect(await invoicesOf(biz)).toHaveLength(1);

    const a = await k.account();
    const mine = (await place(a.auth).expect(201)).body.id;
    await payment(a.id, mine, null, true);
    const person = await db.conciergeOrder.findUniqueOrThrow({ where: { id: mine } });
    expect(person.status).toBe("paid");
    expect(person.invoiceId).toBeNull();
    expect(await db.$queryRaw`SELECT 1 FROM invoice_link l JOIN payment p ON p.id = l."paymentId" WHERE p."accountId" = ${a.id}::uuid`).toHaveLength(0);
  });

  it("J3 (YY4): a payment that does not match its order, and a cancel after payment, flag refund_due once each, through the one helper (only a payment that holds money)", async () => {
    const a = await k.account();
    const ops = await k.staff(["ops"]);
    const orderId = (await place(a.auth).expect(201)).body.id;
    await quote(ops.auth, orderId, 123_000).expect(200);
    const wrong = await payment(a.id, orderId, null, true, 123_005n);
    expect((await db.payment.findUniqueOrThrow({ where: { id: wrong.id } })).flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:amount_mismatch"]));
    const good = await payment(a.id, orderId, null, true);
    expect((await http().post(`/v1/concierge-orders/${orderId}/cancel`).set("Authorization", a.auth)).status).toBe(200);
    const flags = (await db.payment.findUniqueOrThrow({ where: { id: good.id } })).flags;
    expect(flags.filter((f) => f === "refund_due")).toHaveLength(1);
    expect(flags).toContain("refund_due:concierge_cancelled");
  });

  it("J9 (CB5): a quote is refused (409) while a payment for the order is pending; once the payment lapses or fails it works", async () => {
    const a = await k.account();
    const ops = await k.staff(["ops"]);
    const orderId = (await place(a.auth).expect(201)).body.id;
    const p = await payment(a.id, orderId, null, false);
    const refused = await quote(ops.auth, orderId, 150_000);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("payment_pending");
    expect((await db.conciergeOrder.findUniqueOrThrow({ where: { id: orderId } })).quoteKobo).toBeNull();
    await db.payment.update({ where: { id: p.id }, data: { status: "failed" } });
    expect((await quote(ops.auth, orderId, 150_000)).status).toBe(200);
    // a second payment that lapses (abandoned) lets the next change through
    const q = await payment(a.id, orderId, null, false);
    expect((await quote(ops.auth, orderId, 160_000)).status).toBe(409);
    await db.payment.update({ where: { id: q.id }, data: { status: "abandoned" } });
    const ok = await quote(ops.auth, orderId, 160_000);
    expect(ok.status).toBe(200);
    expect(ok.body.quoteKobo).toBe(160_000);
  });
});
