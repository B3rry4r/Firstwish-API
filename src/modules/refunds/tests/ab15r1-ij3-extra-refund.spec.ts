import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { RUN, testSlug } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-05-10T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";
const EXTRA = "extra.premium-style";

/** API-BASE-15 round 1, H1 (IJ3): the premium-style extra is not refunded on its own while the wish holds a style that needs it (sealed or not). */
describe("API-BASE-15 round 1 H1 (IJ3): refunding the premium-style extra on its own", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  const staff: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    for (const name of ["financeA", "financeB"]) {
      const s = await makeStaff(db, ["finance"]);
      const token = `ab15r1-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: ["finance"] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  type U = { id: string; token: string };
  const person = async (): Promise<U> => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab15r1-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab15r1u-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  };
  const creatorStyle = async (level: string) => {
    const slug = testSlug("cs");
    await db.style.create({ data: { id: ids.next(), slug, name: `Studio ${slug}`, on: true, level, kinds: ["love"], house: false, creator: { handle: "ada", name: "Ada" }, by: "Ada" } as never });
    return slug;
  };
  /** A Keepsake wish on a Standard style, as the person holds it before buying the extra. */
  const keepsake = async (u: U) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: u.id, status: "draft", kind: "love", occasion: "birthday", styleSlug: "status", styleTakenLevel: "standard", ticket: "keepsake", timeZone: "Africa/Lagos", name: "Ada", content: { letter: { paras: ["Happy birthday."] } } } as never });
    return id;
  };
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const patch = async (u: U, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(auth(u.token)).send({ version: (await row(id)).version, ...body });
  const seal = async (u: U, id: string) => t.http().post(`/v1/wishes/${id}/seal`).set(auth(u.token)).send({ version: (await row(id)).version, openNow: true });
  /** The extra's payment, settled through the one settle path. */
  const payExtra = async (u: U, wishId: string) => {
    const book = await db.price.findFirstOrThrow({ where: { sku: EXTRA }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: u.id, payerContact: null, purpose: "extra", subjectId: wishId,
        lines: [{ sku: EXTRA, name: EXTRA, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${u.id}:${id}`, channel: "card",
        options: { request: { purpose: "extra", subjectId: wishId }, server: { fingerprint: id } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n });
    expect(out.outcome).toBe("fulfilled");
    return { id, reference, total };
  };
  const startRefund = (paymentId: string, total: bigint) => t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId, reason: REASON, amountKobo: Number(total) });
  const approve = (id: string) => t.http().post(`/v1/admin/refunds/${id}/approve-refund`).set(auth(staff.financeB.token)).send({ reason: REASON });
  let evSeq = 8_100_000;
  const processed = (reference: string, total: bigint) => {
    const body = JSON.stringify({ event: "refund.processed", data: { id: ++evSeq, transaction_reference: reference, amount: Number(total), status: "processed" } });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const counts = async (paymentId: string) => ({ refunds: await db.refund.count({ where: { paymentId } }), ledger: await db.ledgerEntry.count({ where: { paymentId } }) });

  for (const origin of ["house", "creator"] as const) {
    it(`${origin} premium style: refused while held (before seal), refunded once the wish holds an allowed style, ledger right, nothing refunded twice`, async () => {
      const u = await person();
      const premium = origin === "house" ? "reel" : await creatorStyle("premium");
      const w = await keepsake(u);
      const x = await payExtra(u, w);
      expect((await patch(u, w, { style: premium })).status).toBe(200);
      expect(await row(w)).toMatchObject({ adds: [EXTRA], styleSlug: premium, styleTakenLevel: "premium" });
      // refused in words, before any refund row or ledger entry exists
      const before = await counts(x.id);
      const no = await startRefund(x.id, x.total);
      expect(no.status).toBe(409);
      expect(no.body.error.code).toBe("extra_needed_by_style");
      expect(no.body.error.message).toMatch(/cannot be refunded on its own while the wish holds a style that needs it/);
      expect(no.body.error.message).toMatch(/Change the wish to a style its ticket allows first/);
      expect(await counts(x.id)).toEqual(before);
      expect((await db.payment.findUniqueOrThrow({ where: { id: x.id } })).status).toBe("succeeded");
      expect((await row(w)).adds).toEqual([EXTRA]);
      // the person changes to a style the Keepsake allows by itself: now it can be refunded
      expect((await patch(u, w, { style: "status" })).status).toBe(200);
      const s = await startRefund(x.id, x.total);
      expect(s.status).toBe(201);
      expect((await approve(s.body.id)).status).toBe(200);
      expect((await processed(x.reference, x.total)).status).toBe(200);
      expect(await row(w)).toMatchObject({ adds: [], styleSlug: "status", ticket: "keepsake" });
      expect((await db.payment.findUniqueOrThrow({ where: { id: x.id } })).status).toBe("refunded");
      expect((await db.purchaseGrant.findFirstOrThrow({ where: { paymentId: x.id } })).revokedAt).not.toBeNull();
      const all = await db.ledgerEntry.findMany({ where: { paymentId: x.id } });
      const net = all.reduce((n, e) => n + (e.direction === "debit" ? e.amountKobo : -e.amountKobo), 0n);
      expect(net).toBe(0n);
      // nothing is refunded twice: the same event, and a second start
      const done = await counts(x.id);
      expect((await processed(x.reference, x.total)).status).toBe(200);
      expect(await counts(x.id)).toEqual(done);
      expect((await startRefund(x.id, x.total)).status).toBe(409);
      expect(await counts(x.id)).toEqual(done);
      expect((await row(w)).adds).toEqual([]);
    });

    it(`${origin} premium style: after the seal the refund is refused in words and the wish keeps the look and the extra`, async () => {
      const u = await person();
      const premium = origin === "house" ? "reel" : await creatorStyle("premium");
      const w = await keepsake(u);
      const x = await payExtra(u, w);
      expect((await patch(u, w, { style: premium })).status).toBe(200);
      expect((await seal(u, w)).status).toBe(200);
      const before = await counts(x.id);
      const no = await startRefund(x.id, x.total);
      expect(no.status).toBe(409);
      expect(no.body.error.code).toBe("extra_needed_by_style");
      expect(no.body.error.message).toMatch(/sealed, so its look is the customer's and the extra stays paid/);
      expect(await counts(x.id)).toEqual(before);
      expect(await row(w)).toMatchObject({ status: "sealed", adds: [EXTRA], styleSlug: premium });
    });
  }

  it("a sealed wish on a style its ticket allows by itself: the extra can be refunded", async () => {
    const u = await person();
    const w = await keepsake(u);
    const x = await payExtra(u, w);
    expect((await seal(u, w)).status).toBe(200);
    const s = await startRefund(x.id, x.total);
    expect(s.status).toBe(201);
    expect((await approve(s.body.id)).status).toBe(200);
    expect((await processed(x.reference, x.total)).status).toBe(200);
    expect(await row(w)).toMatchObject({ status: "sealed", adds: [], styleSlug: "status" });
  });

  it("a refund asked for while the style was allowed, then the style changed: the send is refused; if the provider's money went back anyway the extra stays and the note says so", async () => {
    const u = await person();
    const w = await keepsake(u);
    const x = await payExtra(u, w);
    const s = await startRefund(x.id, x.total);
    expect(s.status).toBe(201);
    expect((await patch(u, w, { style: "reel" })).status).toBe(200);
    const no = await approve(s.body.id);
    expect(no.status).toBe(409);
    expect(no.body.error.code).toBe("extra_needed_by_style");
    expect((await db.refund.findUniqueOrThrow({ where: { id: s.body.id } })).status).toBe("requested");
    // the money went back at the provider (the refund was sent before the style changed): the ledger and the payment follow, the extra stays
    await db.refund.update({ where: { id: s.body.id }, data: { status: "sent" } });
    expect((await processed(x.reference, x.total)).status).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: x.id } })).status).toBe("refunded");
    expect(await row(w)).toMatchObject({ adds: [EXTRA], styleSlug: "reel" });
    expect((await db.purchaseGrant.findFirstOrThrow({ where: { paymentId: x.id } })).revokedAt).toBeNull();
    expect((await db.refund.findUniqueOrThrow({ where: { id: s.body.id } })).note).toMatch(/kept_style_needs_extra/);
  });

  it("a whole-purchase refund (ticket and extra in one payment) follows the whole-refund rules as before", async () => {
    const u = await person();
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: u.id, status: "draft", kind: "love", occasion: "birthday", styleSlug: "status", styleTakenLevel: "standard", timeZone: "Africa/Lagos", name: "Ada" } as never });
    const tk = await db.price.findFirstOrThrow({ where: { sku: "ticket.keepsake" }, orderBy: { version: "desc" } });
    const ex = await db.price.findFirstOrThrow({ where: { sku: EXTRA }, orderBy: { version: "desc" } });
    const lines = [tk, ex].map((p) => ({ sku: p.sku, name: p.sku, qty: 1, unitKobo: Number(p.promoKobo ?? p.listKobo), totalKobo: Number(p.promoKobo ?? p.listKobo) }));
    const total = BigInt(lines.reduce((n, l) => n + l.totalKobo, 0));
    const pid = ids.next();
    const reference = `fw-${pid}`;
    await db.payment.create({
      data: {
        id: pid, accountId: u.id, payerContact: null, purpose: "ticket", subjectId: id, lines, amountKobo: total, currency: "NGN", priceBookVersion: tk.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${u.id}:${pid}`, channel: "card",
        options: { request: { purpose: "ticket", subjectId: id }, server: { fingerprint: pid } },
      },
    });
    expect((await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n })).outcome).toBe("fulfilled");
    expect(await row(id)).toMatchObject({ ticket: "keepsake", adds: [EXTRA] });
    expect((await patch(u, id, { style: "reel" })).status).toBe(200);
    const s = await startRefund(pid, total);
    expect(s.status).toBe(201);
    expect((await approve(s.body.id)).status).toBe(200);
    expect((await processed(reference, total)).status).toBe(200);
    expect(await row(id)).toMatchObject({ ticket: null, adds: [] });
    expect((await db.payment.findUniqueOrThrow({ where: { id: pid } })).status).toBe("refunded");
  });
});
