import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-07-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("B22 the Pass read (E-83)", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function user() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `b22p-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    const token = `b22p-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] });
    return { accountId, token };
  }
  const read = (token: string) => t.http().get("/v1/me/pass").set(bearer(token));

  /** A Pass bought the real way: a payment settled through the one path, so the grant carries the counters of the price book. */
  async function buyPass(accountId: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku: "pass.year" }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    await db.payment.create({
      data: {
        id, accountId, payerContact: "x@example.com", purpose: "pass", lines: [{ sku: "pass.year", name: "Pass", qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${accountId}:${id}`, channel: "card", options: { request: { purpose: "pass" }, server: { fingerprint: id, flags: [] } },
      },
    });
    expect((await settle.settle({ reference: `fw-${id}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
    return { paymentId: id, unit };
  }

  it("1. no Pass: the empty answer, 200; 401 without a token", async () => {
    const u = await user();
    const r = await read(u.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ amount: 0, since: null, validUntil: null, way: "", wishesUsed: 0, upgradesUsed: 0, live: false, endsAt: null, wishesTotal: 0, wishesLeft: 0, upgradesTotal: 0, upgradesLeft: 0 });
    expect((await t.http().get("/v1/me/pass")).status).toBe(401);
  });

  it("2. a live Pass: ends in a year, counters from the grant, used and left worked out from the draws", async () => {
    const u = await user();
    const { unit } = await buyPass(u.accountId);
    const book = await db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const a = await read(u.token);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ live: true, amount: Number(unit), way: "card", wishesUsed: 0, upgradesUsed: 0, wishesTotal: book.passWishes, wishesLeft: book.passWishes, upgradesTotal: book.passUpgrades, upgradesLeft: book.passUpgrades });
    expect(a.body.validUntil).toBe(new Date(NOW.getTime() + 365 * DAY).toISOString());
    expect(a.body.endsAt).toBe(a.body.validUntil);
    await db.passMembership.updateMany({ where: { accountId: u.accountId }, data: { wishesUsed: 3, upgradesUsed: book.passUpgrades } });
    const b = await read(u.token);
    expect(b.body).toMatchObject({ wishesUsed: 3, wishesLeft: book.passWishes - 3, upgradesUsed: book.passUpgrades, upgradesLeft: 0, live: true });
    // a price-book change does not move what the buyer was given
    await db.entitlements.update({ where: { id: book.id }, data: { passWishes: book.passWishes + 50 } });
    try {
      expect((await read(u.token)).body.wishesTotal).toBe(book.passWishes);
    } finally {
      await db.entitlements.update({ where: { id: book.id }, data: { passWishes: book.passWishes } });
    }
  });

  it("3. an ended Pass is not live and still says when it ended; one owner's Pass is never another's", async () => {
    const u = await user();
    const other = await user();
    await buyPass(u.accountId);
    t.clock.set(new Date(NOW.getTime() + 400 * DAY));
    const r = await read(u.token);
    expect(r.body).toMatchObject({ live: false, wishesLeft: expect.any(Number) });
    expect(r.body.validUntil).toBe(new Date(NOW.getTime() + 365 * DAY).toISOString());
    expect((await read(other.token)).body).toMatchObject({ live: false, validUntil: null, amount: 0 });
  });

  it("4. a refunded Pass does not count", async () => {
    const u = await user();
    const { paymentId } = await buyPass(u.accountId);
    await db.passMembership.updateMany({ where: { paymentId }, data: { state: "refunded" } });
    const r = await read(u.token);
    expect(r.status).toBe(200);
    expect(r.body.live).toBe(false);
    expect(r.body.validUntil).toBeNull();
  });
});
