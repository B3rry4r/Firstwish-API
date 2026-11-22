import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids } from "./kit";
import { RUN } from "../../../../test/kit/unique";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const run = RUN;
type Kit = Awaited<ReturnType<typeof boot>>;

// the book's limits are shared by every spec in the run's database: hold the setting lock for the file
holdSettingLockForFile();

/** IC4: a wish being made for a Concierge order does not exist for the buyer until it is delivered. */
describe("IC4: a wish being made for an order is hidden from the buyer on every route until delivery; delivery takes only this order's wishes", () => {
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("pab9ic4", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;
  async function paidOrder(buyer: { id: string; auth: string }, makerId: string) {
    const ops = await k.staff(["ops"]);
    const id = (await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `ic4 brief ${run}-${++n}`, count: 1, kind: "single", rush: false })).body.id as string;
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: id, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: id }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId, reason: "to maker", expectedMaker: "" }).expect(200);
    return id;
  }
  /** The maker makes and seals one wish through the order; returns its id and its public slug. */
  async function madeWish(maker: { auth: string }, order: string) {
    const w = (await http().post(`/v1/admin/concierge/orders/${order}/wishes`).set("Authorization", maker.auth).send({ reason: "making it", kind: "birthday", occasion: "birthday", name: "Ada Obi" })).body.id as string;
    const v = (await http().get(`/v1/wishes/${w}`).set("Authorization", maker.auth)).body;
    const sv = await http().patch(`/v1/wishes/${w}`).set("Authorization", maker.auth).send({ version: v.version, content: { letter: { paras: ["Happy birthday."] } }, style: "golden" });
    const sealed = await http().post(`/v1/wishes/${w}/seal`).set("Authorization", maker.auth).send({ version: sv.body.version, openNow: true });
    expect(sealed.status).toBe(200);
    const slug = (await db.wishLink.findFirst({ where: { wishId: w } }))?.slug as string;
    expect(slug).toBeTruthy();
    return { id: w, slug };
  }

  it("before delivery the buyer's count, list, keep, upload, qr-card, link, read and public link all say there is no such wish; after delivery they show it", async () => {
    const m = await k.staff(["maker"]);
    const buyer = await k.account();
    const order = await paidOrder(buyer, m.id);
    const w = await madeWish(m, order);
    const as = (auth: string) => ({ Authorization: auth });
    expect((await http().get("/v1/me").set(as(buyer.auth))).body.wishCount).toBe(0);
    expect((await http().get("/v1/wishes").set(as(buyer.auth))).body.items).toHaveLength(0);
    const statuses = [
      await http().get(`/v1/wishes/${w.id}`).set(as(buyer.auth)),
      await http().get(`/v1/wishes/${w.id}/link`).set(as(buyer.auth)),
      await http().patch(`/v1/wishes/${w.id}`).set(as(buyer.auth)).send({ version: 1, content: {} }),
      await http().post(`/v1/wishes/${w.id}/keep`).set(as(buyer.auth)).send({}),
      await http().post("/v1/uploads").set(as(buyer.auth)).send({ purpose: "photo", contentType: "image/jpeg", bytes: 1000, subjectId: w.id }),
      await http().post("/v1/qr-cards").set(as(buyer.auth)).send({ wishIds: [w.id] }),
    ].map((r) => r.status);
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404]);
    // its public link opens for nobody
    expect((await http().get(`/v1/w/${w.slug}`)).status).toBe(404);
    expect((await http().post(`/v1/w/${w.slug}/opens`).send({})).status).toBe(404);
    // the order's maker still reads it
    expect((await http().get(`/v1/wishes/${w.id}`).set(as(m.auth))).status).toBe(200);
    // delivery shows it
    const delivered = await http().post(`/v1/admin/concierge-orders/${order}/delivery`).set(as(m.auth)).send({ reason: "done", wishIds: [] });
    expect(delivered.status).toBe(200);
    expect((await http().get("/v1/me").set(as(buyer.auth))).body.wishCount).toBe(1);
    expect((await http().get("/v1/wishes").set(as(buyer.auth))).body.items).toHaveLength(1);
    expect((await http().get(`/v1/wishes/${w.id}`).set(as(buyer.auth))).status).toBe(200);
    expect((await http().get(`/v1/w/${w.slug}`)).status).not.toBe(404);
  });

  it("delivery by typed ids cannot take a wish being made for ANOTHER order; the buyer's own wish tied to no order and this order's wish both go", async () => {
    const m1 = await k.staff(["maker"]);
    const m2 = await k.staff(["maker"]);
    const buyer = await k.account();
    const o1 = await paidOrder(buyer, m1.id);
    const o2 = await paidOrder(buyer, m2.id);
    const other = await madeWish(m2, o2);
    const steal = await http().post(`/v1/admin/concierge-orders/${o1}/delivery`).set("Authorization", m1.auth).send({ reason: "typed id of the other order", wishIds: [other.id] });
    expect(steal.status).toBe(422);
    expect(steal.body.error.fields.wishIds).toBeTruthy();
    expect(await db.conciergeOrderWish.count({ where: { wishId: other.id } })).toBe(0);
    expect((await http().get(`/v1/wishes/${other.id}`).set("Authorization", buyer.auth)).status).toBe(404);
    expect((await http().get(`/v1/wishes/${other.id}`).set("Authorization", m2.auth)).status).toBe(200);
    // the buyer's own wish tied to no order goes by id, as before
    const own = await k.wish(buyer.id);
    const ok = await http().post(`/v1/admin/concierge-orders/${o1}/delivery`).set("Authorization", m1.auth).send({ reason: "the buyer's own wish", wishIds: [own] });
    expect(ok.status).toBe(200);
    expect(await db.conciergeOrderWish.count({ where: { orderId: o1, wishId: own } })).toBe(1);
    // the other order delivers its own
    expect((await http().post(`/v1/admin/concierge-orders/${o2}/delivery`).set("Authorization", m2.auth).send({ reason: "its own", wishIds: [] })).status).toBe(200);
    expect((await http().get(`/v1/wishes/${other.id}`).set("Authorization", buyer.auth)).status).toBe(200);
  });

  it("F1: a buyer with a wish being made for their order starts a wish of the same name, with and without a key: a new wish of their own, never the hidden one; after delivery the delivered wish is theirs like any", async () => {
    const m = await k.staff(["maker"]);
    const buyer = await k.account();
    const order = await paidOrder(buyer, m.id);
    const hidden = (await http().post(`/v1/admin/concierge/orders/${order}/wishes`).set("Authorization", m.auth).send({ reason: "making it", kind: "birthday", occasion: "birthday", name: "Ada Obi" })).body.id as string;
    expect(hidden).toBeTruthy();
    const ids_ = (r: { body: { items: { id: string }[] } }): string[] => r.body.items.map((w) => w.id);
    const start = (key?: string) => {
      const r = http().post("/v1/wishes").set("Authorization", buyer.auth);
      return (key ? r.set("Idempotency-Key", key) : r).send({ from: "Ada", name: "Ada Obi", studio: "" });
    };
    const bare = await start();
    expect(bare.status).toBe(201);
    expect(bare.body.id).not.toBe(hidden);
    // a key already bound to the hidden wish is not replayed to the buyer
    const key = `ic4-f1-${run}`;
    await db.wishStart.create({ data: { id: ids.next(), accountId: buyer.id, key, wishId: hidden } });
    const keyed = await start(key);
    expect(keyed.status).toBe(200); // the buyer's own untouched start, found instead of the hidden wish
    expect(keyed.body.id).toBe(bare.body.id);
    expect((await start(key)).body.id).toBe(keyed.body.id);
    expect(ids_(await http().get("/v1/wishes").set("Authorization", buyer.auth))).not.toContain(hidden);
    // the maker seals it and delivers: the delivered wish is one of theirs like any
    const v = (await http().get(`/v1/wishes/${hidden}`).set("Authorization", m.auth)).body;
    const sv = await http().patch(`/v1/wishes/${hidden}`).set("Authorization", m.auth).send({ version: v.version, content: { letter: { paras: ["Happy birthday."] } }, style: "golden" });
    expect((await http().post(`/v1/wishes/${hidden}/seal`).set("Authorization", m.auth).send({ version: sv.body.version, openNow: true })).status).toBe(200);
    expect((await http().post(`/v1/admin/concierge-orders/${order}/delivery`).set("Authorization", m.auth).send({ reason: "done", wishIds: [] })).status).toBe(200);
    expect((await http().get(`/v1/wishes/${hidden}`).set("Authorization", buyer.auth)).status).toBe(200);
    const list = ids_(await http().get("/v1/wishes").set("Authorization", buyer.auth));
    expect(list).toContain(hidden);
  });
});
