import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids } from "./kit";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;

/** IC-pool (F7): every transaction waits for a connection as long as production needs, so a crowd of settles on one account all end. */
describe("transactions wait for a connection: sixty contended settles on one account", () => {
  jest.setTimeout(240000);
  let k: Awaited<ReturnType<typeof boot>>;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("pab9pool", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());

  it("60 settles of one account at once end with none failed", async () => {
    const buyer = await k.account();
    const refs: { reference: string; amountKobo: bigint }[] = [];
    for (let i = 0; i < 60; i++) {
      const created = await k.t.http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `pool brief ${run}-${i}`, count: 1, kind: "single", rush: false });
      expect(created.status).toBe(201);
      const orderId = created.body.id as string;
      const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`)[0].a;
      const payId = ids.next();
      await db.payment.create({
        data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: orderId, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
          status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: orderId }, server: { fingerprint: payId, flags: [] } } },
      });
      refs.push({ reference: `fw-${payId}`, amountKobo: amt });
    }
    const settle = k.t.app.get(SettlementService);
    const results = await Promise.allSettled(refs.map((r) => settle.settle({ reference: r.reference, status: "success", amountKobo: r.amountKobo, currency: "NGN", paidAt: NOW })));
    const failed = results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason?.message ?? r).slice(0, 80));
    expect(failed).toEqual([]);
    const done = await db.payment.count({ where: { accountId: buyer.id, status: "succeeded" } });
    expect(done).toBe(60);
  });
});
