import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { SettlementService } from "../../payments/settlement.service";
import { giveBackDraws } from "../../purchases/draw-giveback";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** INT-7: the open line of the sweep. Every case goes through the real routes (make the client wish, remove the draft) and the real jobs. */
describe("INT-7: a business draft client wish removed for good gives its drawn wish back", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  let life: WishLifecycleService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    life = t.app.get(WishLifecycleService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const owner = async (over: Record<string, unknown>) => {
    const accountId = ids.next();
    const email = `i7gb-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, sides: ["person", "business"], lastSide: "person" } });
    const token = `i7gb-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "business"] });
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", since: NOW, ...over } });
    return { accountId, email, token, businessId };
  };
  /** A Starter plan live in December with `used` wishes already drawn. */
  const monthly = (used: number) => owner({ plan: "starter", allowance: 10, used, rolled: 0, month: "2026-12", renews: new Date("2027-01-01T09:00:00.000Z") });
  /** A real (stand-in) pack payment settles and grants the pack (5 wishes); the count is then set to `pack` where the case needs fewer, the grant stays. */
  async function packed(pack: number) {
    const o = await owner({});
    const book = await db.price.findFirstOrThrow({ where: { sku: "pro.pack" }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, payerContact: "x@example.com", purpose: "ticket", subjectId: null,
        lines: [{ sku: "pro.pack", name: "Wish pack", qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${o.accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } },
      },
    });
    const out = await t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    if ((await biz(o.businessId)).pack !== pack) await db.business.update({ where: { id: o.businessId }, data: { pack } });
    return o;
  }
  const biz = (id: string) => db.business.findUniqueOrThrow({ where: { id } });

  async function make(o: { token: string; businessId: string }, from: "month" | "pack") {
    const res = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2027-03-04" });
    expect(res.status).toBe(201);
    const wishId = res.body.wishId as string;
    const rec = await db.clientWish.findUniqueOrThrow({ where: { wishId } });
    expect(rec.drawFrom).toBe(from);
    return wishId;
  }
  const remove = (o: { token: string }, wishId: string) => t.http().delete(`/v1/wishes/${wishId}`).set(bearer(o.token));
  const windowEnd = async (wishId: string) => {
    const j = await db.job.findUnique({ where: { type_subjectId: { type: "restore_window_end", subjectId: wishId } } });
    expect(j?.status).toBe("scheduled");
    return jobs.runDue(5, [wishId]);
  };

  it("month: removed and not brought back, the window ends in the same month: used goes down by one, once", async () => {
    const o = await monthly(4);
    const wishId = await make(o, "month");
    expect((await biz(o.businessId)).used).toBe(5);
    expect((await remove(o, wishId)).status).toBe(200);
    expect((await biz(o.businessId)).used).toBe(5); // restorable: nothing yet
    t.clock.set(new Date("2026-12-31T10:00:00.000Z"));
    expect(await windowEnd(wishId)).toBe(1);
    expect((await biz(o.businessId)).used).toBe(4);
    const w = await db.wish.findUniqueOrThrow({ where: { id: wishId } });
    expect(w.erasedAt).not.toBeNull();
    expect((await db.clientWish.findUniqueOrThrow({ where: { wishId } })).drawnBackAt).not.toBeNull();
    expect(await jobs.runDue(5, [wishId])).toBe(0);
    expect((await biz(o.businessId)).used).toBe(4);
  });

  it("month: brought back inside the window, nothing is given back and the draft lives; after the window it cannot be brought back", async () => {
    const o = await monthly(1);
    const wishId = await make(o, "month");
    expect((await remove(o, wishId)).status).toBe(200);
    t.clock.set(new Date("2026-12-10T09:00:00.000Z"));
    expect((await t.http().post(`/v1/wishes/${wishId}/restore`).set(bearer(o.token))).status).toBe(200);
    expect(await db.job.findUnique({ where: { type_subjectId: { type: "restore_window_end", subjectId: wishId } } })).toBeNull();
    expect((await biz(o.businessId)).used).toBe(2);
    expect((await remove(o, wishId)).status).toBe(200);
    t.clock.set(new Date("2027-01-12T09:00:00.000Z"));
    expect((await t.http().post(`/v1/wishes/${wishId}/restore`).set(bearer(o.token))).status).toBe(409);
  });

  it("month: the draw was in a month that has turned: nothing is given back, the record is still marked once", async () => {
    const o = await monthly(4);
    t.clock.set(new Date("2026-12-15T09:00:00.000Z"));
    const wishId = await make(o, "month");
    expect((await remove(o, wishId)).status).toBe(200);
    t.clock.set(new Date("2027-01-20T09:00:00.000Z"));
    expect(await windowEnd(wishId)).toBe(1);
    expect((await biz(o.businessId)).used).toBe(5);
    expect((await db.clientWish.findUniqueOrThrow({ where: { wishId } })).drawnBackAt).not.toBeNull();
  });

  it("pack: the wish returns to the pack; never below zero for the month's count", async () => {
    const p = await packed(3);
    const wishId = await make(p, "pack");
    expect((await biz(p.businessId)).pack).toBe(2);
    expect((await remove(p, wishId)).status).toBe(200);
    t.clock.set(new Date("2026-12-31T10:00:00.000Z"));
    expect(await windowEnd(wishId)).toBe(1);
    expect((await biz(p.businessId)).pack).toBe(3);

    const m = await monthly(0);
    t.clock.set(NOW);
    const w2 = await make(m, "month");
    await db.business.update({ where: { id: m.businessId }, data: { used: 0 } }); // the count already stands at zero
    expect((await remove(m, w2)).status).toBe(200);
    t.clock.set(new Date("2026-12-31T10:00:00.000Z"));
    await windowEnd(w2);
    expect((await biz(m.businessId)).used).toBe(0);
  });

  it("a wish that was sealed gives nothing back, whether it is erased by staff or by the account's erase", async () => {
    const p = await packed(3);
    const wishId = await make(p, "pack");
    expect((await biz(p.businessId)).pack).toBe(2);
    // The wish was sealed (sent): the draw was spent.
    await db.wish.update({ where: { id: wishId }, data: { status: "sealed", sealedAt: NOW } });
    await db.wishTransition.create({ data: { id: ids.next(), wishId, from: "draft", to: "sealed", cause: "owner.seal", createdAt: NOW } });
    await life.eraseNow(wishId, "staff.erase");
    expect((await biz(p.businessId)).pack).toBe(2);
    expect((await db.clientWish.findUniqueOrThrow({ where: { wishId } })).drawnBackAt).toBeNull();
  });

  it("twenty at once: the wish goes back once (twenty erases, then twenty give-backs)", async () => {
    const p = await packed(5);
    const wishId = await make(p, "pack");
    expect((await remove(p, wishId)).status).toBe(200);
    const done = await Promise.allSettled(Array.from({ length: 20 }, () => life.eraseNow(wishId, "staff.erase")));
    expect(done.filter((d) => d.status === "fulfilled")).toHaveLength(1);
    expect((await biz(p.businessId)).pack).toBe(5);
    const again = await Promise.all(Array.from({ length: 20 }, () => db.$transaction((tx) => giveBackDraws(tx, [wishId], t.clock.now()))));
    expect(again.reduce((a, b) => a + b, 0)).toBe(0);
    expect((await biz(p.businessId)).pack).toBe(5);

    // Twenty callers at once on a wish nobody has given back yet: one claim.
    const w2 = await make(p, "pack");
    expect((await biz(p.businessId)).pack).toBe(4);
    const claims = await Promise.all(Array.from({ length: 20 }, () => db.$transaction((tx) => giveBackDraws(tx, [w2], t.clock.now()))));
    expect(claims.reduce((a, b) => a + b, 0)).toBe(1);
    expect((await biz(p.businessId)).pack).toBe(5);
  });

  it("the account's erase takes a draft with it and gives its wish back", async () => {
    const p = await packed(2);
    const wishId = await make(p, "pack");
    expect((await biz(p.businessId)).pack).toBe(1);
    await t.app.get(AccountErasureService).erase(p.accountId, { actor: { type: "system", id: null, requestId: `i7-${run}` }, reason: null });
    expect((await db.wish.findUniqueOrThrow({ where: { id: wishId } })).erasedAt).not.toBeNull();
    expect((await biz(p.businessId)).pack).toBe(2);
  });
});
