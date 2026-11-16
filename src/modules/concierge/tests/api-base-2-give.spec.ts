import { SettlementService } from "../../payments/settlement.service";
import { PrismaService } from "../../../common/db/prisma.service";
import { boot, ids } from "./kit";

const NOW = new Date("2026-12-07T09:00:00.000Z");
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-2 (HG1): a give carries the maker the staff member saw (expectedMaker); a stale one is 409 order_changed and changes nothing. */
describe("HG1: Concierge give carries the expected maker", () => {
  let k: Kit;
  let db: PrismaService;
  let settle: SettlementService;
  beforeAll(async () => {
    k = await boot("ab2g", NOW);
    db = k.db;
    settle = k.t.app.get(SettlementService);
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));

  const http = () => k.t.http();
  async function paidOrder() {
    const a = await k.account();
    const placed = await http().post("/v1/concierge-orders").set("Authorization", a.auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false }).expect(201);
    const orderId = placed.body.id as string;
    const ext = await db.$queryRaw<{ amountKobo: bigint }[]>`SELECT "amountKobo" FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`;
    const total = ext[0].amountKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    const book = await db.price.findFirstOrThrow({ where: { sku: "concierge.single" }, orderBy: { version: "desc" } });
    await db.payment.create({
      data: {
        id, accountId: a.id, businessId: null, payerContact: "x@example.com", purpose: "concierge", subjectId: orderId,
        lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${a.id}:${id}`, channel: "card",
        options: { request: { purpose: "concierge", id: "single", subjectId: orderId }, server: { fingerprint: id, flags: [] } },
      },
    });
    await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: k.t.clock.now() });
    return orderId;
  }
  const give = (auth: string, order: string, body: Record<string, unknown>) =>
    http().post(`/v1/admin/concierge/orders/${order}/maker`).set("Authorization", auth).send({ reason: "Looked at the screen", ...body });
  const audits = (order: string) => db.auditEntry.count({ where: { subjectId: order } });
  const row = (order: string) => db.conciergeOrder.findUniqueOrThrow({ where: { id: order } });

  it("the right maker gives (none seen, then the one seen); a give without the field is 422 naming it", async () => {
    const ops = await k.staff(["ops"]);
    const [m1, m2] = [await k.staff(["maker"]), await k.staff(["maker"])];
    const order = await paidOrder();
    const missing = await give(ops.auth, order, { makerId: m1.id });
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.body.error.fields)).toContain("expectedMaker");
    expect((await row(order)).makerId).toBeNull();
    expect(await audits(order)).toBe(0);
    expect((await give(ops.auth, order, { makerId: m1.id, expectedMaker: "" })).status).toBe(200);
    expect((await row(order)).makerId).toBe(m1.id);
    expect((await give(ops.auth, order, { makerId: m2.id, expectedMaker: m1.id })).status).toBe(200);
    expect((await row(order)).makerId).toBe(m2.id);
    expect(await audits(order)).toBe(2);
  });

  it("a stale maker is 409 order_changed and the order and the audit are as before", async () => {
    const ops = await k.staff(["ops"]);
    const [m1, m2, m3] = [await k.staff(["maker"]), await k.staff(["maker"]), await k.staff(["maker"])];
    const order = await paidOrder();
    expect((await give(ops.auth, order, { makerId: m1.id, expectedMaker: "" })).status).toBe(200);
    const before = await row(order);
    const auditsBefore = await audits(order);
    const noticesBefore = await db.notice.count();
    // the screen was opened when the order had no maker
    const stale = await give(ops.auth, order, { makerId: m2.id, expectedMaker: "" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("order_changed");
    // the screen saw another maker
    const other = await give(ops.auth, order, { makerId: m3.id, expectedMaker: m2.id });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("order_changed");
    const after = await row(order);
    expect(after.makerId).toBe(m1.id);
    expect(after.status).toBe(before.status);
    expect(await audits(order)).toBe(auditsBefore);
    expect(await db.notice.count()).toBe(noticesBefore);
  });

  it("two staff giving at once with the same expected maker: exactly one 200", async () => {
    const ops = await k.staff(["ops"]);
    const ms = [await k.staff(["maker"]), await k.staff(["maker"])];
    const order = await paidOrder();
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => give(ops.auth, order, { makerId: ms[i % 2].id, expectedMaker: "" })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(19);
    expect(await audits(order)).toBe(1);
    expect(ms.map((m) => m.id)).toContain((await row(order)).makerId);
  });
});
