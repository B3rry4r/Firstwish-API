import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { InvoicesService } from "../invoices.service";

/*
 * FA1 (wave 6 join): an invoice's VAT part equals the ledger's vat_payable for the payment. By hand, VAT 7.5% inside the total:
 *   Concierge one wish, promo 1,500,000: 1,500,000 x 7.5 / 107.5 = 104,651.16 -> 104,651
 *   Pro Starter, promo 3,500,000: 244,186.04 -> 244,186
 *   Creator plan 750,000, credit pack 300,000, extra review 250,000: no VAT part (the owner has not said they carry VAT)
 */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2037-07-04T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;

describe("FA1: the invoice and the ledger agree on VAT", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  async function paid(sku: string) {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `j6fa1-${run}-${ids.next()}@example.com`, name: "Ada Obi", sides: ["person", "business"], lastSide: "person" } });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW } });
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId, businessId, payerContact: "x@example.com", purpose: "ticket", subjectId: null,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } },
      },
    });
    await t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    const payment = await db.payment.findUniqueOrThrow({ where: { id } });
    const invoiceId = await db.$transaction((tx) => t.app.get(InvoicesService).issue(tx, payment));
    const inv = (await db.invoice.findUniqueOrThrow({ where: { id: invoiceId as string } }));
    const entries = await db.ledgerEntry.findMany({ where: { paymentId: id, account: "vat_payable" } });
    const ledgerVat = entries.reduce((n, e) => n + (e.direction === "credit" ? e.amountKobo : -e.amountKobo), 0n);
    return { total, inv, ledgerVat, entries, accountId, businessId };
  }

  it("a Concierge payment books vat_payable and its invoice's VAT part equals the ledger (104,651 of 1,500,000)", async () => {
    const p = await paid("concierge.single");
    expect(p.total).toBe(1_500_000n);
    expect(p.entries).toHaveLength(1);
    expect(p.ledgerVat).toBe(104_651n);
    expect(p.inv.vat).toBe(104_651n);
    expect(p.inv.amount).toBe(1_500_000n);
  });

  it("a Pro plan payment still books 244,186 of 3,500,000, and the invoice agrees", async () => {
    const p = await paid("pro.starter");
    expect(p.ledgerVat).toBe(244_186n);
    expect(p.inv.vat).toBe(244_186n);
  });

  it.each(["creator.plan", "creator.credit-pack", "creator.extra-review"])("%s: the invoice states the total with no VAT part and the ledger books none", async (sku) => {
    const p = await paid(sku);
    expect(p.inv.vat).toBe(0n);
    expect(p.inv.amount).toBe(p.total);
    expect(p.ledgerVat).toBe(0n);
    expect(p.entries).toHaveLength(0);
  });
});
