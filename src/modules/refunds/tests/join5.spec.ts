import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { REFERENCE_PREFIX } from "../../payouts/payout-run.service";
import { PriceBookService } from "../../price-book/price-book.service";
import { percentOf } from "../../royalties/royalty-math";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { flagRefundDue } from "../refund-due";
import { RefundProviderPort } from "../../../common/ports/refund-provider.port";
import { StandinRefundProvider } from "../../../common/ports/adapters/standin-refund-provider";
import { RUN } from "../../../../test/kit/unique";

/* Wave 5 join: J1 (WW1) transfer events through the webhook, J2 (WW2) royalties in the settle and the refund, J3 (YY4) the one flag,
   J4 the Signed grant's end and a payout paid by hand (ZZ8), J5 (CA3) a business's creator plan invoice. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-03-10T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";
const tag = `j5r${RUN}`;

describe("wave 5 join: money (J1 to J5)", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let provider: StandinRefundProvider;
  const staff: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    provider = t.app.get<RefundProviderPort, StandinRefundProvider>(RefundProviderPort);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    for (const [name, roles] of [["financeA", ["finance"]], ["financeB", ["finance"]]] as const) {
      const s = await makeStaff(db, [...roles]);
      const token = `j5r-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [...roles] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(() => t.close());
  beforeEach(() => {
    t.clock.set(NOW);
    provider.refusing(null);
  });

  const account = async (sides: ("person" | "creator")[] = ["person"]) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `${tag}-${++seq}@example.com`, name: "Ada", sides, lastSide: sides[0] } });
    return id;
  };
  const creator = async () => {
    const accountId = await account(["person", "creator"]);
    const creatorId = ids.next();
    await db.creator.create({ data: { id: creatorId, accountId, name: "Ada" } });
    return { accountId, creatorId };
  };
  const style = async (slug: string, level: string, creatorId: string | null) => {
    const s = `${tag}-${slug}`;
    await db.style.create({ data: { id: ids.next(), slug: s, level, tier: level, name: slug, house: false, on: true, creator: (creatorId ? { creatorId } : undefined) as never } });
    return s;
  };
  const wish = async (accountId: string, styleSlug: string, adds: string[] = []) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug, timeZone: "Africa/Lagos", adds } as never });
    return id;
  };
  /** A payment as the start would store it, then the provider's good answer through the one settle path. */
  async function pay(accountId: string, sku: string, request: Record<string, unknown> = {}, businessId: string | null = null) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId, businessId, payerContact: null, purpose: "ticket", subjectId: (request.subjectId as string) ?? null,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x", ...request }, server: { fingerprint: id } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n });
    return { id, reference, total, outcome: out.outcome };
  }
  const hook = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const sentRefund = async (p: { id: string; total: bigint; reference: string }) => {
    const s = await t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId: p.id, reason: REASON, amountKobo: Number(p.total) });
    expect(s.status).toBe(201);
    expect((await t.http().post(`/v1/admin/refunds/${s.body.id}/approve-refund`).set(auth(staff.financeB.token)).send({ reason: REASON })).status).toBe(200);
  };
  /** 20% of the premium style's price in force at that payment (its own time and price-book version). */
  const premiumRoyalty = async (paymentId: string) => {
    const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const q = await t.app.get(PriceBookService).quote([{ sku: "extra.premium-style" }], p.createdAt, { version: p.priceBookVersion });
    return percentOf(BigInt(q.lines[0].unitKobo), 20);
  };
  const reversals = (col: "paymentId" | "creatorId", id: string) =>
    col === "paymentId"
      ? db.$queryRaw<{ amountKobo: bigint }[]>`SELECT "amountKobo" FROM royalty_reversal WHERE "paymentId" = ${id}::uuid`
      : db.$queryRaw<{ amountKobo: bigint }[]>`SELECT "amountKobo" FROM royalty_reversal WHERE "creatorId" = ${id}::uuid`;
  const accruals = (creatorId: string) => db.royaltyAccrual.findMany({ where: { creatorId } });
  const payableOf = async (creatorId: string) => {
    const e = await db.ledgerEntry.findMany({ where: { account: "royalties_payable", memo: { contains: creatorId } } });
    return e.reduce((n, x) => n + (x.direction === "credit" ? x.amountKobo : -x.amountKobo), 0n);
  };

  describe("J1 (WW1): transfer events through the signed webhook", () => {
    async function sentPayout(month: string, status: "sent" | "pending" = "sent") {
      const c = await creator();
      const bankId = ids.next();
      await db.bankAccount.create({ data: { id: bankId, creatorId: c.creatorId, accountNumber: "0123456789", bankCode: "058" } });
      const id = ids.next();
      const at = new Date(`${month}-28T10:00:00Z`);
      await db.$transaction(async (tx) => {
        await tx.payout.create({ data: { id, creatorId: c.creatorId, month, amountKobo: 600000n, status, bankAccountId: bankId, createdAt: at } });
        await tx.$executeRaw`INSERT INTO payout_detail ("payoutId", "sentAt") VALUES (${id}::uuid, ${status === "sent" ? at : null})`;
        const journalId = ids.next();
        await tx.ledgerEntry.createMany({ data: [
          { id: ids.next(), journalId, account: "royalties_payable", direction: "debit", amountKobo: 600000n, currency: "NGN", payoutId: id, memo: `Payout ${c.creatorId} ${month}`, createdAt: at },
          { id: ids.next(), journalId, account: "payouts", direction: "credit", amountKobo: 600000n, currency: "NGN", payoutId: id, memo: `Payout ${c.creatorId} ${month}`, createdAt: at },
        ] });
      });
      return { c, id };
    }
    const status = async (id: string) => (await db.payout.findUniqueOrThrow({ where: { id } })).status;

    it("a signed transfer.success marks the payout paid once; the same event again changes nothing; a bad signature changes nothing", async () => {
      const { id } = await sentPayout("2031-01");
      const data = { id: 880000 + ++seq, reference: REFERENCE_PREFIX + id, amount: 600000 };
      const bad = await t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", "00").send(JSON.stringify({ event: "transfer.success", data }));
      expect(bad.status).toBe(401);
      expect(await status(id)).toBe("sent");
      expect((await hook("transfer.success", data)).status).toBe(200);
      expect(await status(id)).toBe("succeeded");
      const paidAt = (await db.$queryRaw<{ paidAt: Date }[]>`SELECT "paidAt" FROM payout_detail WHERE "payoutId" = ${id}::uuid`)[0].paidAt;
      const entries = await db.ledgerEntry.count({ where: { payoutId: id } });
      t.clock.set(new Date(NOW.getTime() + 3_600_000));
      expect((await hook("transfer.success", data)).status).toBe(200);
      expect(await status(id)).toBe("succeeded");
      expect((await db.$queryRaw<{ paidAt: Date }[]>`SELECT "paidAt" FROM payout_detail WHERE "payoutId" = ${id}::uuid`)[0].paidAt).toEqual(paidAt);
      expect(await db.ledgerEntry.count({ where: { payoutId: id } })).toBe(entries);
      const ev = await db.webhookEvent.findMany({ where: { type: "transfer.success", payload: { path: ["data", "id"], equals: data.id } } });
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ outcome: "paid" });
    });

    it("a signed transfer.failed fails the payout and returns the balance once; a wrong amount changes nothing", async () => {
      const { id } = await sentPayout("2031-02");
      const wrong = { id: 880000 + ++seq, reference: REFERENCE_PREFIX + id, amount: 1 };
      expect((await hook("transfer.failed", wrong)).status).toBe(200);
      expect(await status(id)).toBe("sent");
      expect((await db.webhookEvent.findFirstOrThrow({ where: { type: "transfer.failed", payload: { path: ["data", "id"], equals: wrong.id } } })).outcome).toBe("amount_mismatch");
      const good = { id: 880000 + ++seq, reference: REFERENCE_PREFIX + id, amount: 600000 };
      expect((await hook("transfer.failed", good)).status).toBe(200);
      expect((await hook("transfer.failed", good)).status).toBe(200);
      expect(await status(id)).toBe("failed");
      expect(await db.ledgerEntry.count({ where: { payoutId: id } })).toBe(4);
    });
  });

  describe("J2 (WW2): royalties in the settle transaction and in the refund", () => {
    it("a person pays for a wish in a creator's Premium style: one accrual of 20% of the premium style price; the refund's event: one reversal, and nothing owed", async () => {
      const c = await creator();
      const premium = await style("prem", "premium", c.creatorId);
      const payer = await account();
      const w = await wish(payer, premium, ["extra.premium-style"]); // IJ2: a Keepsake takes a Premium style only with the premium-style extra
      const p = await pay(payer, "ticket.keepsake", { subjectId: w, options: { style: premium } });
      expect(p.outcome).toBe("fulfilled");
      const rows = await accruals(c.creatorId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ basis: "premium_style", paymentId: p.id, styleSlug: premium });
      expect(rows[0].amountKobo).toBe(await premiumRoyalty(p.id));
      expect(await payableOf(c.creatorId)).toBe(rows[0].amountKobo);
      // a replay of the same settle changes nothing
      await settle.settle({ reference: p.reference, status: "success", amountKobo: p.total, currency: "NGN", paidAt: NOW });
      expect(await accruals(c.creatorId)).toHaveLength(1);

      await sentRefund(p);
      const body = (id: number) => hook("refund.processed", { id, transaction_reference: p.reference, amount: Number(p.total), status: "processed" });
      expect((await body(7100 + ++seq)).status).toBe(200);
      expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("refunded");
      const rev = await reversals("paymentId", p.id);
      expect(rev).toHaveLength(1);
      expect(rev[0].amountKobo).toBe(-rows[0].amountKobo);
      expect(await payableOf(c.creatorId)).toBe(0n);
      // the refund's own reversal skips the royalty journal (RoyaltiesService.reverse took it back, once): the sale and the royalty each net to nothing
      const all = await db.ledgerEntry.findMany({ where: { paymentId: p.id } });
      const net = (account: string) => all.filter((e) => e.account === account).reduce((n, e) => n + (e.direction === "debit" ? e.amountKobo : -e.amountKobo), 0n);
      expect(net("revenue_tickets")).toBe(0n);
      expect(net("royalties_payable")).toBe(0n);
      expect(await reversals("paymentId", p.id)).toHaveLength(1);
      // the same event again changes nothing
      expect((await body(7100 + ++seq)).status).toBe(200);
      expect(await reversals("paymentId", p.id)).toHaveLength(1);
      expect(await payableOf(c.creatorId)).toBe(0n);
    });

    it("Join 5: a refund.processed that comes before the refund is recorded as sent is kept, and applied when the refund is sent", async () => {
      const c = await creator();
      const standard = await style("pend", "standard", c.creatorId);
      const payer = await account();
      const w = await wish(payer, standard);
      const p = await pay(payer, "ticket.keepsake", { subjectId: w, options: { style: standard } });
      expect(p.outcome).toBe("fulfilled");
      const started = await t.http().post("/v1/admin/refunds").set(auth(staff.financeA.token)).send({ paymentId: p.id, reason: REASON, amountKobo: Number(p.total) });
      expect(started.status).toBe(201);
      const eventId = 7300 + ++seq;
      // the provider's news comes while the refund is only asked for: nothing is matched, the event waits unprocessed
      expect((await hook("refund.processed", { id: eventId, transaction_reference: p.reference, amount: Number(p.total), status: "processed" })).status).toBe(200);
      const waiting = await db.webhookEvent.findFirstOrThrow({ where: { type: "refund.processed", payload: { path: ["data", "id"], equals: eventId } } });
      expect(waiting).toMatchObject({ processedAt: null, outcome: "unknown_refund" });
      expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).not.toBe("refunded");
      // the second staff member sends it: the waiting event is applied then, without a retry from the provider
      expect((await t.http().post(`/v1/admin/refunds/${started.body.id}/approve-refund`).set(auth(staff.financeB.token)).send({ reason: REASON })).status).toBe(200);
      expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("refunded");
      expect((await db.refund.findUniqueOrThrow({ where: { id: started.body.id } })).status).toBe("succeeded");
      expect((await db.webhookEvent.findUniqueOrThrow({ where: { id: waiting.id } })).processedAt).not.toBeNull();
      expect(await db.ledgerEntry.count({ where: { paymentId: p.id, refundId: started.body.id } })).toBeGreaterThan(0);
    });

    it("a Standard style earns nothing, and its refund makes no reversal", async () => {
      const c = await creator();
      const standard = await style("std", "standard", c.creatorId);
      const payer = await account();
      const w = await wish(payer, standard);
      const p = await pay(payer, "ticket.keepsake", { subjectId: w, options: { style: standard } });
      expect(p.outcome).toBe("fulfilled");
      expect(await accruals(c.creatorId)).toHaveLength(0);
      await sentRefund(p);
      expect((await hook("refund.processed", { id: 7100 + ++seq, transaction_reference: p.reference, amount: Number(p.total), status: "processed" })).status).toBe(200);
      expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("refunded");
      expect(await reversals("creatorId", c.creatorId)).toHaveLength(0);
    });

    it("the Premium style bought as an extra on a wish earns the creator once", async () => {
      const c = await creator();
      const standard = await style("std2", "standard", null);
      const premium = await style("prem2", "premium", c.creatorId);
      const payer = await account();
      const w = await wish(payer, standard);
      expect((await pay(payer, "ticket.keepsake", { subjectId: w, options: { style: standard } })).outcome).toBe("fulfilled");
      expect(await accruals(c.creatorId)).toHaveLength(0);
      const x = await pay(payer, "extra.premium-style", { subjectId: w, options: { style: premium } });
      expect(x.outcome).toBe("fulfilled");
      const rows = await accruals(c.creatorId);
      expect(rows).toHaveLength(1);
      expect(rows[0].amountKobo).toBe(await premiumRoyalty(x.id));
      expect(rows[0].paymentId).toBe(x.id);
    });
  });

  describe("J3 (YY4): one way to flag a payment", () => {
    it("flagRefundDue adds both flags once, to a payment that holds money, and says how many it flagged", async () => {
      const payer = await account();
      const w = await wish(payer, "golden");
      const p = await pay(payer, "ticket.keepsake", { subjectId: w });
      const flagged = () => db.payment.findUniqueOrThrow({ where: { id: p.id } }).then((r) => r.flags);
      expect(await db.$transaction((tx) => flagRefundDue(tx, p.id, "delivery_email_failed"))).toBe(1);
      expect(await db.$transaction((tx) => flagRefundDue(tx, [p.id], "delivery_email_failed"))).toBe(0);
      expect(await db.$transaction((tx) => flagRefundDue(tx, p.id, "other"))).toBe(1);
      const flags = await flagged();
      expect(flags.filter((f) => f === "refund_due")).toHaveLength(1);
      expect(flags).toEqual(expect.arrayContaining(["refund_due:delivery_email_failed", "refund_due:other"]));
      await db.payment.update({ where: { id: p.id }, data: { status: "refunded", flags: [] } });
      expect(await db.$transaction((tx) => flagRefundDue(tx, p.id, "late"))).toBe(0);
      expect(await flagged()).toEqual([]);
      expect(await db.$transaction((tx) => flagRefundDue(tx, [], "none"))).toBe(0);
    });
  });

  describe("J4: the Signed grant's end, and a payout paid by hand", () => {
    it("the Signed fulfil writes endsAt as the start plus the price-book line's days; the period job reads it", async () => {
      const c = await creator();
      const p = await pay(c.accountId, "creator.signed", {});
      expect(p.outcome).toBe("fulfilled");
      const g = await db.purchaseGrant.findFirstOrThrow({ where: { paymentId: p.id } });
      expect(g.endsAt).not.toBeNull();
      expect((g.detail as { days: number }).days).toBe(30);
      expect(g.endsAt?.getTime()).toBe(g.startsAt.getTime() + 30 * 86_400_000);
    });

    it("ZZ8: a payout marked paid by hand ignores later provider events, flags them for staff and moves no money", async () => {
      const c = await creator();
      const bankId = ids.next();
      await db.bankAccount.create({ data: { id: bankId, creatorId: c.creatorId, accountNumber: "0123456789", bankCode: "058" } });
      const id = ids.next();
      await db.$transaction(async (tx) => {
        await tx.payout.create({ data: { id, creatorId: c.creatorId, month: "2031-03", amountKobo: 600000n, status: "pending", bankAccountId: bankId } });
        await tx.$executeRaw`INSERT INTO payout_detail ("payoutId") VALUES (${id}::uuid)`;
      });
      const ok = await t.http().post(`/v1/admin/creators/payouts/${c.creatorId}/paid`).set(auth(staff.financeA.token)).send({ month: "2031-03", reason: "Paid by transfer TX-4411" });
      expect(ok.status).toBe(200);
      const entries = await db.ledgerEntry.count({ where: { payoutId: id } });
      const note = async () => (await db.$queryRaw<{ note: string }[]>`SELECT note FROM payout_detail WHERE "payoutId" = ${id}::uuid`)[0].note;
      expect(await note()).toBe("Paid by transfer TX-4411");
      for (const type of ["transfer.reversed", "transfer.failed", "transfer.success"]) {
        const data = { id: 890000 + ++seq, reference: REFERENCE_PREFIX + id, amount: 600000 };
        expect((await hook(type, data)).status).toBe(200);
        expect((await db.payout.findUniqueOrThrow({ where: { id } })).status).toBe("succeeded");
        const ev = await db.webhookEvent.findFirstOrThrow({ where: { type, payload: { path: ["data", "id"], equals: data.id } } });
        expect(ev.outcome).toBe("paid_by_hand");
        expect(ev.processedAt).not.toBeNull();
      }
      expect(await db.ledgerEntry.count({ where: { payoutId: id } })).toBe(entries);
      const n = await note();
      expect(n.startsWith("Paid by transfer TX-4411 ")).toBe(true);
      expect(n.match(/paid by hand/g)).toHaveLength(1);
    });
  });

  describe("J5 (CA3): a business's creator plan payment is invoiced", () => {
    const invoices = (businessId: string) => db.$queryRaw<{ id: string; amount: bigint }[]>`
      SELECT i.id::text AS id, i.amount FROM invoice i JOIN invoice_link l ON l."invoiceId" = i.id WHERE i."businessId" = ${businessId}::uuid`;
    it("a business that pays for a creator plan gets one invoice (a replay adds none); a person's payment gets none", async () => {
      const a = await account(["person"]);
      const biz = ids.next();
      await db.business.create({ data: { id: biz, accountId: a, name: "Studio", business: "Studio", since: NOW } });
      const p = await pay(a, "creator.plan", {}, biz);
      expect(p.outcome).toBe("fulfilled");
      const rows = await invoices(biz);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(p.total);
      await settle.settle({ reference: p.reference, status: "success", amountKobo: p.total, currency: "NGN", paidAt: NOW });
      expect(await invoices(biz)).toHaveLength(1);
      const person = await account(["person"]);
      const q = await pay(person, "creator.plan", {});
      expect(q.outcome).toBe("fulfilled");
      expect(await db.$queryRaw`SELECT 1 FROM invoice_link WHERE "paymentId" = ${q.id}::uuid`).toHaveLength(0);
    });
  });
});
