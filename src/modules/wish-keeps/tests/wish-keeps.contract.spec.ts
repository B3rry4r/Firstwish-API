import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { lockAccount } from "../../../common/db/account-lock";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";

const ROOT = join(__dirname, "../../../..");
// a start no other spec uses
const NOW = new Date("2032-05-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("B22 keep (E-228) and wake (E-232) (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let life: WishLifecycleService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    life = t.app.get(WishLifecycleService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function user() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `b22k-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    const token = `b22k-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] });
    return { accountId, token };
  }
  async function wish(accountId: string, over: Record<string, unknown> = {}) {
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: `22${seq}${id.slice(-4)}`, openedAt: NOW, endsAt: new Date(NOW.getTime() + 5 * DAY), ...over } as never,
    });
    return id;
  }
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const keep = (token: string, id: string, body: Record<string, unknown>, key?: string) => {
    const r = t.http().post(`/v1/wishes/${id}/keep`).set(bearer(token));
    if (key) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  const wake = (token: string, id: string) => t.http().post(`/v1/wishes/${id}/wake`).set(bearer(token)).send({ wishId: id });
  const listKobo = async (sku: string) => Number((await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } })).listKobo);
  const paymentsFor = (wishId: string) => db.payment.findMany({ where: { subjectId: wishId, purpose: "keep" } });
  async function paid(reference: string) {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    const out = await settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
  }

  it("1. keep: priced from the price book, one payment, the end moves on settle; a repeat answers the same payment", async () => {
    const u = await user();
    const w = await wish(u.accountId);
    const before = (await row(w)).endsAt as Date;
    const calls = t.payments.started.length;
    const a = await keep(u.token, w, { keepKey: "month" }, `keep-${run}-1`);
    expect(a.status).toBe(201);
    expect(a.body.item).toBeNull();
    expect(a.body.payment).toMatchObject({ state: "pending", amountKobo: await listKobo("keep.month") });
    expect(a.body.payment.authorizationUrl).toMatch(/^https:\/\/checkout\./);
    expect(t.payments.started.length).toBe(calls + 1);
    const again = await keep(u.token, w, { keepKey: "month" }, `keep-${run}-1`);
    expect(again.status).toBe(201); // still waiting: the same answer
    expect(again.body.payment.reference).toBe(a.body.payment.reference);
    expect(t.payments.started.length).toBe(calls + 1);
    expect((await row(w)).endsAt).toEqual(before); // nothing moved before the payment
    await paid(a.body.payment.reference);
    const after = await row(w);
    expect(after.endsAt?.getTime()).toBe(before.getTime() + 30 * DAY);
    expect(after.keptBy).toBe("keep");
    const done = await keep(u.token, w, { keepKey: "month" }, `keep-${run}-1`);
    expect(done.status).toBe(200);
    expect(done.body.payment.state).toBe("succeeded");
    expect(done.body.item).toMatchObject({ id: w, state: "live" });
    expect(await paymentsFor(w)).toHaveLength(1);
  });

  it("2. the three lengths by keepKey, keep or days; a price in the body is refused; the id may be upper case", async () => {
    const u = await user();
    for (const [body, sku] of [[{ keepKey: "half" }, "keep.half"], [{ keep: "year" }, "keep.year"], [{ days: 30 }, "keep.month"], [{ keepKey: "year", days: 365, keep: "year", paymentWay: "transfer", wishId: "" }, null]] as const) {
      const w = await wish(u.accountId);
      const r = await keep(u.token, w.toUpperCase(), { ...body, wishId: undefined });
      if (!sku) { expect(r.status).toBe(201); continue; }
      expect(r.status).toBe(201);
      expect(r.body.payment.amountKobo).toBe(await listKobo(sku));
    }
    const w = await wish(u.accountId);
    for (const bad of [{}, { keepKey: "week" }, { days: 31 }, { keepKey: "month", days: 365 }, { keepKey: "month", amountKobo: 1 }, { keepKey: "month", amount: 1 }, { keepKey: "month", wishId: ids.next() }]) {
      const r = await keep(u.token, w, bad);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBeDefined();
    }
    expect(await paymentsFor(w)).toHaveLength(0);
  });

  it("3. 401 without a token, 403 for staff, 404 for another person's wish and for an id that is no uuid", async () => {
    const u = await user();
    const o = await user();
    const w = await wish(u.accountId);
    expect((await t.http().post(`/v1/wishes/${w}/keep`).send({ keepKey: "month" })).status).toBe(401);
    expect((await t.http().post(`/v1/wishes/${w}/wake`).send({ wishId: w })).status).toBe(401);
    t.tokens.set("b22k-staff", { kind: "staff", staffId: ids.next(), roles: ["owner"] });
    expect((await keep("b22k-staff", w, { keepKey: "month" })).status).toBe(403);
    expect((await wake("b22k-staff", w)).status).toBe(403);
    expect((await keep(o.token, w, { keepKey: "month" })).status).toBe(404);
    expect((await wake(o.token, w)).status).toBe(404);
    expect((await keep(u.token, "not-a-uuid", { keepKey: "month" })).status).toBe(404);
    expect((await wake(u.token, "not-a-uuid")).status).toBe(404);
    expect(await paymentsFor(w)).toHaveLength(0);
  });

  it("4. a Moment cannot be kept (409 names the way out); a draft, a sealed, an erased and a taken-down wish are 409", async () => {
    const u = await user();
    const moment = await keep(u.token, await wish(u.accountId, { ticket: "moment" }), { keepKey: "month" });
    expect(moment.status).toBe(409);
    expect(moment.body.error.code).toBe("ticket_not_keepable");
    expect(moment.body.error.message).toMatch(/Keepsake/);
    const none = await keep(u.token, await wish(u.accountId, { ticket: null }), { keepKey: "month" });
    expect(none.status).toBe(409);
    for (const [over, code] of [
      [{ status: "draft", openedAt: null, endsAt: null, no: null }, "wish_not_live"],
      [{ status: "sealed", openedAt: null, endsAt: null }, "wish_not_live"],
      [{ status: "removed", removedAt: NOW, erasedAt: NOW }, "wish_erased"],
      [{ status: "removed", removedAt: NOW }, "wish_removed"],
    ] as const) {
      const r = await keep(u.token, await wish(u.accountId, over), { keepKey: "month" });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe(code);
    }
    expect(await db.payment.count({ where: { accountId: u.accountId } })).toBe(0);
  });

  it("5. 20 asks at once make one payment and one provider call; another length while one is open is 409", async () => {
    const u = await user();
    const w = await wish(u.accountId);
    const calls = t.payments.started.length;
    const rs = await Promise.all(Array.from({ length: 20 }, () => keep(u.token, w, { keepKey: "year" })));
    expect(rs.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect(new Set(rs.map((r) => String((r.body as { payment: { reference: string } }).payment.reference))).size).toBe(1);
    expect(await paymentsFor(w)).toHaveLength(1);
    expect(t.payments.started.length).toBe(calls + 1);
    const other = await keep(u.token, w, { keepKey: "month" });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("keep_payment_open");
    await paid(rs[0].body.payment.reference);
    // the payment is paid: a new keep is a new payment
    const next = await keep(u.token, w, { keepKey: "month" });
    expect(next.status).toBe(201);
    expect(next.body.payment.reference).not.toBe(rs[0].body.payment.reference);
  });

  it("6. a keep with a Pass is still paid for: no ruling or entitlement makes the Pass cover a keep", async () => {
    const u = await user();
    const w = await wish(u.accountId);
    const payId = ids.next();
    await db.payment.create({
      data: { id: payId, accountId: u.accountId, payerContact: "x@example.com", purpose: "pass", lines: [], amountKobo: 1000n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `fw-${payId}`, idempotencyKey: `${u.accountId}:${payId}`, channel: "card", options: {} },
    });
    await db.passMembership.create({ data: { id: ids.next(), accountId: u.accountId, paymentId: payId, amount: 1000n, since: NOW, validUntil: new Date(NOW.getTime() + 300 * DAY).toISOString(), way: "card", wishesUsed: 0, upgradesUsed: 0, state: "active" } });
    const r = await keep(u.token, w, { keepKey: "month" });
    expect(r.status).toBe(201);
    expect(r.body.payment).not.toBeNull();
  });

  it("7. a resting wish is woken by its keep's payment (the handler's move), live from now", async () => {
    const u = await user();
    const w = await wish(u.accountId, { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY) });
    const r = await keep(u.token, w, { keepKey: "half" });
    expect(r.status).toBe(201);
    await paid(r.body.payment.reference);
    const after = await row(w);
    expect(after.status).toBe("live");
    expect(after.endsAt?.getTime()).toBe(NOW.getTime() + 182 * DAY);
    expect(after.restingSince).toBeNull();
  });

  it("8. wake: a resting wish with a keep that covers now goes live in one move, with its jobs", async () => {
    const u = await user();
    const until = new Date(NOW.getTime() + 20 * DAY);
    const w = await wish(u.accountId, { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY), keep: "month", keptBy: "keep", keptUntil: until });
    await db.job.create({ data: { id: ids.next(), type: "erase_wish", subjectId: w, runAt: new Date(NOW.getTime() + 300 * DAY), status: "scheduled", attempts: 0 } });
    const r = await wake(u.token, w);
    expect(r.status).toBe(204);
    expect(r.text).toBe("");
    const after = await row(w);
    expect(after.status).toBe("live");
    expect(after.endsAt).toEqual(until);
    expect(after.restingSince).toBeNull();
    expect(after.eraseAfter).toBeNull();
    const moves = await db.wishTransition.findMany({ where: { wishId: w } });
    expect(moves.map((m) => `${m.from}>${m.to}:${m.cause}`)).toEqual(["resting>live:owner.wake"]);
    expect(await db.job.count({ where: { subjectId: w, type: "erase_wish", status: "scheduled" } })).toBe(0);
    expect(await db.job.count({ where: { subjectId: w, type: "rest_wish", status: "scheduled" } })).toBe(1);
    // once live it is not resting: 409
    expect((await wake(u.token, w)).status).toBe(409);
  });

  it("9. wake with no keep, or a keep that has ended: 402 naming the keep; a wish that is not resting: 409", async () => {
    const u = await user();
    const resting = { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY) };
    for (const over of [{}, { keep: "month", keptBy: "keep", keptUntil: new Date(NOW.getTime() - DAY) }, { keptBy: "pass", keptUntil: new Date(NOW.getTime() + DAY) }]) {
      const w = await wish(u.accountId, { ...resting, ...over });
      const r = await wake(u.token, w);
      expect(r.status).toBe(402);
      expect(r.body.error.code).toBe("keep_needed");
      expect(r.body.error.message).toMatch(/keep/i);
      expect((await row(w)).status).toBe("resting");
    }
    for (const over of [{}, { status: "draft", openedAt: null, endsAt: null }, { status: "sealed", openedAt: null }, { status: "removed", removedAt: NOW }, { status: "removed", removedAt: NOW, erasedAt: NOW }]) {
      expect((await wake(u.token, await wish(u.accountId, over))).status).toBe(409);
    }
    const w = await wish(u.accountId, resting);
    const bad = await t.http().post(`/v1/wishes/${w}/wake`).set(bearer(u.token)).send({ wishId: ids.next() });
    expect(bad.status).toBe(422);
    expect((await t.http().post(`/v1/wishes/${w}/wake`).set(bearer(u.token)).send({})).status).toBe(422);
  });

  it("10. wake 20 at once changes the wish once; a woken wish is not on Now Showing without a new ask (SS1)", async () => {
    const u = await user();
    const until = new Date(NOW.getTime() + 20 * DAY);
    const w = await wish(u.accountId, { endsAt: new Date(NOW.getTime() + DAY) });
    await db.publishedWish.create({ data: { id: ids.next(), wishId: w, title: "Shown" } });
    await db.$transaction(async (tx) => {
      await lockAccount(tx, u.accountId);
      await life.move(tx, await life.lock(tx, w), "resting", { cause: "test", data: { restingSince: NOW, eraseAfter: new Date(NOW.getTime() + 300 * DAY) } });
    });
    expect(await db.publishedWish.count({ where: { wishId: w } })).toBe(0);
    await db.wish.update({ where: { id: w }, data: { keep: "month", keptBy: "keep", keptUntil: until } });
    const rs = await Promise.all(Array.from({ length: 20 }, () => wake(u.token, w)));
    expect(rs.filter((r) => r.status === 204)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(19);
    expect(await db.wishTransition.count({ where: { wishId: w, cause: "owner.wake" } })).toBe(1);
    expect((await row(w)).version).toBeGreaterThan(0);
    expect(await db.publishedWish.count({ where: { wishId: w } })).toBe(0);
    expect(await db.publishRequest.count({ where: { wishId: w } })).toBe(0);
  });
});
