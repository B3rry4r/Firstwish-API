import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { boot, ids } from "./kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const run = RUN;

/** IC-pool (F7): every transaction waits for a connection as long as production needs, so a crowd of settles on one account all end. */
describe("transactions wait for a connection: sixty contended settles on one account", () => {
  jest.setTimeout(240000);
  let k: Awaited<ReturnType<typeof boot>>;
  let db: PrismaService;
  // its own database: sixty orders here would crowd the lists other specs read from the shared one
  const prefix = process.env.TEST_DB_PREFIX || "fw";
  const dbName = `${prefix}_test_pool_${process.pid}`;
  const rootDir = join(__dirname, "../../../..");
  const before = process.env.DATABASE_URL;
  beforeAll(async () => {
    const made = spawnSync(process.execPath, [join(rootDir, "scripts/db.mjs"), "create", dbName, prefix], { encoding: "utf8" });
    if (made.status !== 0) throw new Error(`no database: ${made.stderr}`);
    process.env.DATABASE_URL = made.stdout.trim().split("\n").pop();
    k = await boot("pab9pool", NOW);
    db = k.db;
  });
  afterAll(async () => {
    await k.t.close();
    process.env.DATABASE_URL = before;
    spawnSync(process.execPath, [join(rootDir, "scripts/db.mjs"), "drop", dbName], { encoding: "utf8" });
  });

  it("60 settles of one account at once end with none failed", async () => {
    const buyer = await k.account();
    const refs: { reference: string; amountKobo: bigint }[] = [];
    for (let i = 0; i < 60; i++) {
      const created = await k.t.http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `pool brief ${run}-${i}`, count: 1, kind: "single", rush: false });
      expect(created.status).toBe(201);
      const orderId = created.body.id as string;
      const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`)[0].a;
      const payId = ids.next();
      await db.payment.create({
        data: { id: payId, accountId: buyer.id, purpose: "concierge", subjectId: orderId, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
          status: "pending", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${buyer.id}:${payId}`, channel: "card", options: { request: { purpose: "concierge", subjectId: orderId }, server: { fingerprint: payId, flags: [] } } },
      });
      refs.push({ reference: `fw-${payId}`, amountKobo: amt });
    }
    const settle = k.t.app.get(SettlementService);
    const results = await Promise.allSettled(refs.map((r) => settle.settle({ reference: r.reference, status: "success", amountKobo: r.amountKobo, currency: "NGN", paidAt: NOW })));
    const failed = results.flatMap((r) => (r.status === "rejected" ? [String((r.reason as Error | undefined)?.message ?? r.reason).slice(0, 80)] : []));
    expect(failed).toEqual([]);
    const done = await db.payment.count({ where: { accountId: buyer.id, status: "succeeded" } });
    expect(done).toBe(60);
  });
});
