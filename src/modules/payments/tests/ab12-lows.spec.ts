import { PrismaService } from "../../../common/db/prisma.service";
import { ownDatabase } from "../../../../test/kit/own-db";
import { boot, ids } from "../../concierge/tests/kit";
import { JobsService } from "../../jobs/jobs.service";
import { JobHandlers } from "../../job-handlers/job-handlers.service";
import { SettlementService } from "../settlement.service";

const NOW = new Date("2027-12-01T09:00:00.000Z");
const DAY = 86_400_000;
const run = `${process.pid}${Date.now() % 100000}`;
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-12 case 5 (IE1, API-BASE-12 case 5): the four lows. */
describe("the lows of the twelfth round", () => {
  const own = ownDatabase("ab12lows");
  let k: Kit;
  let db: PrismaService;
  beforeAll(async () => {
    own.use();
    k = await boot("ab12l", NOW);
    db = k.db;
  });
  afterAll(async () => {
    await k.t.close();
    own.drop();
  });
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  let n = 0;

  async function paid(accountId: string, purpose: string, subjectId: string | null, sku: string, amount: bigint) {
    const id = ids.next();
    await db.payment.create({
      data: { id, accountId, purpose: purpose as never, subjectId, lines: [{ sku, name: sku, qty: 1, unitKobo: Number(amount), totalKobo: Number(amount) }], amountKobo: amount, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${accountId}:${id}`, channel: "card", options: { request: { purpose, subjectId }, server: { fingerprint: id, flags: [] } } } as never,
    });
    return { id, reference: `fw-${id}` };
  }

  it("1. a published row of a Concierge wish is dropped when the order is delivered, with its ask; the buyer's own published wishes stay", async () => {
    const m = await k.staff(["maker"]);
    const ops = await k.staff(["ops"]);
    const buyer = await k.account();
    const order = (await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `brief ${run}-${++n}`, count: 1, kind: "single", rush: false })).body.id as string;
    const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${order}::uuid`)[0].a;
    const pay = await paid(buyer.id, "concierge", order, "concierge.single", amt);
    await k.t.app.get(SettlementService).settle({ reference: pay.reference, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
    await http().post(`/v1/admin/concierge/orders/${order}/maker`).set("Authorization", ops.auth).send({ makerId: m.id, reason: "to maker", expectedMaker: "" }).expect(200);
    const made = await http().post(`/v1/admin/concierge/orders/${order}/wishes`).set("Authorization", m.auth).send({ reason: "making it", kind: "birthday", occasion: "birthday", name: "Ada Obi" });
    expect(made.status).toBe(201);
    const wish = made.body.id as string;
    const got = await http().get(`/v1/wishes/${wish}`).set("Authorization", m.auth);
    const saved = await http().patch(`/v1/wishes/${wish}`).set("Authorization", m.auth).send({ version: got.body.version, name: "Ada Obi", content: { letter: { paras: ["Happy birthday, Ada."] } } });
    expect(saved.status).toBe(200);
    expect((await http().post(`/v1/wishes/${wish}/seal`).set("Authorization", m.auth).send({ version: saved.body.version, openNow: true })).status).toBe(200);
    // a row on Now showing and its ask, as an older build could have left them; and one of the buyer's own wishes, which must stay
    const stray = ids.next();
    await db.publishedWish.create({ data: { id: stray, wishId: wish, title: "A birthday wish", listedAt: NOW, publishedAt: NOW, scope: "public" } as never });
    await db.publishRequest.create({ data: { id: ids.next(), wishId: wish, level: "now_showing", consentConfirmed: true, screening: "pass", status: "approved" } as never });
    const own = await k.wish(buyer.id, { status: "live" });
    const ownRow = ids.next();
    await db.publishedWish.create({ data: { id: ownRow, wishId: own, title: "Mine", listedAt: NOW, publishedAt: NOW, scope: "public" } as never });
    const done = await http().post(`/v1/admin/concierge-orders/${order}/delivery`).set("Authorization", m.auth).send({ reason: "all made" });
    expect(done.status).toBe(200);
    expect(await db.publishedWish.count({ where: { wishId: wish } })).toBe(0);
    expect(await db.publishRequest.count({ where: { wishId: wish } })).toBe(0);
    expect(await db.publishedWish.count({ where: { id: ownRow } })).toBe(1);
    expect((await http().get(`/v1/wishes/${wish}`).set("Authorization", buyer.auth)).status).toBe(200); // the buyer has it, to publish themselves
  });

  it("2. every staff Prices line carries `confirmation`: null where the line is not a provisional setting, the object where it is", async () => {
    const finance = (await k.staff(["finance"])).auth;
    const items: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    do {
      const r = await http().get("/v1/admin/prices").query({ limit: 50, ...(cursor ? { cursor } : {}) }).set("Authorization", finance);
      expect(r.status).toBe(200);
      items.push(...r.body.items);
      cursor = r.body.nextCursor ?? undefined;
    } while (cursor);
    expect(items.length).toBeGreaterThan(24);
    expect(items.filter((l) => !("confirmation" in l))).toEqual([]);
    const ticketLines = items.filter((l) => String(l.key).startsWith("ticket.") || String(l.key).startsWith("extra.") || String(l.key).startsWith("keep."));
    expect(ticketLines.length).toBeGreaterThanOrEqual(10);
    for (const l of ticketLines) expect(l.confirmation).toBeNull();
    expect(items.find((l) => l.key === "limits.conciergeFilesDays")?.confirmation).toMatchObject({ provisional: true });
    // the public price book is as it was: no new field on its lines
    const pub = await http().get("/v1/price-book").query({ limit: 50 });
    expect(pub.status).toBe(200);
    expect((pub.body.items as Record<string, unknown>[]).some((l) => "confirmation" in l)).toBe(false);
  });

  it("3. the existing cleanup job sweeps support_contact_key rows older than 30 days and keeps the rest", async () => {
    const at = (days: number) => new Date(NOW.getTime() - days * DAY);
    const row = (name: string, days: number) => db.supportContactKey.create({ data: { keyHash: `${name}-${run}`, fingerprint: "f", createdAt: at(days) } });
    await row("old", 31);
    await row("older", 90);
    await row("edge", 29);
    await row("new", 0);
    k.t.app.get(JobHandlers).registerAll();
    const jobs = k.t.app.get(JobsService);
    const key = `ab12-sweep-${run}`;
    await jobs.schedule("upload-cleanup", NOW, key);
    expect(await jobs.runDue(100, [key])).toBe(1);
    const left = (await db.supportContactKey.findMany({ where: { keyHash: { endsWith: `-${run}` } } })).map((r) => r.keyHash.split("-")[0]).sort();
    expect(left).toEqual(["edge", "new"]);
  });

  it("4. a webhook whose reference differs only in case settles the same payment, once", async () => {
    const buyer = await k.account();
    const w = await k.wish(buyer.id, { status: "draft" });
    const book = await db.price.findFirstOrThrow({ where: { sku: "ticket.moment" }, orderBy: { version: "desc" } });
    const amt = book.promoKobo ?? book.listKobo;
    const p = await paid(buyer.id, "ticket", w, "ticket.moment", amt);
    let ev = 8_000_000;
    const hook = (reference: string) => {
      const body = JSON.stringify({ event: "charge.success", data: { id: ++ev, reference, amount: Number(amt), currency: "NGN", channel: "card", fees: 100, paid_at: NOW.toISOString() } });
      return http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", k.t.payments.sign(body)).send(body);
    };
    const upper = await hook(p.reference.toUpperCase());
    expect(upper.status).toBe(200);
    const row = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("succeeded");
    expect(await db.ledgerEntry.count({ where: { paymentId: p.id } })).toBeGreaterThan(0);
    const entries = await db.ledgerEntry.count({ where: { paymentId: p.id } });
    // the same event again, in the other spelling, settles nothing twice
    expect((await hook(p.reference)).status).toBe(200);
    expect(await db.ledgerEntry.count({ where: { paymentId: p.id } })).toBe(entries);
    expect((await db.webhookEvent.findMany({ where: { eventId: { endsWith: `:${p.reference}` } } })).every((e) => e.outcome === "fulfilled" || e.outcome === "already")).toBe(true);
    // a mixed-case reference of a payment that is not there changes nothing and is not a payment of anyone
    expect((await hook("FW-00000000-0000-7000-8000-000000000000")).status).toBe(200);
  });
});
