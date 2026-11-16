import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids, routeStorage } from "./kit";

const NOW = new Date("2026-12-07T09:00:00.000Z");
const H = 3_600_000;
type Kit = Awaited<ReturnType<typeof boot>>;

describe("P-B19: the concierge start, delivery, card and email", () => {
  let k: Kit;
  let db: PrismaService;
  let route: ReturnType<typeof routeStorage>;
  beforeAll(async () => {
    k = await boot("pb19", NOW);
    route = routeStorage(k.t);
    db = k.db;
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  const unit = async () => {
    const p = await db.price.findFirstOrThrow({ where: { sku: "concierge.single" }, orderBy: { version: "desc" } });
    return p.promoKobo ?? p.listKobo;
  };
  const place = (auth: string, over: Record<string, unknown> = {}) =>
    http().post("/v1/concierge-orders").set("Authorization", auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false, ...over });
  const start = (auth: string, subjectId: string, key = `pb19-${ids.next()}`) =>
    http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", key).send({ purpose: "concierge", subjectId });
  const withPass = async (accountId: string) => {
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId, purpose: "pass", lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `k-${payId}`, options: {} },
    });
    await db.passMembership.create({ data: { id: ids.next(), accountId, paymentId: payId, state: "active", since: new Date(NOW.getTime() - H), validUntil: new Date(NOW.getTime() + 30 * 24 * H).toISOString() } });
  };
  const rowAmount = async (id: string) => (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`)[0].a;

  it("CA1: the start charges the order's own price: a single, a list of 12, a Pass holder's list of 3, a quoted order", async () => {
    const a = await k.account();
    const u = await unit();
    const single = (await place(a.auth)).body.id;
    const s1 = await start(a.auth, single).expect(201);
    expect(s1.body.payment.amountKobo).toBe(Number(u));
    const twelve = (await place(a.auth, { kind: "list", count: 12 })).body.id;
    expect((await start(a.auth, twelve).expect(201)).body.payment.amountKobo).toBe(Number(u) * 12);
    const p = await k.account();
    await withPass(p.id);
    const three = (await place(p.auth, { kind: "list", count: 3 })).body.id;
    const passAmount = Number((u * 3n * 80n + 50n) / 100n);
    expect((await start(p.auth, three).expect(201)).body.payment.amountKobo).toBe(passAmount);
    const ops = await k.staff(["ops"]);
    const q = (await place(a.auth)).body.id;
    await http().post(`/v1/admin/concierge-orders/${q}/quote`).set("Authorization", ops.auth).send({ quoteKobo: 123_000, reason: "agreed by phone" }).expect(200);
    expect((await start(a.auth, q).expect(201)).body.payment.amountKobo).toBe(123_000);
    // every stored payment equals its order's row, and the provider was asked for the same amount
    for (const id of [single, twelve, three, q]) {
      const pay = await db.payment.findFirstOrThrow({ where: { subjectId: id } });
      expect(pay.amountKobo).toBe(await rowAmount(id));
      expect((pay.lines as { totalKobo: number }[]).reduce((n, l) => n + l.totalKobo, 0)).toBe(Number(pay.amountKobo));
      expect(k.t.payments.started.filter((c) => c.reference === pay.providerReference).map((c) => Number(c.amount.kobo))).toEqual([Number(pay.amountKobo)]);
    }
    // the client sends no amount: one is refused
    expect((await http().post("/v1/payments").set("Authorization", a.auth).send({ purpose: "concierge", subjectId: single, amount: 1 })).status).toBe(422);
  });

  it("CB1: 20 starts at once make one payment and one provider call; paid is 409 after it settles", async () => {
    const a = await k.account();
    const id = (await place(a.auth)).body.id;
    const before = k.t.payments.started.length;
    const rs = await Promise.all(Array.from({ length: 20 }, () => start(a.auth, id)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => String((r.body as { payment: { reference: string } }).payment.reference))).size).toBe(1);
    expect(await db.payment.count({ where: { subjectId: id } })).toBe(1);
    expect(k.t.payments.started.length - before).toBe(1);
    const pay = await db.payment.findFirstOrThrow({ where: { subjectId: id } });
    await k.t.app.get(SettlementService).settle({ reference: pay.providerReference, status: "success", amountKobo: pay.amountKobo, currency: "NGN", paidAt: NOW });
    expect((await db.conciergeOrder.findUniqueOrThrow({ where: { id } })).status).toBe("paid");
    expect((await start(a.auth, id)).status).toBe(409);
    const c = (await place(a.auth)).body.id;
    await http().post(`/v1/concierge-orders/${c}/cancel`).set("Authorization", a.auth).send({}).expect(200);
    expect((await start(a.auth, c)).status).toBe(409);
  });

  async function readyOrder(count = 1) {
    const a = await k.account();
    const maker = await k.staff(["maker"]);
    const ops = await k.staff(["ops"]);
    const id = (await place(a.auth, count > 1 ? { kind: "list", count } : {})).body.id;
    const amt = await rowAmount(id);
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: a.id, purpose: "concierge", subjectId: id, lines: [{ sku: "concierge.single", name: "c", qty: count, unitKobo: Number(amt) / count, totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${a.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: id }, server: { fingerprint: payId, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${payId}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId: maker.id, reason: "to maker" }).expect(200);
    return { a, maker, ops, id };
  }
  const deliver = (auth: string, id: string, wishIds: string[]) => http().post(`/v1/admin/concierge-orders/${id}/delivery`).set("Authorization", auth).send({ reason: "all made", wishIds });

  it("CB2 and CA3: a draft is 422 naming the wish; sealed and live pass; one email on delivery, none on a repeat", async () => {
    const { a, maker, id } = await readyOrder(3);
    const draft = await k.wish(a.id, { status: "draft" });
    const sealed = await k.wish(a.id);
    const live = await k.wish(a.id, { status: "live" });
    const bad = await deliver(maker.auth, id, [sealed, draft]);
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body)).toContain(draft);
    await deliver(maker.auth, id, [sealed, live]).expect(200);
    const mail = () => db.messageDelivery.findMany({ where: { idempotencyKey: `concierge-delivered:${id}` } });
    const rows = await mail();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ templateKey: "concierge-delivered", channel: "email" });
    expect(JSON.stringify(rows[0].vars)).toContain("2 wishes");
    for (const w of [sealed, live]) expect(JSON.stringify(rows[0])).not.toContain(w);
    expect((await deliver(maker.auth, id, [sealed, live])).status).toBe(409);
    expect(await mail()).toHaveLength(1);
  });

  it("CB3: the order's maker gets the card of the order's wishes (others 404); a quote over 100 x list is 422; count \"2\" is 422", async () => {
    const { a, maker, id } = await readyOrder(2);
    const other = await k.staff(["maker"]);
    const ws: string[] = [];
    for (let i = 0; i < 2; i++) {
      const w = await k.wish(a.id);
      await db.wishLink.create({ data: { id: ids.next(), slug: `pb19-${ids.next().slice(-8)}`, wishId: w, active: true } });
      ws.push(w);
    }
    const card = (auth: string, wishIds: string[]) => http().post("/v1/qr-cards").set("Authorization", auth).send({ wishIds });
    expect((await card(maker.auth, ws)).status).toBe(404); // not delivered yet
    await deliver(maker.auth, id, ws).expect(200);
    const ok = await card(maker.auth, ws).expect(200);
    expect(ok.body).toMatchObject({ status: "done", kind: "table-card" });
    expect((await card(other.auth, ws)).status).toBe(404);
    const stranger = await k.account();
    expect((await card(stranger.auth, ws)).status).toBe(404);
    const ops = await k.staff(["ops"]);
    expect((await card(ops.auth, ws)).status).toBe(403);
    // the quote cap
    const o = (await place(a.auth)).body.id;
    const list = Number((await db.$queryRaw<{ l: bigint }[]>`SELECT "listKobo" AS l FROM concierge_order_ext WHERE "orderId" = ${o}::uuid`)[0].l);
    const q = (kobo: number) => http().post(`/v1/admin/concierge-orders/${o}/quote`).set("Authorization", ops.auth).send({ quoteKobo: kobo, reason: "agreed by phone" });
    expect((await q(list * 100 + 1)).status).toBe(422);
    expect((await q(list * 100)).status).toBe(200);
    expect((await place(a.auth, { kind: "list", count: "2" })).status).toBe(422);
  });
});
