import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../src/common/db/prisma.service";
import { UuidV7Maker } from "../../src/common/ids/uuidv7";
import { createTestApp, TestApp } from "../kit/app";
import { SettlementService } from "../../src/modules/payments/settlement.service";
import { InvoicesService } from "../../src/modules/pro-business/invoices.service";
import { RoyaltiesService } from "../../src/modules/royalties/royalties.service";

/*
 * HD2: a client wish earns from the payment it was DRAWN against. The draw writes its source on the client-wish record (month or pack,
 * the payment, the sku of the line and how many wishes the line gave); the royalty at the seal reads it. By hand from the seeded price book:
 *   Pro Starter  3,500,000 kobo for 10 wishes -> 350,000 a wish -> 20% = 70,000
 *   Pro Studio  10,500,000 kobo for 35 wishes -> 300,000 a wish -> 20% = 60,000
 * The verifier's case: April Starter with 4 used (6 roll into May), May Studio; eight sheet wishes are drawn, THEN all sealed in one
 * creator's Premium style. The first six were counted from what rolled over (April's Starter): 70,000 each. The last two came from May's own
 * allowance (Studio): 60,000 each. Worked out at the seal from the business, all eight would have read the Studio.
 */
const ROOT = join(__dirname, "../..");
const APRIL = new Date("2038-04-02T09:00:00.000Z");
const MAY = new Date("2038-05-03T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const letter = { letter: { paras: ["Happy birthday."] } };

describe("HD2: the draw records its source; the seal reads it", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: APRIL });
    db = t.app.get(PrismaService);
    jest.spyOn(t.app.get(InvoicesService), "issue").mockResolvedValue(null);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(APRIL));

  const person = async (sides: ("business" | "creator")[]) => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `hd2-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", ...sides], lastSide: "person" } });
    const token = `hd2-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, token };
  };
  const owner = async () => {
    const w = await person(["business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Studio", since: APRIL } });
    return { ...w, businessId };
  };
  const creator = async () => {
    const w = await person(["creator"]);
    const creatorId = ids.next();
    await db.creator.create({ data: { id: creatorId, accountId: w.accountId, name: "Ada" } });
    return { ...w, creatorId };
  };
  const style = async (creatorId: string) => {
    const slug = `hd2-${run}-${++seq}`;
    await db.style.create({ data: { id: ids.next(), slug, level: "premium", tier: "premium", name: slug, house: false, on: true, creator: { creatorId } as never } });
    return slug;
  };
  async function pay(o: { accountId: string; businessId: string }, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku, version: 1 } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, payerContact: "x@example.com", purpose: "ticket", subjectId: null,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${o.accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } },
      },
    });
    const out = await t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return id;
  }
  const sheet = (token: string) => t.http().post("/v1/business/client-wishes").set(bearer(token)).send({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2038-06-04" });
  async function finish(token: string, wishId: string, styleSlug: string) {
    const w = await db.wish.findUniqueOrThrow({ where: { id: wishId } });
    const p = await t.http().patch(`/v1/wishes/${wishId}`).set(bearer(token)).send({ version: w.version, style: styleSlug, content: letter });
    expect(p.status).toBe(200);
    return t.http().post(`/v1/wishes/${wishId}/seal`).set(bearer(token)).send({ version: p.body.version, openNow: true });
  }

  it("April Starter with 4 used, May Studio (6 rolled): 8 sheet wishes drawn then all sealed: six earn 70,000 and two earn 60,000", async () => {
    const o = await owner();
    const c = await creator();
    const s = await style(c.creatorId);
    const starter = await pay(o, "pro.starter");
    await db.business.update({ where: { id: o.businessId }, data: { used: 4 } });
    t.clock.set(MAY);
    const studio = await pay(o, "pro.studio");
    expect(await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).toMatchObject({ allowance: 35, rolled: 6, used: 0 });

    const made: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await sheet(o.token);
      expect(r.status).toBe(201);
      made.push(r.body.wishId);
    }
    // the record names its source at the draw, before any seal
    const recs = await db.clientWish.findMany({ where: { wishId: { in: made } } });
    expect(recs).toHaveLength(8);
    expect(recs.filter((r) => r.drawPaymentId === starter)).toHaveLength(6);
    expect(recs.filter((r) => r.drawPaymentId === studio)).toHaveLength(2);
    expect(recs.every((r) => r.drawFrom === "month")).toBe(true);
    expect(recs.filter((r) => r.drawPaymentId === starter).every((r) => r.drawSku === "pro.starter" && r.drawWishes === 10)).toBe(true);
    expect(recs.filter((r) => r.drawPaymentId === studio).every((r) => r.drawSku === "pro.studio" && r.drawWishes === 35)).toBe(true);

    for (const id of made) expect((await finish(o.token, id, s)).status).toBe(200);
    const byWish = new Map<string, { paymentId: string | null; amountKobo: bigint }[]>();
    for (const id of made) byWish.set(id, await db.royaltyAccrual.findMany({ where: { wishId: id }, select: { paymentId: true, amountKobo: true } }));
    const earned = made.map((id) => byWish.get(id) as { paymentId: string | null; amountKobo: bigint }[]);
    expect(earned.every((rows) => rows.length === 1)).toBe(true);
    const amounts = earned.map((rows) => rows[0].amountKobo).sort((a, b) => Number(a - b));
    expect(amounts).toEqual([60_000n, 60_000n, 70_000n, 70_000n, 70_000n, 70_000n, 70_000n, 70_000n]);
    for (const rows of earned) {
      expect(rows[0].paymentId).toBe(rows[0].amountKobo === 70_000n ? starter : studio);
    }
    // and each wish earns once: the accrual asked for again changes nothing
    const again = await db.$transaction((tx) => t.app.get(RoyaltiesService).accrueForDraw(tx, { businessId: o.businessId, from: "month", wishId: made[0], styleSlug: s }));
    expect(again).toEqual([]);
  });

  it("a pack wish records the pack payment and its size; the usePlan seal (draw and seal together) writes the same record", async () => {
    const o = await owner();
    const c = await creator();
    const s = await style(c.creatorId);
    const pack = await pay(o, "pro.pack");
    const made = await sheet(o.token);
    expect(made.status).toBe(201);
    expect(await db.clientWish.findUniqueOrThrow({ where: { wishId: made.body.wishId } })).toMatchObject({ drawFrom: "pack", drawPaymentId: pack, drawSku: "pro.pack", drawWishes: 5 });
    expect((await finish(o.token, made.body.wishId, s)).status).toBe(200);
    expect(await db.royaltyAccrual.findMany({ where: { wishId: made.body.wishId } })).toMatchObject([{ paymentId: pack, amountKobo: 70_000n }]);

    // the maker's seal on the plan: one transaction, the source written and read at once
    const d = await t.http().post("/v1/wishes").set(bearer(o.token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: s });
    expect(d.status).toBe(201);
    const p = await t.http().patch(`/v1/wishes/${d.body.id}`).set(bearer(o.token)).send({ version: d.body.version, content: letter });
    const sealed = await t.http().post(`/v1/wishes/${d.body.id}/seal`).set(bearer(o.token)).send({ version: p.body.version, openNow: true, usePlan: true });
    expect(sealed.status).toBe(200);
    expect(await db.clientWish.findUniqueOrThrow({ where: { wishId: d.body.id } })).toMatchObject({ drawFrom: "pack", drawPaymentId: pack, drawSku: "pro.pack", drawWishes: 5 });
    expect(await db.royaltyAccrual.findMany({ where: { wishId: d.body.id } })).toMatchObject([{ paymentId: pack, amountKobo: 70_000n }]);
  });
});
