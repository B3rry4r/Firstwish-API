import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { SettlementService } from "../settlement.service";
import { testWishNo } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2033-03-10T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** API-BASE-7 case 1 (HW1, R11): one receipt email per settled payment, and a notice for a refund. */
describe("HW1 receipts", () => {
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
    for (const [name, roles] of [["finance", ["finance"]], ["finance2", ["finance"]], ["ops", ["ops"]]] as const) {
      const s = await makeStaff(db, [...roles]);
      const token = `ab7r-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [...roles] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const account = async () => {
    const id = ids.next();
    const contact = `ab7r-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id, contact, name: "Ada", sides: ["person"], lastSide: "person" } });
    return { id, contact };
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ...over } as never });
    return id;
  };
  /** A pending payment as the start stores it (the lines are what the buyer was charged). */
  async function pending(who: { accountId?: string; payerContact?: string; businessId?: string }, lines: { sku: string; qty?: number }[], request: Record<string, unknown> = {}, purpose = "ticket") {
    const id = ids.next();
    let total = 0n;
    const stored = [];
    let version = 1;
    for (const l of lines) {
      const book = await db.price.findFirstOrThrow({ where: { sku: l.sku }, orderBy: { version: "desc" } });
      version = book.version;
      const unit = book.promoKobo ?? book.listKobo;
      const qty = l.qty ?? 1;
      total += unit * BigInt(qty);
      stored.push({ sku: l.sku, name: `Line ${l.sku}`, qty, unitKobo: Number(unit), totalKobo: Number(unit * BigInt(qty)) });
    }
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: who.accountId ?? null, businessId: who.businessId ?? null, payerContact: who.payerContact ?? null, purpose: purpose as never, subjectId: (request.subjectId as string) ?? null,
        lines: stored, amountKobo: total, currency: "NGN", priceBookVersion: version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `ab7r:${id}`, channel: "card", options: { request: { purpose, ...request }, server: { fingerprint: id } },
      },
    });
    return { id, reference, total };
  }
  const answer = (p: { reference: string; total: bigint }) => ({ reference: p.reference, status: "success" as const, amountKobo: p.total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n });
  const mailTo = (to: string, template = "receipt") => t.email.sent.filter((e) => e.to === to && e.template === template);
  const hook = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const charge = (p: { reference: string; total: bigint }, id: number) => hook("charge.success", { id, reference: p.reference, amount: Number(p.total), currency: "NGN", channel: "card", fees: 150, paid_at: NOW.toISOString() });

  it("a settled ticket sends one receipt to the account's email: what was paid for, the amount, the VAT part, the reference", async () => {
    const a = await account();
    const w = await wish(a.id);
    const p = await pending({ accountId: a.id }, [{ sku: "ticket.keepsake" }], { subjectId: w });
    expect((await settle.settle(answer(p))).outcome).toBe("fulfilled");
    const mail = mailTo(a.contact);
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe("Your Firstwish receipt");
    expect(mail[0].text).toContain("Hi Ada");
    expect(mail[0].text).toContain("Line ticket.keepsake");
    expect(mail[0].text).toContain(p.reference);
    expect(mail[0].text).toMatch(/Thank you\. We received your payment of NGN [\d,]+\.\d\d\./);
    const vat = (await db.ledgerEntry.findMany({ where: { paymentId: p.id, account: "vat_payable" } })).reduce((n, r) => n + r.amountKobo, 0n);
    if (vat > 0n) expect(mail[0].text).toContain("VAT included in this amount: NGN");
    else expect(mail[0].text).not.toContain("VAT");
    expect(await db.messageDelivery.findFirstOrThrow({ where: { idempotencyKey: `receipt:${p.id}` } })).toMatchObject({ templateKey: "receipt", purpose: "receipt", status: "delivered" });
  });

  it("every kind of line sends its receipt: extra, keep, wake, plan, pack, Vault space, Concierge, credits and the creator plan", async () => {
    const a = await account();
    const draft = await wish(a.id);
    const live = await wish(a.id, { status: "live", ticket: "keepsake", no: testWishNo("77"), opensAt: new Date(NOW.getTime() - 86_400_000), openedAt: new Date(NOW.getTime() - 86_400_000), endsAt: new Date(NOW.getTime() + 5 * 86_400_000) });
    const resting = await wish(a.id, { status: "resting", ticket: "keepsake", no: testWishNo("78"), opensAt: new Date(NOW.getTime() - 9 * 86_400_000), openedAt: new Date(NOW.getTime() - 9 * 86_400_000), endsAt: new Date(NOW.getTime() - 86_400_000), restingSince: new Date(NOW.getTime() - 86_400_000), eraseAfter: new Date(NOW.getTime() + 300 * 86_400_000) });
    const bid = ids.next();
    await db.business.create({ data: { id: bid, accountId: a.id, name: "Studio", business: "Studio", since: NOW } });
    const cases: { sku: string; purpose: string; request: Record<string, unknown>; business?: boolean }[] = [
      { sku: "extra.five-photos", purpose: "extra", request: { subjectId: draft } },
      { sku: "keep.month", purpose: "keep", request: { subjectId: live, keepKey: "month" } },
      { sku: "keep.month", purpose: "keep", request: { subjectId: resting, keepKey: "month", way: "wake" } },
      { sku: "pro.starter", purpose: "pro_plan", request: { plan: "starter" }, business: true },
      { sku: "pro.pack", purpose: "wish_pack", request: { packs: 1 }, business: true },
      { sku: "vault.block", purpose: "vault_space", request: {}, business: true },
      { sku: "concierge.single", purpose: "concierge", request: { subjectId: ids.next() } },
      { sku: "creator.credit-pack", purpose: "credit_pack", request: {} },
      { sku: "creator.plan", purpose: "creator_plan", request: {} },
    ];
    const before = mailTo(a.contact).length;
    let n = 0;
    for (const c of cases) {
      const p = await pending({ accountId: a.id, ...(c.business ? { businessId: bid } : {}) }, [{ sku: c.sku }], c.request, c.purpose);
      const out = (await settle.settle(answer(p))).outcome;
      expect([c.sku, out]).toEqual([c.sku, "fulfilled"]);
      n += 1;
      expect(mailTo(a.contact).length).toBe(before + n);
      expect(mailTo(a.contact).at(-1)?.text).toContain(`Line ${c.sku}`);
    }
  });

  it("a link holder's payment sends the receipt to the payer's email kept on the payment, with no account made", async () => {
    const owner = await account();
    const w = await wish(owner.id, { status: "live", ticket: "keepsake", no: testWishNo("79"), opensAt: new Date(NOW.getTime() - 86_400_000), openedAt: new Date(NOW.getTime() - 86_400_000), endsAt: new Date(NOW.getTime() + 5 * 86_400_000) });
    const payer = `ab7r-payer-${run}@example.com`;
    const p = await pending({ payerContact: payer }, [{ sku: "keep.month" }], { subjectId: w, keepKey: "month" }, "keep");
    expect((await settle.settle(answer(p))).outcome).toBe("fulfilled");
    const mail = mailTo(payer);
    expect(mail).toHaveLength(1);
    expect(mail[0].text).toContain("Hi there");
    expect(await db.account.count({ where: { contact: payer } })).toBe(0);
    expect(mailTo(owner.contact)).toHaveLength(0);
  });

  it("a replayed webhook, a second settle and a retried settle send no second receipt", async () => {
    const a = await account();
    const w = await wish(a.id);
    const p = await pending({ accountId: a.id }, [{ sku: "ticket.keepsake" }], { subjectId: w });
    const ev = 880_000 + ++seq;
    expect((await charge(p, ev)).status).toBe(200);
    expect((await charge(p, ev)).status).toBe(200);
    expect((await charge(p, ev + 1)).status).toBe(200);
    expect((await settle.settle(answer(p))).outcome).toBe("already");
    expect((await settle.settle(answer(p))).outcome).toBe("already");
    expect(mailTo(a.contact)).toHaveLength(1);
    expect(await db.messageDelivery.count({ where: { idempotencyKey: `receipt:${p.id}` } })).toBe(1);
    // a failed settle (the provider says it failed) sends none
    const f = await pending({ accountId: a.id }, [{ sku: "creator.signed" }], {}, "signed");
    expect((await settle.settle({ ...answer(f), status: "failed" })).outcome).toBe("failed");
    expect(mailTo(a.contact)).toHaveLength(1);
  });

  it("a refund sends its notice once, to the account or to the link payer", async () => {
    const a = await account();
    const w = await wish(a.id);
    const p = await pending({ accountId: a.id }, [{ sku: "ticket.keepsake" }], { subjectId: w });
    await settle.settle(answer(p));
    const s = await t.http().post("/v1/admin/refunds").set(auth(staff.finance.token)).send({ paymentId: p.id, amountKobo: Number(p.total), reason: "Customer asked, checked" });
    expect(s.status).toBe(201);
    expect((await t.http().post(`/v1/admin/refunds/${s.body.id}/approve-refund`).set(auth(staff.finance2.token)).send({ reason: "Customer asked, checked" })).status).toBe(200);
    const ev = 890_000 + ++seq;
    const body = { id: ev, transaction_reference: p.reference, amount: Number(p.total), status: "processed" };
    expect((await hook("refund.processed", body)).status).toBe(200);
    expect((await hook("refund.processed", body)).status).toBe(200);
    const mail = mailTo(a.contact, "refund");
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe("Your Firstwish refund");
    expect(mail[0].text).toContain(p.reference);
    // the link payer's refund goes to the payment's own email
    const owner = await account();
    const live = await wish(owner.id, { status: "live", ticket: "keepsake", no: testWishNo("80"), opensAt: new Date(NOW.getTime() - 86_400_000), openedAt: new Date(NOW.getTime() - 86_400_000), endsAt: new Date(NOW.getTime() + 5 * 86_400_000) });
    const payer = `ab7r-refund-${run}@example.com`;
    const q = await pending({ payerContact: payer }, [{ sku: "keep.month" }], { subjectId: live, keepKey: "month" }, "keep");
    await settle.settle(answer(q));
    const s2 = await t.http().post("/v1/admin/refunds").set(auth(staff.finance.token)).send({ paymentId: q.id, amountKobo: Number(q.total), reason: "Customer asked, checked" });
    await t.http().post(`/v1/admin/refunds/${s2.body.id}/approve-refund`).set(auth(staff.finance2.token)).send({ reason: "Customer asked, checked" });
    expect((await hook("refund.processed", { id: ev + 1, transaction_reference: q.reference, amount: Number(q.total), status: "processed" })).status).toBe(200);
    expect(mailTo(payer, "refund")).toHaveLength(1);
  });

  it("the stand-in outbox shows the receipts and the staff Messages read lists the receipt and refund templates", async () => {
    expect(t.email.sent.filter((e) => e.template === "receipt").length).toBeGreaterThan(0);
    const r = await t.http().get("/v1/admin/messages/templates?limit=50").set(auth(staff.ops.token));
    expect(r.status).toBe(200);
    const keys = (r.body.items as { key: string }[]).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["receipt", "refund"]));
  });
});
