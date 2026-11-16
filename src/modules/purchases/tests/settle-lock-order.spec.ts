import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { SettlementService, isLockConflict } from "../../payments/settlement.service";

const NOW = new Date("2032-06-14T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-6b F2: every settle takes its locks in one order (account, payment, wish, grant), so payments for one wish settling at once never deadlock. */
describe("settle lock order: two payments for one wish settling at the same moment", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  jest.setTimeout(280000);

  // its own database: 600 payments here would crowd the lists other specs read from the shared one (the ledger is append-only, so they cannot be removed)
  const prefix = process.env.TEST_DB_PREFIX || "fw";
  const dbName = `${prefix}_test_lockorder_${process.pid}`;
  const rootDir = join(__dirname, "../../../..");
  const before = process.env.DATABASE_URL;
  afterAll(async () => {
    await t.close();
    process.env.DATABASE_URL = before;
    spawnSync(process.execPath, [join(rootDir, "scripts/db.mjs"), "drop", dbName], { encoding: "utf8" });
  });
  beforeAll(async () => {
    const made = spawnSync(process.execPath, [join(rootDir, "scripts/db.mjs"), "create", dbName, prefix], { encoding: "utf8" });
    if (made.status !== 0) throw new Error(`no database: ${made.stderr}`);
    process.env.DATABASE_URL = made.stdout.trim().split("\n").pop();
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(rootDir, "scripts/seed.mjs")], { cwd: rootDir, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  beforeEach(() => { t.clock.set(NOW); });

  async function owner() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `lo-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    const token = `lo-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] });
    return { accountId, token };
  }
  async function wish() {
    const id = ids.next();
    const o = await owner();
    await db.wish.create({
      data: { id, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: `88${seq}${id.slice(-4)}`, opensAt: new Date(NOW.getTime() - 9 * DAY), openedAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() + 5 * DAY), accountId: o.accountId } as never,
    });
    const slug = `lo-${run}-${++seq}`.slice(0, 30);
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    return { id, slug, ...o };
  }
  const addr = () => uniqueAddress();
  const hstart = async (w: { slug: string }) => {
    const proof = (await t.http().get(`/v1/w/${w.slug}`).set("x-forwarded-for", addr())).body.keepOffer.proof as string;
    const r = await t.http().post(`/v1/w/${w.slug}/keep`).set("x-forwarded-for", addr()).set({ "x-wish-proof": proof }).set("Idempotency-Key", `lo-${run}-${++seq}`).send({ keepKey: "month", email: `lo-${run}-${++seq}@example.com` });
    expect(r.status).toBe(201);
    return r.body.payment.reference as string;
  };
  const ostart = async (w: { id: string; token: string }) => {
    const r = await t.http().post(`/v1/wishes/${w.id}/keep`).set(bearer(w.token)).set("Idempotency-Key", `lo-${run}-${++seq}`).send({ keepKey: "month" });
    expect(r.status).toBe(201);
    return r.body.payment.reference as string;
  };
  const answer = async (reference: string) => {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    return (await settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() })).outcome;
  };

  async function round(kind: "owner-and-holder" | "two-holders", pairs: number): Promise<void> {
    const made: { id: string; refs: string[] }[] = [];
    for (let i = 0; i < pairs; i++) {
      const w = await wish();
      made.push({ id: w.id, refs: kind === "owner-and-holder" ? [await ostart(w), await hstart(w)] : [await hstart(w), await hstart(w)] });
    }
    const end0 = new Map(await Promise.all(made.map(async (m) => [m.id, (await db.wish.findUniqueOrThrow({ where: { id: m.id } })).endsAt as Date] as const)));
    const results = await Promise.allSettled(made.flatMap((m) => m.refs.map((r) => answer(r))));
    expect(results.filter((r) => r.status === "rejected").map((r) => String((r).reason).slice(0, 200))).toEqual([]);
    for (const m of made) {
      const rows = await db.payment.findMany({ where: { providerReference: { in: m.refs } } });
      expect(rows.filter((r) => r.fulfilledAt && !r.flags.includes("refund_due")).length).toBe(1);
      expect(rows.filter((r) => r.flags.includes("refund_due") && r.flags.includes("refund_due:keep_already_paid")).length).toBe(1);
      const kept = await db.purchaseGrant.count({ where: { wishId: m.id, kind: "keep", refusedReason: null } });
      expect(kept).toBe(1);
      expect(((await db.wish.findUniqueOrThrow({ where: { id: m.id } })).endsAt as Date).getTime() - (end0.get(m.id) as Date).getTime()).toBe(30 * DAY);
      const [l] = await db.$queryRaw<{ d: bigint; c: bigint }[]>`SELECT coalesce(sum("amountKobo") FILTER (WHERE direction = 'debit'),0) AS d, coalesce(sum("amountKobo") FILTER (WHERE direction = 'credit'),0) AS c FROM ledger_entry WHERE "paymentId" = ANY(${rows.map((r) => r.id)}::uuid[])`;
      expect(String(l.d)).toBe(String(l.c));
      expect(Number(l.d)).toBeGreaterThan(0);
    }
  }

  it("30 pairs of an owner's and a link holder's settle at once, five times over: no error, kept once per pair", async () => {
    for (let i = 0; i < 5; i++) await round("owner-and-holder", 30);
  });

  it("30 pairs of two holders' settles at once, five times over: no error, kept once per pair", async () => {
    for (let i = 0; i < 5; i++) await round("two-holders", 30);
  });

  it("a settle that meets a deadlock or a serialization failure is recognised, so it runs again", () => {
    expect(isLockConflict({ code: "P2010", meta: { code: "40P01", message: "deadlock detected" } })).toBe(true);
    expect(isLockConflict({ code: "P2034", message: "Transaction failed due to a write conflict or a deadlock" })).toBe(true);
    expect(isLockConflict(new Error("could not serialize access due to concurrent update"))).toBe(true);
    expect(isLockConflict(new Error("something else"))).toBe(false);
  });
});
