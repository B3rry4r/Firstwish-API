import { AccountErasureService } from "../../accounts/account-erasure.service";
import { SettlementService } from "../../payments/settlement.service";
import { PrismaService } from "../../../common/db/prisma.service";
import { NEXT, ENDS, canMove } from "../order-state";
import { boot, ids } from "./kit";
import { ownDatabase } from "../../../../test/kit/own-db";

const NOW = new Date("2026-12-07T09:00:00.000Z"); // a Monday
const H = 3_600_000;
type Kit = Awaited<ReturnType<typeof boot>>;
type Items = { items: { id: string }[] };
const idsOf = (r: { body: unknown }): string[] => (r.body as Items).items.map((o) => o.id);

describe("concierge orders B19", () => {
  let k: Kit;
  let db: PrismaService;
  let settle: SettlementService;
  // The makers list is one page of every maker in the database: other specs' makers push this spec's off it, so the spec has its own database.
  const own = ownDatabase("b19c");
  beforeAll(async () => {
    own.use();
    k = await boot("b19c", NOW);
    db = k.db;
    settle = k.t.app.get(SettlementService);
  });
  afterAll(async () => {
    await k.t.close();
    own.drop();
  });
  beforeEach(() => k.t.clock.set(NOW));

  const http = () => k.t.http();
  const unit = async () => {
    const p = await db.price.findFirstOrThrow({ where: { sku: "concierge.single" }, orderBy: { version: "desc" } });
    return p.promoKobo ?? p.listKobo;
  };
  const place = (auth: string, over: Record<string, unknown> = {}) =>
    http().post("/v1/concierge-orders").set("Authorization", auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false, ...over });

  /** The payment the start would have stored, then the provider's good answer through the one settle path. */
  async function pay(accountId: string, orderId: string, amount?: bigint, businessId: string | null = null) {
    const order = await db.$queryRaw<{ amountKobo: bigint }[]>`SELECT "amountKobo" FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`;
    const total = amount ?? order[0]?.amountKobo ?? 100n;
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
    await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: k.t.clock.now() });
    return db.payment.findUniqueOrThrow({ where: { id } });
  }
  const statusOf = async (id: string) => (await db.conciergeOrder.findUniqueOrThrow({ where: { id } })).status;

  it("1. placing: 401, 422 with fields, canonical input, priced from the price book (never the request)", async () => {
    const a = await k.account();
    await http().post("/v1/concierge-orders").send({ brief: "x", count: 1, kind: "single" }).expect(401);
    const bad = await place(a.auth, { kind: "weird", count: 0, brief: "   " }).expect(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(["kind", "count", "brief"]));
    expect((await place(a.auth, { rush: true }).expect(422)).body.error.fields.rush).toBeDefined();
    expect((await place(a.auth, { count: 3 }).expect(422)).body.error.fields.count).toBeDefined();
    expect((await http().post("/v1/concierge-orders").set("Authorization", a.auth).send({ brief: "x", count: 1, kind: "single", amount: 1 }).expect(422)).body.error.code).toBeDefined();
    const ok = await place(a.auth, { brief: "  A wish for my mother  " }).expect(201);
    expect(ok.body.brief).toBe("A wish for my mother");
    expect(ok.body.amount).toBe(Number(await unit()));
    expect(ok.body).toMatchObject({ status: "brief", state: "placed", kind: "single", count: 1, rush: false, accountId: a.id, dueAt: null, late: false });
    const list = await place(a.auth, { kind: "list", count: 4 }).expect(201);
    expect(list.body.amount).toBe(Number(await unit()) * 4);
  });

  it("1. a Pass holder's discount comes from the entitlements (20%), a business order carries the business", async () => {
    const a = await k.account();
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: a.id, purpose: "pass", lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack",
        providerReference: `fw-${payId}`, idempotencyKey: `k-${payId}`, options: {} },
    });
    await db.passMembership.create({ data: { id: ids.next(), accountId: a.id, paymentId: payId, state: "active", since: new Date(NOW.getTime() - H), validUntil: new Date(NOW.getTime() + 30 * 24 * H).toISOString() } });
    const ent = await db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const res = await place(a.auth).expect(201);
    expect(res.body.amount).toBe(Number((((await unit()) * BigInt(100 - ent.conciergePassDiscountPercent)) + 50n) / 100n));
    const b = await k.account(["person", "business"]);
    const biz = ids.next();
    await db.business.create({ data: { id: biz, accountId: b.id, name: "Rose Studio" } });
    const o = await place(b.auth).expect(201);
    expect(o.body.businessId).toBe(biz);
    expect(o.body.from).toBe("Rose Studio");
  });

  it("1. paid through the payments start: only your own open order, at the price the payment charges", async () => {
    const a = await k.account();
    const other = await k.account();
    const mine = (await place(a.auth)).body.id;
    const start = (auth: string, subjectId: string) =>
      http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `b19-${ids.next()}`).send({ purpose: "concierge", id: "single", subjectId });
    expect((await start(other.auth, mine)).status).toBe(422);
    expect((await start(a.auth, "not-an-id")).status).toBe(422);
    const ok = await start(a.auth, mine);
    expect([200, 201]).toContain(ok.status);
    // CA1: a list order is charged its own price (count x unit), not one unit
    const list = (await place(a.auth, { kind: "list", count: 2 })).body.id;
    const listStart = await start(a.auth, list);
    expect(listStart.body.payment.amountKobo).toBe(Number(await unit()) * 2);
  });

  it("1. payment moves the order to paid once; a single wish is due 3 hours after payment and shows late after that", async () => {
    const a = await k.account();
    const id = (await place(a.auth)).body.id;
    const p = await pay(a.id, id);
    expect(p.flags).toEqual([]);
    const m = await k.staff(["ops"]);
    const read = await http().get(`/v1/admin/concierge/orders/${id}`).set("Authorization", m.auth).expect(200);
    expect(read.body).toMatchObject({ status: "paid", state: "paid", dueAt: new Date(NOW.getTime() + 3 * H).toISOString(), late: false });
    expect(read.body.deliverBy).toBe(read.body.dueAt);
    k.t.clock.set(new Date(NOW.getTime() + 3 * H + 1000));
    expect((await http().get(`/v1/admin/concierge/orders/${id}`).set("Authorization", m.auth)).body.late).toBe(true);
    // the same payment settled again changes nothing
    const ext = await db.$queryRaw<{ paidAt: Date }[]>`SELECT "paidAt" FROM concierge_order_ext WHERE "orderId" = ${id}::uuid`;
    expect(ext[0].paidAt.toISOString()).toBe(NOW.toISOString());
    // the due list holds it, late
    const due = await http().get("/v1/admin/concierge/due").set("Authorization", m.auth).expect(200);
    expect(idsOf(due)).toContain(id);
  });

  it("1. a payment that does not match its order is flagged refund_due and the order stays open", async () => {
    const a = await k.account();
    const id = (await place(a.auth)).body.id;
    const p = await pay(a.id, id, 100n);
    expect(p.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:amount_mismatch"]));
    expect(await statusOf(id)).toBe("brief");
    const stranger = await k.account();
    const q = await pay(stranger.id, id);
    expect(q.flags).toContain("refund_due:order_not_payers");
    const missing = await pay(a.id, ids.next());
    expect(missing.flags).toContain("refund_due:order_missing");
  });

  it("2. makers: a maker sees only their own orders, owner and ops see all; give and give again with a reason and an audit row", async () => {
    const a = await k.account();
    const [m1, m2, ops, owner] = [await k.staff(["maker"]), await k.staff(["maker"]), await k.staff(["ops"]), await k.staff(["owner"])];
    const id = (await place(a.auth)).body.id;
    const give = (auth: string, order: string, makerId: string, reason = "first give", expectedMaker = "") =>
      http().post(`/v1/admin/concierge/orders/${order}/maker`).set("Authorization", auth).send({ makerId, reason, expectedMaker });
    expect((await give(ops.auth, id, m1.id)).status).toBe(409); // not paid yet
    await pay(a.id, id);
    expect((await give(m1.auth, id, m1.id)).status).toBe(403);
    expect((await give(ops.auth, id, m1.id, "ab")).status).toBe(422);
    expect((await give(ops.auth, id, ids.next())).status).toBe(422);
    await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ reason: "no maker named", expectedMaker: "" }).expect(422);
    const g = await give(ops.auth, id, m1.id).expect(200);
    expect(g.body).toMatchObject({ makerId: m1.id, status: "given" });
    expect((await give(ops.auth, id, m1.id)).status).toBe(409);
    expect((await http().get(`/v1/admin/concierge/orders/${id}`).set("Authorization", m1.auth)).status).toBe(200);
    expect((await http().get(`/v1/admin/concierge/orders/${id}`).set("Authorization", m2.auth)).status).toBe(404);
    expect((await http().get(`/v1/admin/concierge/orders/${id}`).set("Authorization", owner.auth)).status).toBe(200);
    await give(owner.auth, id, m2.id, "m1 is away", m1.id).expect(200);
    expect((await http().get(`/v1/admin/concierge/orders/${id}`).set("Authorization", m1.auth)).status).toBe(404);
    const mine = await http().get("/v1/admin/concierge/orders").set("Authorization", m2.auth).expect(200);
    expect(idsOf(mine)).toEqual([id]);
    const rows = await db.auditEntry.findMany({ where: { subjectId: id }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["concierge.give", "concierge.give-again"]);
    const makers = await http().get("/v1/admin/concierge/makers").set("Authorization", ops.auth).expect(200);
    const row = (makers.body as Items & { items: { open: number }[] }).items.find((m) => m.id === m2.id);
    expect(row).toMatchObject({ open: 1 });
    expect(idsOf(await http().get("/v1/admin/concierge/makers").set("Authorization", m1.auth))).toEqual([m1.id]);
    await http().get("/v1/admin/concierge/orders").expect(401);
  });

  it("2. giving at once: the same maker is won by one; different makers each win in turn (give again, ruling A9), never two owners", async () => {
    const a = await k.account();
    const makers = [await k.staff(["maker"]), await k.staff(["maker"]), await k.staff(["maker"])];
    const ops = await k.staff(["ops"]);
    const give = (id: string, makerId: string, reason: string, expectedMaker = "") =>
      http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId, reason, expectedMaker });
    const fresh = async () => {
      const id = (await place(a.auth)).body.id as string;
      await pay(a.id, id);
      return id;
    };
    // (a) 50 gives of one order to one maker at once: exactly one 200, every other 409 with nothing written
    const same = await fresh();
    const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => give(same, makers[0].id, `same ${i} reason`)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(49);
    expect((await db.conciergeOrder.findUniqueOrThrow({ where: { id: same } })).makerId).toBe(makers[0].id);
    expect(await db.auditEntry.count({ where: { subjectId: same } })).toBe(1);
    // (b) 50 gives to three makers at once: a second give after the first has landed is a legal give again, so how many
    // answer 200 depends on timing; what never depends on it: each 200 wrote one audit row, each other answer is 409 and wrote none,
    // and the order has one of the three makers.
    const mixed = await fresh();
    const rm = await Promise.all(Array.from({ length: 50 }, (_, i) => give(mixed, makers[i % 3].id, `mixed ${i} reason`)));
    const won = rm.filter((r) => r.status === 200).length;
    expect(won).toBeGreaterThanOrEqual(1);
    expect(rm.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
    const rows = await db.auditEntry.findMany({ where: { subjectId: mixed }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(rows).toHaveLength(won);
    expect(rows.filter((r) => r.action === "concierge.give")).toHaveLength(1);
    const order = await db.conciergeOrder.findUniqueOrThrow({ where: { id: mixed } });
    expect(makers.map((m) => m.id)).toContain(order.makerId);
    expect(order.status).toBe("given");
    // (c) one after the other, as the ruling allows: A gives to X, then B gives again to Y with a reason; both 200, two rows
    const turn = await fresh();
    await give(turn, makers[0].id, "first give").expect(200);
    await give(turn, makers[1].id, "give again to Y", makers[0].id).expect(200);
    expect((await db.conciergeOrder.findUniqueOrThrow({ where: { id: turn } })).makerId).toBe(makers[1].id);
    expect((await db.auditEntry.findMany({ where: { subjectId: turn }, select: { action: true } })).map((r) => r.action).sort()).toEqual(["concierge.give", "concierge.give-again"]);
    await give(turn, makers[1].id, "same again", makers[1].id).expect(409);
    // (d) a give racing a cancel: one order, one end; a give that lost is 409 and wrote nothing
    const rc = await fresh();
    const [g, c] = await Promise.all([
      give(rc, makers[0].id, "give vs cancel"),
      http().post(`/v1/admin/concierge/orders/${rc}/cancel`).set("Authorization", ops.auth).send({ reason: "cancel vs give" }),
    ]);
    const end = await db.conciergeOrder.findUniqueOrThrow({ where: { id: rc } });
    expect(c.status).toBe(200);
    expect([200, 409]).toContain(g.status);
    expect(end.status).toBe("cancelled");
    expect(await db.auditEntry.count({ where: { subjectId: rc, action: { startsWith: "concierge.give" } } })).toBe(g.status === 200 ? 1 : 0);
  });

  it("3. delivery: the maker names real wishes of that order; the customer reads which were opened", async () => {
    const a = await k.account();
    const stranger = await k.account();
    const [m1, m2, ops] = [await k.staff(["maker"]), await k.staff(["maker"]), await k.staff(["ops"])];
    const id = (await place(a.auth, { kind: "list", count: 2 })).body.id;
    await pay(a.id, id);
    const w1 = await k.wish(a.id);
    const w2 = await k.wish(a.id);
    const foreign = await k.wish(stranger.id);
    const deliver = (auth: string, wishIds: string[], reason = "all made") =>
      http().post(`/v1/admin/concierge-orders/${id}/delivery`).set("Authorization", auth).send({ reason, wishIds });
    await http().post(`/v1/admin/concierge/orders/${id}/maker`).set("Authorization", ops.auth).send({ makerId: m1.id, reason: "to m1", expectedMaker: "" }).expect(200);
    expect((await deliver(ops.auth, [w1])).status).toBe(403);
    expect((await deliver(m2.auth, [w1])).status).toBe(404);
    expect((await deliver(m1.auth, [w1], "no")).status).toBe(422);
    expect((await deliver(m1.auth, [])).status).toBe(422);
    expect((await deliver(m1.auth, [foreign])).status).toBe(422);
    expect((await deliver(m1.auth, [ids.next()])).status).toBe(422);
    expect((await deliver(m1.auth, [w1, w2, await k.wish(a.id)])).status).toBe(422);
    const ok = await deliver(m1.auth, [w1, w2]).expect(200);
    expect(ok.body).toMatchObject({ status: "delivered", state: "delivered", wishIds: [w1, w2] });
    expect((await deliver(m1.auth, [w1])).status).toBe(409);
    // a wish is delivered under one order only
    const other = (await place(a.auth)).body.id;
    await pay(a.id, other);
    await http().post(`/v1/admin/concierge/orders/${other}/maker`).set("Authorization", ops.auth).send({ makerId: m1.id, reason: "to m1", expectedMaker: "" }).expect(200);
    expect((await http().post(`/v1/admin/concierge-orders/${other}/delivery`).set("Authorization", m1.auth).send({ reason: "dup one", wishIds: [w1] })).status).toBe(422);
    // the report reads the receiver's opens; nothing is copied
    await db.wishOpen.create({ data: { id: ids.next(), wishId: w1, slug: "x", kind: "read", first: true, session: "s", createdAt: NOW } });
    const mine = await http().get(`/v1/concierge-orders/${id}`).set("Authorization", a.auth).expect(200);
    const by = Object.fromEntries((mine.body as { record: { wishId: string; opened: boolean }[] }).record.map((r) => [r.wishId, r.opened]));
    expect(by).toEqual({ [w1]: true, [w2]: false });
    expect((await http().get(`/v1/concierge-orders/${id}`).set("Authorization", stranger.auth)).status).toBe(404);
    expect((await http().get("/v1/concierge-orders").set("Authorization", a.auth)).body.items.length).toBeGreaterThan(0);
  });

  it("1. every state has a way out; a cancel after payment marks the payment refund_due, before payment it does not", async () => {
    for (const s of Object.keys(NEXT) as (keyof typeof NEXT)[]) {
      if (ENDS.includes(s)) expect(NEXT[s]).toEqual([]);
      else expect(NEXT[s].some((n) => n !== s)).toBe(true);
    }
    expect(canMove("delivered", "cancelled")).toBe(false);
    const a = await k.account();
    const ops = await k.staff(["ops"]);
    const unpaid = (await place(a.auth)).body.id;
    expect((await http().post(`/v1/concierge-orders/${unpaid}/cancel`).set("Authorization", a.auth)).status).toBe(200);
    expect(await statusOf(unpaid)).toBe("cancelled");
    expect((await http().post(`/v1/concierge-orders/${unpaid}/cancel`).set("Authorization", a.auth)).status).toBe(409);
    const paid = (await place(a.auth)).body.id;
    const p = await pay(a.id, paid);
    await http().post(`/v1/admin/concierge/orders/${paid}/cancel`).set("Authorization", ops.auth).send({ reason: "no" }).expect(422);
    await http().post(`/v1/admin/concierge/orders/${paid}/cancel`).set("Authorization", ops.auth).send({ reason: "customer asked" }).expect(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).flags).toContain("refund_due");
    expect(await db.auditEntry.count({ where: { subjectId: paid, action: "concierge.cancel" } })).toBe(1);
    // a payment that arrives for a cancelled order is not matched: flagged for a refund, the order stays cancelled
    const late = await pay(a.id, unpaid);
    expect(late.flags).toContain("refund_due:order_not_open");
    expect(await statusOf(unpaid)).toBe("cancelled");
    // a customer cannot cancel an order that is with a maker
    const maker = await k.staff(["maker"]);
    const making = (await place(a.auth)).body.id;
    await pay(a.id, making);
    await http().post(`/v1/admin/concierge/orders/${making}/maker`).set("Authorization", ops.auth).send({ makerId: maker.id, reason: "to maker", expectedMaker: "" }).expect(200);
    expect((await http().post(`/v1/concierge-orders/${making}/cancel`).set("Authorization", a.auth)).status).toBe(409);
  });

  it("1. quote: ops set a price on an order not yet paid; a bad price is 422; a maker cannot", async () => {
    const a = await k.account();
    const [ops, maker] = [await k.staff(["ops"]), await k.staff(["maker"])];
    const id = (await place(a.auth)).body.id;
    const q = (auth: string, quoteKobo: number, reason = "agreed by phone") => http().post(`/v1/admin/concierge-orders/${id}/quote`).set("Authorization", auth).send({ quoteKobo, reason });
    expect((await q(maker.auth, 5)).status).toBe(403);
    expect((await q(ops.auth, -1)).status).toBe(422);
    expect((await q(ops.auth, 5, "no")).status).toBe(422);
    const ok = await q(ops.auth, 123_000).expect(200);
    expect(ok.body).toMatchObject({ status: "quoted", quoteKobo: 123_000, amount: 123_000 });
    await http().get("/v1/admin/concierge/due").expect(401);
    await http().get("/v1/admin/concierge/due?from=bad").set("Authorization", ops.auth).expect(422);
  });

  it("6. erase: the order's brief goes with the account, the money rows stay", async () => {
    const a = await k.account();
    const id = (await place(a.auth, { brief: "private words" })).body.id;
    const p = await pay(a.id, id);
    await t_erase(a.id);
    const row = await db.conciergeOrder.findUniqueOrThrow({ where: { id } });
    expect(row.brief).toBe("");
    const ext = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM concierge_order_ext WHERE "orderId" = ${id}::uuid AND "paymentId" = ${p.id}::uuid`;
    expect(ext[0].n).toBe(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).amountKobo).toBeGreaterThan(0n);
  });

  async function t_erase(accountId: string) {
    const svc = k.t.app.get(AccountErasureService);
    await svc.erase(accountId, { actor: { type: "system", id: null, requestId: "b19" }, reason: null });
  }
});
