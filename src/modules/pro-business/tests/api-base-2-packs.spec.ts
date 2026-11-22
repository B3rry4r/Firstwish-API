import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { SettlementService } from "../../payments/settlement.service";
import { giveBackDraws } from "../../purchases/draw-giveback";
import { sourceOfRecord } from "../../royalties/draw-source";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2210-03-01T09:00:00.000Z");
const WINDOW_END = new Date("2210-03-31T10:00:00Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("API-BASE-2: give-back to a pack, and each pack's draws counted on their own", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  let settle: SettlementService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const owner = async () => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `ab2-${run}-${++seq}@example.com`, sides: ["person", "business"], lastSide: "person" } });
    const token = `ab2-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW } });
    return { accountId, token, businessId };
  };
  const biz = (id: string) => db.business.findUniqueOrThrow({ where: { id } });
  async function make(o: { token: string }) {
    const res = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2210-06-04" });
    expect(res.status).toBe(201);
    return res.body.wishId as string;
  }
  const remove = async (o: { token: string }, w: string) => expect((await t.http().delete(`/v1/wishes/${w}`).set(bearer(o.token))).status).toBe(200);
  async function pay(o: { accountId: string; businessId: string }, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku, version: 1 } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, payerContact: null, purpose: "ticket", subjectId: null,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${o.accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id } },
      },
    });
    expect((await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: 150n })).outcome).toBe("fulfilled");
    return { id };
  }

  it("case 2: a hand-built pack record with no payment gives back nothing; the pack stays 0", async () => {
    const o = await owner();
    await pay(o, "pro.pack");
    const w = await make(o);
    // hand-built: drawn from a pack, no payment recorded, and the business holds no pack
    await db.$executeRaw`UPDATE client_wish SET "drawPaymentId" = NULL, "drawSku" = NULL, "drawWishes" = NULL WHERE "wishId" = ${w}::uuid`;
    await db.$executeRaw`UPDATE business SET pack = 0 WHERE id = ${o.businessId}::uuid`;
    await remove(o, w);
    t.clock.set(WINDOW_END);
    await jobs.runDue(10, [w]);
    await db.$transaction((tx) => giveBackDraws(tx, [w], t.clock.now()));
    const rec = await db.clientWish.findUniqueOrThrow({ where: { wishId: w } });
    expect(rec.drawFrom).toBe("pack");
    expect(rec.drawPaymentId).toBeNull();
    expect(rec.drawnBackAt).not.toBeNull();
    expect((await biz(o.businessId)).pack).toBe(0);
  });

  it("case 3: two packs of 5, one draw of the first given back, draws until both are used: each pack named for exactly 5, each draw has its payment, shares follow HD2", async () => {
    const o = await owner();
    const a = await pay(o, "pro.pack");
    const b = await pay(o, "pro.pack");
    expect((await biz(o.businessId)).pack).toBe(10);
    const first: string[] = [];
    for (let i = 0; i < 6; i++) first.push(await make(o)); // five of the first pack, one of the second
    await remove(o, first[0]);
    t.clock.set(WINDOW_END);
    await jobs.runDue(10, [first[0]]);
    expect((await biz(o.businessId)).pack).toBe(5); // 4 left + the one returned
    const rest: string[] = [];
    for (let i = 0; i < 5; i++) rest.push(await make(o));
    expect((await biz(o.businessId)).pack).toBe(0);
    const standing = await db.clientWish.findMany({ where: { businessId: o.businessId, drawFrom: "pack", drawnBackAt: null } });
    expect(standing).toHaveLength(10);
    expect(standing.every((r) => r.drawPaymentId !== null)).toBe(true);
    expect(standing.filter((r) => r.drawPaymentId === a.id)).toHaveLength(5);
    expect(standing.filter((r) => r.drawPaymentId === b.id)).toHaveLength(5);
    // the draw after the give-back went to the FIRST pack
    expect((await db.clientWish.findUniqueOrThrow({ where: { wishId: rest[0] } })).drawPaymentId).toBe(a.id);
    // HD2: each draw earns from the payment it was drawn against: pack 1,750,000 / 5 = 350,000 a wish, 20% = 70,000
    for (const r of standing) {
      const src = await db.$transaction((tx) => sourceOfRecord(tx, r));
      expect(src && (src.lineKobo / BigInt(src.wishes)) * 20n / 100n).toBe(70_000n);
    }
  });
});
