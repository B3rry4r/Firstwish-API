import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids } from "./kit";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-9 case 9 (HZ2): "make the wish" on an order. */
describe("HZ2 (Concierge): the maker makes a wish in the buyer's name through the order", () => {
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    k = await boot("ab9c", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;

  async function paidOrder(buyer: { id: string; auth: string }, makerId: string | null, over: Record<string, unknown> = {}) {
    const ops = await k.staff(["ops"]);
    const id = (await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `brief ${run}-${++n}`, count: 1, kind: "single", rush: false, ...over })).body.id as string;
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0].a;
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: id, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: id }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    if (makerId) await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId, reason: "to maker", expectedMaker: "" }).expect(200);
    return { id, payId, ops };
  }
  const make = (auth: string, order: string, over: Record<string, unknown> = {}) =>
    http().post(`/v1/admin/concierge/orders/${order}/wishes`).set("Authorization", auth).send({ reason: "making it", kind: "birthday", occasion: "birthday", name: "Ada Obi", ...over });
  const readWish = (auth: string, id: string) => http().get(`/v1/wishes/${id}`).set("Authorization", auth);
  const save = (auth: string, id: string, body: Record<string, unknown>) => http().patch(`/v1/wishes/${id}`).set("Authorization", auth).send(body);
  const maker = async () => k.staff(["maker"]);

  it("the order's maker makes a wish: it is the buyer's, tied to the order, a draft; audited; at most the order's count; the maker's list shows it", async () => {
    const m = await maker();
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const r = await make(m.auth, o.id);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: expect.any(String), no: "", firstName: "Ada" });
    const row = await db.wish.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(row).toMatchObject({ accountId: buyer.id, businessId: null, conciergeOrderId: o.id, status: "draft", name: "Ada Obi", kind: "birthday" });
    expect(await db.auditEntry.count({ where: { action: "concierge.make-wish", subjectId: o.id } })).toBe(1);
    const again = await make(m.auth, o.id, { name: "Bola" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("order_wishes_made");
    const list = await http().get(`/v1/admin/concierge/orders/${o.id}/wishes`).set("Authorization", m.auth);
    expect(list.body.items).toEqual([{ id: r.body.id, no: "", firstName: "Ada" }]);
    // a business's order: the wish carries the business
    const owner = await k.account(["person", "business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: owner.id, name: `Biz ${run}`, business: "Biz", since: NOW } });
    const bo = await paidOrder(owner, m.id, { count: 2, kind: "list" });
    const bw = await make(m.auth, bo.id);
    expect((await db.wish.findUniqueOrThrow({ where: { id: bw.body.id } })).businessId).toBe(businessId);
    expect((await make(m.auth, bo.id, { name: "Chi" })).status).toBe(201);
    expect((await make(m.auth, bo.id, { name: "Dayo" })).status).toBe(409);
  });

  it("attacks: another maker, ops, a buyer, an order not given or not paid, a bad kind and a reason too short are refused; nothing is made", async () => {
    const m = await maker();
    const other = await maker();
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const unpaid = (await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: "x", count: 1, kind: "single", rush: false })).body.id as string;
    const paidNotGiven = await paidOrder(buyer, null);
    expect((await make(other.auth, o.id)).status).toBe(404);
    expect((await make(o.ops.auth, o.id)).status).toBe(403);
    expect((await make(buyer.auth, o.id)).status).toBe(403);
    expect((await make(m.auth, unpaid)).status).toBe(404);
    expect((await make(m.auth, paidNotGiven.id)).status).toBe(404);
    expect((await make(m.auth, "nope")).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await make(m.auth, o.id, { kind: "NOT A KIND!" })).status).toBe(422);
    expect((await make(m.auth, o.id, { reason: "x" })).status).toBe(422);
    expect((await make(m.auth, o.id, { name: "  " })).status).toBe(422);
    expect(await db.wish.count({ where: { conciergeOrderId: { in: [o.id, unpaid, paidNotGiven.id] } } })).toBe(0);
    // the owner may make one on any order that is with a maker
    const owner = await k.staff(["owner"]);
    expect((await make(owner.auth, o.id)).status).toBe(201);
  });

  it("hidden from the buyer until delivered: not in the list, not by id, not to save, seal, link or remove; the buyer's own wishes are unaffected", async () => {
    const m = await maker();
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const w = (await make(m.auth, o.id)).body.id as string;
    const own = await k.wish(buyer.id, { status: "draft", name: "Mine" });
    const list = await http().get("/v1/wishes").set("Authorization", buyer.auth);
    const seen = (list.body.items as { id: string }[]).map((x) => x.id);
    expect(seen).toContain(own);
    expect(seen).not.toContain(w);
    expect((await readWish(buyer.auth, w)).status).toBe(404);
    expect((await save(buyer.auth, w, { version: 0, name: "Taken" })).status).toBe(404);
    expect((await http().post(`/v1/wishes/${w}/seal`).set("Authorization", buyer.auth).send({ version: 0, openNow: true })).status).toBe(404);
    expect((await http().get(`/v1/wishes/${w}/link`).set("Authorization", buyer.auth)).status).toBe(404);
    expect((await http().delete(`/v1/wishes/${w}`).set("Authorization", buyer.auth).send({})).status).toBe(404);
    expect((await readWish(buyer.auth, own)).status).toBe(200);
  });

  it("the maker edits it through the wish routes while the order is with them, and loses it at delivery or when the order goes to another maker", async () => {
    const m = await maker();
    const other = await maker();
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const w = (await make(m.auth, o.id)).body.id as string;
    const got = await readWish(m.auth, w);
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ id: w, state: "draft", name: "Ada Obi" });
    const saved = await save(m.auth, w, { version: got.body.version, name: "Ada Obi", content: { letter: { paras: ["Happy birthday, Ada."] } } });
    expect(saved.status).toBe(200);
    expect((await readWish(m.auth, w)).body.content).toMatchObject({ letter: { paras: ["Happy birthday, Ada."] } });
    // another maker, the buyer's other wishes, and ops are shut out
    expect((await readWish(other.auth, w)).status).toBe(404);
    expect((await save(other.auth, w, { version: saved.body.version, name: "Mine" })).status).toBe(404);
    const own = await k.wish(buyer.id, { status: "draft", name: "Mine" });
    expect((await readWish(m.auth, own)).status).toBe(404);
    expect((await save(m.auth, own, { version: 0, name: "Mine now" })).status).toBe(404);
    const otherBuyer = await k.account();
    const o2 = await paidOrder(otherBuyer, other.id);
    const w2 = (await make(other.auth, o2.id)).body.id as string;
    expect((await readWish(m.auth, w2)).status).toBe(404);
    expect((await readWish(o.ops.auth, w)).status).toBe(403);
    expect((await readWish(buyer.auth, w)).status).toBe(404);
    // the order moves to another maker: the first loses the wish at once, the second has it
    await http().post(`/v1/admin/concierge/orders/${o.id}/maker`).set("Authorization", o.ops.auth).send({ makerId: other.id, reason: "hand over", expectedMaker: m.id }).expect(200);
    expect((await readWish(m.auth, w)).status).toBe(404);
    expect((await save(m.auth, w, { version: saved.body.version, name: "Late" })).status).toBe(404);
    expect((await readWish(other.auth, w)).status).toBe(200);
    // the new maker seals it on the order's payment and delivers: nothing else to name
    const sealed = await http().post(`/v1/wishes/${w}/seal`).set("Authorization", other.auth).send({ version: saved.body.version, openNow: true });
    expect(sealed.status).toBe(200);
    expect(sealed.body.item).toMatchObject({ id: w, state: expect.stringMatching(/sealed|live/), ticket: "signature" });
    const asBuyer = await http().get("/v1/wishes").set("Authorization", buyer.auth);
    expect((asBuyer.body.items as { id: string }[]).map((x) => x.id)).not.toContain(w);
    const done = await http().post(`/v1/admin/concierge-orders/${o.id}/delivery`).set("Authorization", other.auth).send({ reason: "all made" });
    expect(done.status).toBe(200);
    expect(await db.conciergeOrderWish.count({ where: { orderId: o.id, wishId: w } })).toBe(1);
    expect((await readWish(other.auth, w)).status).toBe(404);
    expect((await save(other.auth, w, { version: 5, name: "After" })).status).toBe(404);
    const after = await http().get("/v1/wishes").set("Authorization", buyer.auth);
    expect((after.body.items as { id: string }[]).map((x) => x.id)).toContain(w);
    expect((await readWish(buyer.auth, w)).status).toBe(200);
    expect((await http().get(`/v1/admin/concierge/orders/${o.id}/wishes`).set("Authorization", other.auth)).body.items).toHaveLength(1);
  });

  it("delivery takes the tied wishes, a draft among them is refused with words, the typed-ids path still works for older orders, and an empty delivery with none made is refused", async () => {
    const m = await maker();
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const w = (await make(m.auth, o.id)).body.id as string;
    const draft = await http().post(`/v1/admin/concierge-orders/${o.id}/delivery`).set("Authorization", m.auth).send({ reason: "all made" });
    expect(draft.status).toBe(422);
    expect(draft.body.error.fields.wishIds).toMatch(/not made yet/);
    expect(await db.conciergeOrderWish.count({ where: { orderId: o.id } })).toBe(0);
    const old = await paidOrder(buyer, m.id);
    const none = await http().post(`/v1/admin/concierge-orders/${old.id}/delivery`).set("Authorization", m.auth).send({ reason: "all made" });
    expect(none.status).toBe(422);
    const typed = await k.wish(buyer.id, { name: "Typed One" });
    expect((await http().post(`/v1/admin/concierge-orders/${old.id}/delivery`).set("Authorization", m.auth).send({ reason: "all made", wishIds: [typed] })).status).toBe(200);
    expect((await readWish(m.auth, w)).status).toBe(200);
  });

  it("cancel (and refund due) of an order with a wish half made takes the wish with it; the buyer never saw it; an erased buyer's wish is gone for the maker", async () => {
    const m = await maker();
    const buyer = await k.account();
    const o = await paidOrder(buyer, m.id);
    const w = (await make(m.auth, o.id)).body.id as string;
    const cancelled = await http().post(`/v1/admin/concierge/orders/${o.id}/cancel`).set("Authorization", o.ops.auth).send({ reason: "buyer asked" });
    expect(cancelled.status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w } })).erasedAt).not.toBeNull();
    expect((await readWish(m.auth, w)).status).toBe(404);
    expect(((await http().get("/v1/wishes").set("Authorization", buyer.auth)).body.items as { id: string }[]).map((x) => x.id)).not.toContain(w);
    expect((await db.payment.findUniqueOrThrow({ where: { id: o.payId } })).flags).toContain("refund_due");
    expect((await make(m.auth, o.id)).status).toBe(409);
    // a wish the maker already sealed goes the same way
    const b2 = await k.account();
    const o2 = await paidOrder(b2, m.id);
    const w2 = (await make(m.auth, o2.id)).body.id as string;
    const v2 = await readWish(m.auth, w2);
    const s2 = await save(m.auth, w2, { version: v2.body.version, content: { letter: { paras: ["Hello."] } } });
    expect((await http().post(`/v1/wishes/${w2}/seal`).set("Authorization", m.auth).send({ version: s2.body.version, openNow: true })).status).toBe(200);
    expect((await http().post(`/v1/admin/concierge/orders/${o2.id}/cancel`).set("Authorization", o2.ops.auth).send({ reason: "buyer asked" })).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w2 } })).erasedAt).not.toBeNull();
    // erase of the buyer with a wish half made
    const b3 = await k.account();
    const o3 = await paidOrder(b3, m.id);
    const w3 = (await make(m.auth, o3.id)).body.id as string;
    const owner = await k.staff(["owner"]);
    const erased = await http().post(`/v1/admin/people/${b3.id}/actions`).set("Authorization", owner.auth).send({ action: "erase", reason: "asked to be erased" });
    expect([200, 202, 204]).toContain(erased.status);
    expect((await readWish(m.auth, w3)).status).toBe(404);
  });
});
