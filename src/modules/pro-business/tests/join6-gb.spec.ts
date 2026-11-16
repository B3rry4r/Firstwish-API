import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { RoyaltiesService } from "../../royalties/royalties.service";
import { InvoicesService } from "../invoices.service";

/*
 * GB1 (wave 6 join): the ordinary seal of a wish made from the sheet (E-30) or a date (E-32) earns its creator like the maker's seal.
 * By hand from the seeded price book: Studio 10,500,000 kobo for 35 wishes = 300,000 a wish, 20% = 60,000;
 * pack 1,750,000 for 5 = 350,000 a wish, 20% = 70,000.
 */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2037-05-04T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const letter = { letter: { paras: ["Happy birthday."] } };

describe("GB1: every client wish earns at its seal, whichever way it was made", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jest.spyOn(t.app.get(InvoicesService), "issue").mockResolvedValue(null);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const person = async (sides: ("business" | "creator")[] = []) => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `j6gb-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", ...sides], lastSide: "person" } });
    const token = `j6gb-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, token };
  };
  const owner = async () => {
    const w = await person(["business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Studio", since: NOW } });
    return { ...w, businessId };
  };
  const creator = async () => {
    const w = await person(["creator"]);
    const creatorId = ids.next();
    await db.creator.create({ data: { id: creatorId, accountId: w.accountId, name: "Ada" } });
    return { ...w, creatorId };
  };
  const style = async (level: string, creatorDoc: Record<string, string> | null) => {
    const slug = `j6gb-${run}-${++seq}`;
    await db.style.create({ data: { id: ids.next(), slug, level, tier: level, name: slug, house: false, on: true, creator: (creatorDoc ?? undefined) as never } });
    return slug;
  };
  async function pay(o: { accountId: string; businessId: string }, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
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
  /** Sets the style and the words on a wish the sheet or a date made, then seals it the ordinary way (no usePlan). */
  async function finish(token: string, wishId: string, styleSlug: string) {
    const w = await db.wish.findUniqueOrThrow({ where: { id: wishId } });
    const p = await t.http().patch(`/v1/wishes/${wishId}`).set(bearer(token)).send({ version: w.version, style: styleSlug, content: letter });
    expect(p.status).toBe(200);
    const s = await t.http().post(`/v1/wishes/${wishId}/seal`).set(bearer(token)).send({ version: p.body.version, openNow: true });
    return s;
  }
  const sheet = (token: string) => t.http().post("/v1/business/client-wishes").set(bearer(token)).send({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2037-06-04" });
  const accruals = (wishId: string) => db.royaltyAccrual.findMany({ where: { wishId } });

  it("a wish made from the sheet on a plan month, style changed to a creator's Premium style, earns 60,000 once; a replay adds nothing", async () => {
    const o = await owner();
    const c = await creator();
    const planPayment = await pay(o, "pro.studio");
    const s = await style("premium", { creatorId: c.creatorId });
    const made = await sheet(o.token);
    expect(made.status).toBe(201);
    expect(await accruals(made.body.wishId)).toHaveLength(0); // nothing before the seal: the style can still change
    const sealed = await finish(o.token, made.body.wishId, s);
    expect(sealed.status).toBe(200);
    const rows = await accruals(made.body.wishId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creatorId: c.creatorId, basis: "pro_wish", amountKobo: 60_000n, paymentId: planPayment, styleSlug: s });
    const entries = await db.ledgerEntry.findMany({ where: { paymentId: planPayment, account: "royalties_payable" } });
    expect(entries.reduce((n, e) => n + (e.direction === "credit" ? e.amountKobo : -e.amountKobo), 0n)).toBe(60_000n);
    // a replay: sealing again is refused, and the accrual asked for again changes nothing
    expect((await t.http().post(`/v1/wishes/${made.body.wishId}/seal`).set(bearer(o.token)).send({ version: 99, openNow: true })).status).toBeGreaterThanOrEqual(409);
    const again = await db.$transaction((tx) => t.app.get(RoyaltiesService).accrueForDraw(tx, { businessId: o.businessId, from: "month", wishId: made.body.wishId, styleSlug: s }));
    expect(again).toEqual([]);
    expect(await accruals(made.body.wishId)).toHaveLength(1);
  });

  it("a wish made from a date (E-32) on a pack earns 70,000; a Standard style earns none; the maker's seal still earns once", async () => {
    const o = await owner();
    const c = await creator();
    const packPayment = await pay(o, "pro.pack");
    const premium = await style("premium", { creatorId: c.creatorId });
    const standard = await style("standard", { creatorId: c.creatorId });
    const personId = ids.next();
    await db.person.create({ data: { id: personId, businessId: o.businessId, name: "Kemi" } });
    const date = await t.http().post(`/v1/business/client-wishes/${personId}/approve-date`).set(bearer(o.token))
      .send({ client: "Kemi", day: "2037-06-04", key: `${personId}:b:2037`, kind: "teams", occasion: "Staff birthday" });
    expect(date.status).toBe(201);
    expect((await finish(o.token, date.body.wishId, premium)).status).toBe(200);
    const rows = await accruals(date.body.wishId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creatorId: c.creatorId, basis: "pro_wish", amountKobo: 70_000n, paymentId: packPayment });
    const plain = await sheet(o.token);
    expect((await finish(o.token, plain.body.wishId, standard)).status).toBe(200);
    expect(await accruals(plain.body.wishId)).toHaveLength(0);
    // the maker's own seal on the plan still accrues once (no second accrual from the new path)
    const d = await t.http().post("/v1/wishes").set(bearer(o.token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: premium });
    const w = await t.http().patch(`/v1/wishes/${d.body.id}`).set(bearer(o.token)).send({ version: d.body.version, content: letter });
    const made = await t.http().post(`/v1/wishes/${d.body.id}/seal`).set(bearer(o.token)).send({ version: w.body.version, openNow: true, usePlan: true });
    expect(made.status).toBe(200);
    expect(await accruals(d.body.id)).toHaveLength(1);
  });

  it("a wish earns once whichever draw source asks: pack then month writes one accrual, not two", async () => {
    const o = await owner();
    const c = await creator();
    await pay(o, "pro.pack");
    await pay(o, "pro.studio");
    const s = await style("premium", { creatorId: c.creatorId });
    const made = await sheet(o.token);
    const wishId = made.body.wishId as string;
    await db.wish.update({ where: { id: wishId }, data: { styleSlug: s } });
    const royalties = t.app.get(RoyaltiesService);
    const first = await db.$transaction((tx) => royalties.accrueForDraw(tx, { businessId: o.businessId, from: "pack", wishId, styleSlug: s }));
    const second = await db.$transaction((tx) => royalties.accrueForDraw(tx, { businessId: o.businessId, from: "month", wishId, styleSlug: s }));
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
    expect(await accruals(wishId)).toHaveLength(first.length);
  });
});
