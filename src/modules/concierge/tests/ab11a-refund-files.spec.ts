import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { JPEG, WEBM } from "../../stored-files/tests/files-kit";
import { boot, ids } from "./kit";

const NOW = new Date("2027-10-04T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;
type Who = { id: string; auth: string };

/** API-BASE-11A case 5: a refund of a Concierge order removes its stored objects at once. */
describe("refund of a Concierge order removes its stored objects at once", () => {
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("ab11a5", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;
  const held = (key: string): boolean => (k.t.storage as unknown as { objects: Map<string, unknown> }).objects.has(key);

  async function paidOrder(buyer: Who) {
    const placed = await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `brief ${run}-${++n}`, count: 1, kind: "single", rush: false });
    expect(placed.status).toBe(201);
    const id = placed.body.id as string;
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: id, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: id }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    return { id, payId };
  }
  async function give(buyer: Who, order: string, kind: "photo" | "voice") {
    const bytes = kind === "photo" ? JPEG(2000) : WEBM(3000);
    const body = { purpose: kind === "photo" ? "order-photo" : "order-voice", contentType: kind === "photo" ? "image/jpeg" : "audio/webm", bytes: bytes.length, subjectId: order, ...(kind === "voice" ? { seconds: 9 } : {}) };
    const tk = await http().post("/v1/uploads").set("Authorization", buyer.auth).send(body);
    expect(tk.status).toBe(201);
    const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
    expect(k.t.storage.putSigned(key, bytes, body.contentType)).toBe(true);
    expect((await http().post(`/v1/uploads/${tk.body.id}/confirm`).set("Authorization", buyer.auth).send({ fileId: tk.body.id })).status).toBe(200);
    return tk.body.id as string;
  }
  const refundEvent = async (payId: string) => {
    const amount = Number((await db.payment.findUniqueOrThrow({ where: { id: payId } })).amountKobo);
    const body = JSON.stringify({ event: "refund.processed", data: { id: 990000 + (++n), transaction_reference: `fw-${payId}`, amount, status: "processed" } });
    return http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", k.t.payments.sign(body)).send(body);
  };
  const refund = async (payId: string) => {
    const owner = await k.staff(["owner"]);
    expect((await http().post(`/v1/admin/payments/fw-${payId}/refund`).set("Authorization", owner.auth).send({ reason: "buyer asked for the money back" })).status).toBe(200);
    return refundEvent(payId);
  };

  it("the stored objects and rows are gone when the refund's answer comes back, with no sweep run", async () => {
    const buyer = await k.account();
    const bystander = await k.account();
    const o = await paidOrder(buyer);
    const other = await paidOrder(bystander);
    const photo = await give(buyer, o.id, "photo");
    const voice = await give(buyer, o.id, "voice");
    const keep = await give(bystander, other.id, "photo");
    const keys = (await db.storedFile.findMany({ where: { id: { in: [photo, voice] } } })).map((f) => f.objectKey);
    expect(keys).toHaveLength(2);
    expect(keys.every(held)).toBe(true);
    const r = await refund(o.payId);
    expect(r.status).toBe(200);
    // at once: nothing waits for a job
    for (const key of keys) expect(held(key)).toBe(false);
    expect(await db.storedFile.count({ where: { id: { in: [photo, voice] } } })).toBe(0);
    expect(await db.conciergeOrderFile.count({ where: { orderId: o.id } })).toBe(0);
    expect((await http().get(`/v1/concierge-orders/${o.id}`).set("Authorization", buyer.auth)).body).toMatchObject({ status: "refunded" });
    // another buyer's order files are not touched
    const kept = await db.storedFile.findUniqueOrThrow({ where: { id: keep } });
    expect(held(kept.objectKey)).toBe(true);
    expect(await db.conciergeOrderFile.count({ where: { orderId: other.id } })).toBe(1);
    // the same event again changes nothing and the queued cleanup jobs find nothing left
    expect((await refundEvent(o.payId)).status).toBe(200);
    expect(held(kept.objectKey)).toBe(true);
  });
});
