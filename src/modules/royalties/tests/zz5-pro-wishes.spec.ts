import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { InvoicesService } from "../../pro-business/invoices.service";
import { RoyaltiesService } from "../royalties.service";
import { RUN } from "../../../../test/kit/unique";

/*
 * ZZ5: a client wish drawn from a Pro plan month or a pack earns the creator of its Premium style 20% of that wish's share of what
 * the business paid. Every figure below is worked by hand from the seeded price book first:
 *   Pro Starter  promo 3,500,000 kobo (the list 5,800,000, 40% off), 10 wishes   -> 350,000 a wish   -> 20% = 70,000
 *   Pro Studio   promo 10,500,000 kobo, 35 wishes                                -> 300,000 a wish   -> 20% = 60,000
 *   Pack         promo 1,750,000 kobo, 5 wishes                                  -> 350,000 a wish   -> 20% = 70,000
 *   Template style: the 70,000 royalty gives 25% = 17,500 to the original creator, out of it: 52,500 and 17,500 (sum 70,000)
 */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2036-04-02T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";

describe("ZZ5: client wishes drawn from a plan or a pack earn the creator of their Premium style", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let royalties: RoyaltiesService;
  const staff: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    royalties = t.app.get(RoyaltiesService);
    // Invoices are not this spec's subject, and their numbers come from one counter every spec shares (a spec that checks the numbers in a row
    // would see this spec's): the plan and pack handlers are run with the invoice left out.
    jest.spyOn(t.app.get(InvoicesService), "issue").mockResolvedValue(null);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    for (const name of ["financeA", "financeB"]) {
      const s = await makeStaff(db, ["finance"]);
      const token = `zz5-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: ["finance"] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const person = async (sides: ("business" | "creator")[] = []) => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `zz5-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", ...sides], lastSide: "person" } });
    const token = `zz5-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, token };
  };
  const owner = async () => {
    const w = await person(["business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Studio", since: NOW } });
    return { ...w, businessId };
  };
  const creator = async (over: { erased?: boolean } = {}) => {
    const w = await person(["creator"]);
    if (over.erased) await db.account.update({ where: { id: w.accountId }, data: { erasedAt: NOW } });
    const creatorId = ids.next();
    await db.creator.create({ data: { id: creatorId, accountId: w.accountId, name: "Ada" } });
    return { ...w, creatorId };
  };
  const style = async (level: string, creatorDoc: Record<string, string> | null, house = false) => {
    const slug = `zz5-${run}-${++seq}`;
    await db.style.create({ data: { id: ids.next(), slug, level, tier: level, name: slug, house, on: true, creator: (creatorDoc ?? undefined) as never } });
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
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return { id, reference, total };
  }
  /** A draft in the given style with words, ready for the maker's seal on the plan. */
  async function draft(token: string, styleSlug: string) {
    const r = await t.http().post("/v1/wishes").set(bearer(token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: styleSlug });
    expect(r.status).toBe(201);
    const s = await t.http().patch(`/v1/wishes/${r.body.id}`).set(bearer(token)).send({ version: r.body.version, content: { letter: { paras: ["Happy birthday."] } } });
    expect(s.status).toBe(200);
    return r.body.id as string;
  }
  const seal = async (token: string, id: string) => {
    const row = await db.wish.findUniqueOrThrow({ where: { id }, select: { version: true } });
    return t.http().post(`/v1/wishes/${id}/seal`).set(bearer(token)).send({ version: row.version, openNow: true, usePlan: true });
  };
  const sealNew = async (o: { token: string }, styleSlug: string) => {
    const id = await draft(o.token, styleSlug);
    const res = await seal(o.token, id);
    expect(res.status).toBe(200);
    return id;
  };
  const accrualsOf = (wishId: string) => db.royaltyAccrual.findMany({ where: { wishId }, orderBy: { id: "asc" } });
  const payableOf = async (creatorId: string) => {
    const e = await db.ledgerEntry.findMany({ where: { account: "royalties_payable", memo: { contains: creatorId } } });
    return e.reduce((n, x) => n + (x.direction === "credit" ? x.amountKobo : -x.amountKobo), 0n);
  };
  const balanced = async (paymentId: string) => {
    const e = await db.ledgerEntry.findMany({ where: { paymentId } });
    const by = new Map<string, bigint>();
    for (const x of e) by.set(x.journalId, (by.get(x.journalId) ?? 0n) + (x.direction === "debit" ? x.amountKobo : -x.amountKobo));
    return [...by.values()].every((v) => v === 0n);
  };
  const hook = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const refund = async (p: { id: string; reference: string; total: bigint }) => {
    const s = await t.http().post("/v1/admin/refunds").set(bearer(staff.financeA.token)).send({ paymentId: p.id, reason: REASON, amountKobo: Number(p.total) });
    expect(s.status).toBe(201);
    expect((await t.http().post(`/v1/admin/refunds/${s.body.id}/approve-refund`).set(bearer(staff.financeB.token)).send({ reason: REASON })).status).toBe(200);
    expect((await hook("refund.processed", { id: 9100 + ++seq, transaction_reference: p.reference, amount: Number(p.total), status: "processed" })).status).toBe(200);
  };

  it("the seeded price book gives the figures worked by hand (Starter 3,500,000 for 10, Studio 10,500,000 for 35, pack 1,750,000 for 5)", async () => {
    const price = async (sku: string) => (await db.price.findFirstOrThrow({ where: { sku, version: 1 } })).promoKobo;
    expect(await price("pro.starter")).toBe(3_500_000n);
    expect(await price("pro.studio")).toBe(10_500_000n);
    expect(await price("pro.pack")).toBe(1_750_000n);
  });

  it("Starter at 40% off: 3,500,000 / 10 = 350,000 a wish, 20% = 70,000 (T-66), written at the seal, with a balanced journal", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const p = await pay(o, "pro.starter");
    const wish = await sealNew(o, s);
    const rows = await accrualsOf(wish);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creatorId: c.creatorId, basis: "pro_wish", paymentId: p.id, styleSlug: s, month: "2036-04", amountKobo: 70_000n });
    expect(await payableOf(c.creatorId)).toBe(70_000n);
    expect(await balanced(p.id)).toBe(true);
    const sum = await royalties.summary(c.creatorId);
    expect(sum).toMatchObject({ thisMonthKobo: 70_000, waitingKobo: 70_000, byStyle: [{ styleSlug: s, amountKobo: 70_000 }] });
    const e = await db.ledgerEntry.findMany({ where: { paymentId: p.id, memo: { contains: c.creatorId } } });
    expect(e.map((x) => `${x.account}:${x.direction}:${x.amountKobo}`).sort()).toEqual(["revenue_pro:debit:70000", "royalties_payable:credit:70000"]);
  });

  it("Studio: 10,500,000 / 35 = 300,000 a wish, 20% = 60,000", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    await pay(o, "pro.studio");
    expect((await accrualsOf(await sealNew(o, s)))[0].amountKobo).toBe(60_000n);
  });

  it("a pack: 1,750,000 / 5 = 350,000 a wish, 20% = 70,000; a second pack's wishes follow the first's five (oldest first)", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const first = await pay(o, "pro.pack");
    const second = await pay(o, "pro.pack");
    const made: string[] = [];
    for (let i = 0; i < 6; i++) made.push(await sealNew(o, s));
    const paymentOf = async (w: string) => (await accrualsOf(w))[0];
    for (let i = 0; i < 5; i++) expect(await paymentOf(made[i])).toMatchObject({ paymentId: first.id, amountKobo: 70_000n });
    expect(await paymentOf(made[5])).toMatchObject({ paymentId: second.id, amountKobo: 70_000n });
  });

  it("a rolled-over wish uses the month it came from: April's Starter (70,000), then this month's Studio (60,000)", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const starter = await pay(o, "pro.starter"); // April: 10 wishes, none used, so 10 roll into May
    t.clock.set(new Date("2036-05-01T09:00:00.000Z"));
    const studio = await pay(o, "pro.studio"); // May: allowance 35, the 10 rolled stay
    expect(await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).toMatchObject({ allowance: 35, rolled: 10, used: 0, month: "2036-05" });
    await db.business.update({ where: { id: o.businessId }, data: { used: 9 } }); // nine rolled wishes already counted: the next is the tenth rolled one
    const tenth = await accrualsOf(await sealNew(o, s));
    expect(tenth[0]).toMatchObject({ paymentId: starter.id, amountKobo: 70_000n, month: "2036-05" });
    const eleventh = await accrualsOf(await sealNew(o, s));
    expect(eleventh[0]).toMatchObject({ paymentId: studio.id, amountKobo: 60_000n });
  });

  it("a style built on a template gives a quarter of the royalty to the original creator, out of it: 52,500 and 17,500", async () => {
    const maker = await creator();
    const original = await creator();
    const s = await style("premium", { creatorId: maker.creatorId, templateCreatorId: original.creatorId });
    const o = await owner();
    const p = await pay(o, "pro.starter");
    const rows = await accrualsOf(await sealNew(o, s));
    expect(rows.map((r) => [r.creatorId === maker.creatorId ? "maker" : "original", r.basis, r.amountKobo])).toEqual(
      expect.arrayContaining([["maker", "pro_wish", 52_500n], ["original", "template_share", 17_500n]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows.reduce((n, r) => n + r.amountKobo, 0n)).toBe(70_000n);
    expect(await balanced(p.id)).toBe(true);
  });

  it("nothing for a Standard or Starter style, a house style, a style with no creator, an erased creator; a banned creator still accrues (ZZ3: the payout waits)", async () => {
    const c = await creator();
    const gone = await creator({ erased: true });
    const o = await owner();
    await pay(o, "pro.studio");
    for (const slug of [
      await style("standard", { creatorId: c.creatorId }),
      await style("starter", { creatorId: c.creatorId }),
      await style("premium", { creatorId: c.creatorId }, true),
      await style("premium", null),
      await style("premium", { creatorId: gone.creatorId }),
    ]) {
      expect(await accrualsOf(await sealNew(o, slug))).toHaveLength(0);
    }
    expect(await db.royaltyAccrual.count({ where: { creatorId: { in: [c.creatorId, gone.creatorId] } } })).toBe(0);
    const banned = await creator();
    await db.ban.create({ data: { id: ids.next(), accountId: banned.accountId, scope: "account", reason: "test", by: "staff", createdAt: NOW } });
    const sb = await style("premium", { creatorId: banned.creatorId });
    expect((await accrualsOf(await sealNew(o, sb)))[0].amountKobo).toBe(60_000n);
  });

  it("the style on the wish when it is SEALED counts: a draft that changes from Standard to Premium earns; one that changes back earns nothing", async () => {
    const c = await creator();
    const premium = await style("premium", { creatorId: c.creatorId });
    const plain = await style("standard", null);
    const o = await owner();
    await pay(o, "pro.studio");
    const a = await draft(o.token, plain);
    const wa = await db.wish.findUniqueOrThrow({ where: { id: a } });
    expect((await t.http().patch(`/v1/wishes/${a}`).set(bearer(o.token)).send({ version: wa.version, style: premium })).status).toBe(200);
    expect((await seal(o.token, a)).status).toBe(200);
    expect(await accrualsOf(a)).toHaveLength(1);
    const b = await draft(o.token, premium);
    const wb = await db.wish.findUniqueOrThrow({ where: { id: b } });
    expect((await t.http().patch(`/v1/wishes/${b}`).set(bearer(o.token)).send({ version: wb.version, style: plain })).status).toBe(200);
    expect((await seal(o.token, b)).status).toBe(200);
    expect(await accrualsOf(b)).toHaveLength(0);
  });

  it("replay of the same draw: the accrual is called again (and again at once) and nothing more is written", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const p = await pay(o, "pro.studio");
    const wish = await sealNew(o, s);
    const entries = await db.ledgerEntry.count({ where: { paymentId: p.id } });
    const again = () => db.$transaction((tx) => royalties.accrueForDraw(tx, { businessId: o.businessId, from: "month", wishId: wish, styleSlug: s }));
    const out = await Promise.all([again(), again(), again()]);
    expect(out.flat()).toHaveLength(0);
    expect(await accrualsOf(wish)).toHaveLength(1);
    expect(await db.ledgerEntry.count({ where: { paymentId: p.id } })).toBe(entries);
  });

  it("20 draws at once for one creator: 20 accruals of 60,000, one per wish, and the creator's summary equals the ledger", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const p = await pay(o, "pro.studio");
    const drafts = await Promise.all(Array.from({ length: 20 }, () => draft(o.token, s)));
    const res = await Promise.all(drafts.map((id) => seal(o.token, id)));
    expect(res.map((r) => r.status)).toEqual(Array(20).fill(200));
    const rows = await db.royaltyAccrual.findMany({ where: { creatorId: c.creatorId } });
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((r) => r.wishId)).size).toBe(20);
    expect(rows.every((r) => r.amountKobo === 60_000n && r.paymentId === p.id)).toBe(true);
    expect(await payableOf(c.creatorId)).toBe(1_200_000n);
    const sum = await royalties.summary(c.creatorId);
    expect(BigInt(sum.waitingKobo + sum.sendingKobo + sum.paidKobo)).toBe(await payableOf(c.creatorId));
    expect(sum.thisMonthKobo).toBe(1_200_000);
    expect(await balanced(p.id)).toBe(true);
  }, 30_000);

  it("a refund of the plan after 3 of 10 wishes were drawn takes back exactly those 3 (once); a second delivery changes nothing", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const p = await pay(o, "pro.starter");
    const wishes = [await sealNew(o, s), await sealNew(o, s), await sealNew(o, s)];
    expect(await payableOf(c.creatorId)).toBe(210_000n);
    await refund(p);
    const rev = await db.$queryRaw<{ amountKobo: bigint; accrualId: string }[]>`SELECT "amountKobo", "accrualId"::text AS "accrualId" FROM royalty_reversal WHERE "paymentId" = ${p.id}::uuid`;
    expect(rev).toHaveLength(3);
    expect(rev.every((r) => r.amountKobo === -70_000n)).toBe(true);
    const accrued = await db.royaltyAccrual.findMany({ where: { wishId: { in: wishes } } });
    expect(new Set(rev.map((r) => r.accrualId))).toEqual(new Set(accrued.map((a) => a.id)));
    expect(await payableOf(c.creatorId)).toBe(0n);
    expect(await balanced(p.id)).toBe(true);
    const all = await db.ledgerEntry.findMany({ where: { paymentId: p.id } });
    const net = (account: string) => all.filter((e) => e.account === account).reduce((n, e) => n + (e.direction === "debit" ? e.amountKobo : -e.amountKobo), 0n);
    expect(net("revenue_pro")).toBe(0n);
    expect(net("royalties_payable")).toBe(0n);
    expect(await royalties.balance(db, c.creatorId, null)).toBe(0n);
    // the plan is gone: a new wish cannot be drawn, so nothing more can accrue from this payment
    const next = await draft(o.token, s);
    expect((await seal(o.token, next)).status).toBe(402);
    await db.$transaction((tx) => royalties.reverse(tx, p.id));
    expect(await db.royaltyReversal.count({ where: { paymentId: p.id } })).toBe(3);
  });

  it("a refund after the royalty was paid out: the balance goes below zero (ZZ6) and the next payout pays less", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const p = await pay(o, "pro.pack");
    await sealNew(o, s);
    await sealNew(o, s);
    const bankId = ids.next();
    await db.bankAccount.create({ data: { id: bankId, creatorId: c.creatorId, accountNumber: "0123456789", bankCode: "058" } });
    await db.payout.create({ data: { id: ids.next(), creatorId: c.creatorId, month: "2036-04", amountKobo: 140_000n, status: "succeeded", bankAccountId: bankId, createdAt: NOW } });
    expect(await royalties.balance(db, c.creatorId, null)).toBe(0n);
    await refund(p);
    expect(await royalties.balance(db, c.creatorId, null)).toBe(-140_000n);
    const sum = await royalties.summary(c.creatorId);
    expect(sum).toMatchObject({ paidKobo: 140_000, waitingKobo: -140_000 });
  });

  it("a refund of the second pack takes back only the wishes drawn from it", async () => {
    const c = await creator();
    const s = await style("premium", { creatorId: c.creatorId });
    const o = await owner();
    const first = await pay(o, "pro.pack");
    const second = await pay(o, "pro.pack");
    for (let i = 0; i < 6; i++) await sealNew(o, s);
    await refund(second);
    expect(await db.royaltyReversal.count({ where: { paymentId: second.id } })).toBe(1);
    expect(await db.royaltyReversal.count({ where: { paymentId: first.id } })).toBe(0);
    expect(await payableOf(c.creatorId)).toBe(5n * 70_000n);
  });
});
