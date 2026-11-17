import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { lockAccount } from "../../../common/db/account-lock";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { JobsService } from "../../jobs/jobs.service";
import { PurchasesService } from "../../purchases/purchases.service";
import { UnlockTokens } from "../../public-wishes/unlock-token";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { testWishNo } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
// a start no other spec uses
const NOW = new Date("2032-05-10T09:00:00.000Z");
const DAY = 86_400_000;
const TERM_DAYS: Record<string, number> = { moment: 7, keepsake: 14, signature: 30, premiere: 60 };
/** A wish row's first open is its end less the ticket's term (EE7): the end is worked out from it (HB1). */
const openedFor = (d: Record<string, unknown>): Date | undefined => (d.endsAt instanceof Date && typeof d.ticket === "string" && TERM_DAYS[d.ticket] ? new Date(d.endsAt.getTime() - TERM_DAYS[d.ticket] * 86_400_000) : undefined);
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("B22 keep (E-228) and wake (E-232) (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let life: WishLifecycleService;
  let jobs: JobsService;
  let purchases: PurchasesService;
  let unlock: UnlockTokens;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    life = t.app.get(WishLifecycleService);
    jobs = t.app.get(JobsService);
    purchases = t.app.get(PurchasesService);
    unlock = t.app.get(UnlockTokens);
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
      data: { id, accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo("b22"), openedAt: NOW, endsAt: new Date(NOW.getTime() + 5 * DAY), ...over, ...(openedFor({ ticket: "keepsake", endsAt: new Date(NOW.getTime() + 5 * DAY), ...over }) ? { openedAt: openedFor({ ticket: "keepsake", endsAt: new Date(NOW.getTime() + 5 * DAY), ...over }) } : {}) } as never,
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

  /** A wish with a paid keep (a real payment, settled) that is put to rest while the keep still covers now: HB1 reads keeps from the grant rows. */
  async function restingWithKeep(accountId: string, token: string, over: Record<string, unknown> = {}) {
    const w = await wish(accountId, over);
    await paid((await keep(token, w, { keepKey: "month" })).body.payment.reference);
    await db.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      await life.move(tx, await life.lock(tx, w), "resting", { cause: "test", data: { restingSince: NOW, eraseAfter: new Date(NOW.getTime() + 300 * DAY) } });
    });
    return w;
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
    const w = await restingWithKeep(u.accountId, u.token);
    const until = new Date(NOW.getTime() + 35 * DAY); // the wish's own end (5 days) and the month after it
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
    expect(moves.filter((m) => m.cause !== "test").map((m) => `${m.from}>${m.to}:${m.cause}`)).toEqual(["resting>live:owner.wake"]);
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
    const w = await wish(u.accountId, { endsAt: new Date(NOW.getTime() + DAY) });
    await db.publishedWish.create({ data: { id: ids.next(), wishId: w, title: "Shown" } });
    await paid((await keep(u.token, w, { keepKey: "month" })).body.payment.reference);
    await db.$transaction(async (tx) => {
      await lockAccount(tx, u.accountId);
      await life.move(tx, await life.lock(tx, w), "resting", { cause: "test", data: { restingSince: NOW, eraseAfter: new Date(NOW.getTime() + 300 * DAY) } });
    });
    expect(await db.publishedWish.count({ where: { wishId: w } })).toBe(0);
    const rs = await Promise.all(Array.from({ length: 20 }, () => wake(u.token, w)));
    expect(rs.filter((r) => r.status === 204)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(19);
    expect(await db.wishTransition.count({ where: { wishId: w, cause: "owner.wake" } })).toBe(1);
    expect((await row(w)).version).toBeGreaterThan(0);
    expect(await db.publishedWish.count({ where: { wishId: w } })).toBe(0);
    expect(await db.publishRequest.count({ where: { wishId: w } })).toBe(0);
  });

  // ---- HA1 the receiver, HA2 the Pass, HA3 who may wake

  const link = async (wishId: string, over: Record<string, unknown> = {}) => {
    const slug = `b22-${run}-${++seq}`.slice(0, 30);
    const id = ids.next();
    await db.wishLink.create({ data: { id, slug, wishId, active: true, ...over } });
    return { slug, id };
  };
  const keepVia = (token: string, id: string, slug: string | null, body: Record<string, unknown>, extra: Record<string, string> = {}, key?: string) => {
    const r = t.http().post(`/v1/wishes/${id}/keep`).set(bearer(token)).set(extra);
    if (slug) r.set("x-wish-link", slug);
    if (key) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  const wakeVia = (token: string, id: string, slug: string | null, extra: Record<string, string> = {}) => {
    const r = t.http().post(`/v1/wishes/${id}/wake`).set(bearer(token)).set(extra);
    if (slug) r.set("x-wish-link", slug);
    return r.send({ wishId: id });
  };
  const resting = (extra: Record<string, unknown> = {}) => ({ status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY), ...extra });
  async function buyPass(accountId: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku: "pass.year" }, orderBy: { id: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    await db.payment.create({
      data: {
        id, accountId, payerContact: "x@example.com", purpose: "pass", lines: [{ sku: "pass.year", name: "Pass", qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${accountId}:${id}`, channel: "card", options: { request: { purpose: "pass" }, server: { fingerprint: id, flags: [] } },
      },
    });
    expect((await settle.settle({ reference: `fw-${id}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
    return id;
  }

  it("11. HA1 a receiver who holds the link keeps the wish with a payment of their own; the handler moves the end; the answers show nothing of the owner", async () => {
    const owner = await user();
    const rec = await user();
    const w = await wish(owner.accountId);
    const l = await link(w);
    const before = (await row(w)).endsAt as Date;
    const calls = t.payments.started.length;
    const a = await keepVia(rec.token, w, l.slug, { keepKey: "month" }, {}, `rk-${run}-1`);
    expect(a.status).toBe(201);
    expect(a.body.item).toBeNull();
    expect(a.body.payment.amountKobo).toBe(await listKobo("keep.month"));
    const pay = await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } });
    expect(pay.accountId).toBe(rec.accountId);
    expect(t.payments.started.length).toBe(calls + 1);
    await paid(a.body.payment.reference);
    const after = await row(w);
    expect(after.endsAt?.getTime()).toBe(before.getTime() + 30 * DAY);
    expect(after.keptBy).toBe("keep");
    expect((await db.purchaseGrant.findMany({ where: { paymentId: pay.id } })).every((g) => g.refusedReason === null)).toBe(true);
    const done = await keepVia(rec.token, w, l.slug, { keepKey: "month" }, {}, `rk-${run}-1`);
    expect(done.status).toBe(200);
    expect(done.body.item).toMatchObject({ slug: l.slug, state: "live" });
    const text = JSON.stringify(done.body);
    expect(text).not.toContain(owner.accountId);
    expect(text).not.toContain("accountId");
    // a refund of the receiver's keep takes it back through the existing revoke
    const res = await db.$transaction((tx) => purchases.revoke(tx, { id: pay.id }));
    expect(res.map((r) => r.result)).toEqual(["revoked"]);
    expect((await row(w)).endsAt?.getTime()).toBe(before.getTime());
  });

  it("12. HA1 no link, a wrong link, another wish's link or a switched-off link is 404; a passcode needs the link's own token; a locked link is refused", async () => {
    const owner = await user();
    const rec = await user();
    const w = await wish(owner.accountId);
    const other = await wish(owner.accountId);
    const l = await link(w);
    const lo = await link(other);
    const off = await link(await wish(owner.accountId), { active: false });
    expect((await keepVia(rec.token, w, null, { keepKey: "month" })).status).toBe(404);
    expect((await keepVia(rec.token, w, "nosuchslug", { keepKey: "month" })).status).toBe(404);
    expect((await keepVia(rec.token, w, lo.slug, { keepKey: "month" })).status).toBe(404);
    expect((await keepVia(rec.token, w, "bad slug!", { keepKey: "month" })).status).toBe(404);
    const offWish = (await db.wishLink.findUniqueOrThrow({ where: { id: off.id } })).wishId;
    expect((await keepVia(rec.token, offWish, off.slug, { keepKey: "month" })).status).toBe(404);
    expect((await wakeVia(rec.token, w, null)).status).toBe(404);
    expect((await wakeVia(rec.token, w, lo.slug)).status).toBe(404);
    const hash = "scrypt$00$00";
    await db.wish.update({ where: { id: w }, data: { passcodeHash: hash } });
    const noToken = await keepVia(rec.token, w, l.slug, { keepKey: "month" });
    expect(noToken.status).toBe(409);
    expect(noToken.body.error.code).toBe("not_open");
    const bad = await keepVia(rec.token, w, l.slug, { keepKey: "month" }, { "x-unlock-token": "1.abc" });
    expect(bad.status).toBe(409);
    const token = unlock.issue(l.id, hash).token;
    expect((await keepVia(rec.token, w, l.slug, { keepKey: "month" }, { "x-unlock-token": token })).status).toBe(201);
    await db.wishLink.update({ where: { id: l.id }, data: { lockedUntil: new Date(NOW.getTime() + 600_000) } });
    const locked = await keepVia(rec.token, w, l.slug, { keepKey: "year" });
    expect(locked.status).toBe(429);
    expect(locked.headers["retry-after"]).toBeDefined();
    expect((await t.http().post(`/v1/wishes/${w}/keep`).set("x-wish-link", l.slug).send({ keepKey: "month" })).status).toBe(401);
  });

  it("13. HA1 a made-up proof on POST /v1/payments does not let a stranger pay a keep for a wish", async () => {
    const owner = await user();
    const stranger = await user();
    const w = await wish(owner.accountId);
    const r = await t.http().post("/v1/payments").set(bearer(stranger.token)).send({ purpose: "keep", id: "month", subjectId: w, options: { receiverProof: `${Math.floor(NOW.getTime() / 1000) + 3600}.${"A".repeat(43)}` } });
    expect(r.status).toBe(422);
    const plain = await t.http().post("/v1/payments").set(bearer(stranger.token)).send({ purpose: "keep", id: "month", subjectId: w });
    expect(plain.status).toBe(422);
    expect(await paymentsFor(w)).toHaveLength(0);
  });

  it("14. HA1, HU3 one open keep payment per payer: the owner and a receiver each have their own (20 at once make two payments and two provider calls); neither blocks the other", async () => {
    const owner = await user();
    const rec = await user();
    const w = await wish(owner.accountId);
    const l = await link(w);
    const calls = t.payments.started.length;
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? keepVia(rec.token, w, l.slug, { keepKey: "month" }) : keep(owner.token, w, { keepKey: "month" }))));
    expect(await paymentsFor(w)).toHaveLength(2);
    expect(t.payments.started.length).toBe(calls + 2);
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => String(r.body.payment.reference))).size).toBe(2);
  });

  it("15. HA3 wake by a receiver who holds the link (a paid keep covers it); a stranger is refused; no keep is 402", async () => {
    const owner = await user();
    const rec = await user();
    const stranger = await user();
    const w = await restingWithKeep(owner.accountId, owner.token);
    const l = await link(w);
    expect((await wakeVia(stranger.token, w, null)).status).toBe(404);
    expect((await wakeVia(stranger.token, w, "nosuchslug")).status).toBe(404);
    const ok = await wakeVia(rec.token, w, l.slug);
    expect(ok.status).toBe(204);
    expect((await row(w)).status).toBe("live");
    expect((await db.wishTransition.findMany({ where: { wishId: w } })).map((m) => m.cause).filter((c) => c !== "test")).toEqual(["receiver.wake"]);
    const w2 = await wish(owner.accountId, resting());
    const l2 = await link(w2);
    const no = await wakeVia(rec.token, w2, l2.slug);
    expect(no.status).toBe(402);
    expect(no.body.error.code).toBe("keep_needed");
  });

  it("16. HA2 the Pass holder's own wish is kept and woken with no payment; anyone else pays", async () => {
    const holder = await user();
    const rec = await user();
    await buyPass(holder.accountId);
    const passEnd = new Date(NOW.getTime() + 365 * DAY);
    const live = await wish(holder.accountId);
    const calls = t.payments.started.length;
    const k = await keep(holder.token, live, {});
    expect(k.status).toBe(200);
    expect(k.body.payment).toBeNull();
    expect(k.body.item).toMatchObject({ id: live, state: "live" });
    expect((await row(live)).keptBy).toBe("pass");
    expect(new Date(k.body.item.endsAt).getTime()).toBe(passEnd.getTime());
    expect(await paymentsFor(live)).toHaveLength(0);
    expect(t.payments.started.length).toBe(calls);
    expect(await db.job.count({ where: { subjectId: live, type: "rest_wish", status: "scheduled" } })).toBe(1);
    // a resting wish of the holder wakes free, by keep or by wake
    const r1 = await wish(holder.accountId, resting());
    expect((await wake(holder.token, r1)).status).toBe(204);
    const r1row = await row(r1);
    expect([r1row.status, r1row.endsAt?.getTime(), r1row.keptBy]).toEqual(["live", passEnd.getTime(), "pass"]);
    const r2 = await wish(holder.accountId, resting());
    expect((await keep(holder.token, r2, { keepKey: "month" })).body.payment).toBeNull();
    expect((await row(r2)).status).toBe("live");
    expect(await db.payment.count({ where: { subjectId: { in: [live, r1, r2] }, purpose: "keep" } })).toBe(0);
    // a receiver with a Pass of their own, or a person with none, pays for someone else's wish; a non-holder owner pays for their own
    await buyPass(rec.accountId);
    const mine = await wish(holder.accountId, resting());
    const l = await link(mine);
    const paying = await keepVia(rec.token, mine, l.slug, { keepKey: "month" });
    expect(paying.status).toBe(201);
    expect(paying.body.payment).not.toBeNull();
    const nonHolder = await user();
    const w = await wish(nonHolder.accountId, resting());
    expect((await keep(nonHolder.token, w, { keepKey: "month" })).body.payment).not.toBeNull();
    expect((await wake(nonHolder.token, w)).status).toBe(402);
    expect((await keep(holder.token, await wish(holder.accountId, { ticket: "moment" }), {})).status).toBe(409);
    expect((await keep(holder.token, live, { keepKey: "week" })).status).toBe(422);
  });

  it("17. HA2 when the Pass ends the wish rests; a paid keep longer than the Pass keeps it live", async () => {
    const holder = await user();
    const rec = await user();
    await buyPass(holder.accountId);
    const passEnd = new Date(NOW.getTime() + 365 * DAY);
    const a = await wish(holder.accountId);
    const b = await wish(holder.accountId);
    await keep(holder.token, a, {});
    await keep(holder.token, b, {});
    // a receiver pays a year on b: it ends a year after the Pass does
    const l = await link(b);
    const pay = await keepVia(rec.token, b, l.slug, { keepKey: "year" });
    await paid(pay.body.payment.reference);
    // HB1 (default, lead): a keep bought while the Pass covers counts its days from the day bought (after the wish's own end), so it outlasts the Pass here
    expect((await row(b)).endsAt?.getTime()).toBe(NOW.getTime() + (5 + 365) * DAY);
    t.clock.set(new Date(passEnd.getTime() + 1000));
    await jobs.runDue(50, [a, b]);
    expect((await row(a)).status).toBe("resting");
    expect((await row(b)).status).toBe("live");
    // after the Pass an owner who is no longer covered pays
    const again = await keep(holder.token, a, { keepKey: "month" });
    expect(again.status).toBe(201);
    expect(again.body.payment).not.toBeNull();
  });

  it("18. HA2 a refunded Pass: the covered wish rests unless a paid keep covers it", async () => {
    const holder = await user();
    const rec = await user();
    const passPay = await buyPass(holder.accountId);
    const a = await wish(holder.accountId, { endsAt: new Date(NOW.getTime() + 2 * DAY) });
    const b = await wish(holder.accountId, { endsAt: new Date(NOW.getTime() + 2 * DAY) });
    await keep(holder.token, a, {});
    await keep(holder.token, b, {});
    const l = await link(b);
    await paid((await keepVia(rec.token, b, l.slug, { keepKey: "half" })).body.payment.reference);
    expect((await row(a)).keptBy).toBe("pass");
    t.clock.set(new Date(NOW.getTime() + 20 * DAY)); // past the wish's own two-week term
    await db.$transaction((tx) => purchases.revoke(tx, { id: passPay }));
    expect((await db.passMembership.findFirstOrThrow({ where: { paymentId: passPay } })).state).toBe("refunded");
    await jobs.runDue(50, [a, b]);
    expect((await row(a)).status).toBe("resting");
    const bRow = await row(b);
    expect(bRow.status).toBe("live");
    expect(bRow.keptBy).toBe("keep");
  });
});
