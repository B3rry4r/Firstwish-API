import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { EntitlementsService, grantOf } from "../../price-book/entitlements.service";
import { FulfilmentRegistry } from "../../payments/fulfilment.registry";
import { SettlementService } from "../../payments/settlement.service";
import { BusinessHandlers } from "../business-handlers";
import { PassService } from "../pass.service";
import { PurchasesService } from "../purchases.service";

/**
 * P-B07: the rulings from the check of B07 (HH1 to HH9) and the proofs run again after them. A real database, the clock port,
 * parallel cases really in parallel. Tests own their rows.
 */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
/** Wish tests run far from any other spec's clock: specs share one database and some run the due jobs of every row (see HH9). */
const FAR = new Date("2150-03-01T09:00:00.000Z");
const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);
const TERM_DAYS: Record<string, number> = { moment: 7, keepsake: 14, signature: 30, premiere: 60 };
/** A wish row's first open is its end less the ticket's term (EE7): the end is worked out from it (HB1). */
const openedFor = (d: Record<string, unknown>): Date | undefined => (d.endsAt instanceof Date && typeof d.ticket === "string" && TERM_DAYS[d.ticket] ? new Date(d.endsAt.getTime() - TERM_DAYS[d.ticket] * 86_400_000) : undefined);
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
let seq = 0;

describe("purchases P-B07: the rulings HH1 to HH9", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let registry: FulfilmentRegistry;
  let purchases: PurchasesService;
  let pass: PassService;
  let biz: BusinessHandlers;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    registry = t.app.get(FulfilmentRegistry);
    purchases = t.app.get(PurchasesService);
    pass = t.app.get(PassService);
    biz = t.app.get(BusinessHandlers);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const account = async (contact?: string) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: contact ?? `pb07-${process.pid}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    return id;
  };
  const business = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.business.create({ data: { id, accountId, name: "Studio", ...over } });
    return id;
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ...over } as never });
    return id;
  };
  const liveWish = (accountId: string, endsAt: Date, over: Record<string, unknown> = {}) =>
    wish(accountId, { ticket: "keepsake", status: "live", endsAt, ...over, openedAt: openedFor({ ticket: "keepsake", endsAt, ...over }) });
  const wishRow = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const bizRow = (id: string) => db.business.findUniqueOrThrow({ where: { id } });
  const paymentRow = (reference: string) => db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
  const grants = (paymentId: string) => db.$queryRaw<{ sku: string; kind: string; refusedReason: string | null; detail: Record<string, unknown>; endsAt: Date | null; revokedAt: Date | null }[]>`
    SELECT sku, kind, "refusedReason", detail, "endsAt", "revokedAt" FROM purchase_grant WHERE "paymentId" = ${paymentId}::uuid ORDER BY sku`;
  const read = (businessId: string) => db.$transaction((tx) => biz.read(tx, businessId));
  const draw = (businessId: string) => db.$transaction((tx) => biz.draw(tx, businessId));
  const revoke = async (reference: string) => db.$transaction(async (tx) => purchases.revoke(tx, await paymentRow(reference)));

  /** A payment as the start would have stored it, then the provider's good answer through the one settle path. */
  async function pay(accountId: string, sku: string, request: Record<string, unknown> = {}, o: { qty?: number; businessId?: string | null } = {}) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const qty = o.qty ?? 1;
    const id = ids.next();
    const total = unit * BigInt(qty);
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId, businessId: o.businessId ?? null, payerContact: "x@example.com", purpose: "ticket", subjectId: (request.subjectId as string) ?? null,
        lines: [{ sku, name: sku, qty, unitKobo: Number(unit), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x", ...request }, server: { fingerprint: id, flags: [] } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return reference;
  }

  // ---- HTTP, for HH2
  let evSeq = 9_000_000;
  const hook = async (reference: string) => {
    const pr = await paymentRow(reference);
    const body = JSON.stringify({ event: "charge.success", data: { id: ++evSeq, reference, amount: Number(pr.amountKobo), currency: "NGN", channel: "card", fees: 100, paid_at: t.clock.now().toISOString() } });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const verify = (token: string, reference: string) => t.http().get(`/v1/payments/${reference}`).set(bearer(token));

  it("HH1. the month is rolled by the server on read and on draw; an early payment pushes renews", async () => {
    // Worked by hand (allowance A, rolled R, used U in the month that ends; roll() of lib/pro-data.ts: next R = A - max(U - R, 0) when
    // the stored month is exactly the month before, else 0; U starts again at 0):
    //  case 1, the verifier's: Starter (A 10) paid 1 Dec, 4 used, paid again 20 Dec. Dec stays as it is (U 4), renews 1 Jan -> 1 Feb.
    //    5 Jan: Dec -> Jan, R = 10 - max(4 - 0, 0) = 6, U 0, so 16 wishes (10 own + 6). 1 Feb: Jan -> Feb, own used = 16 - 6 = 10, R = 10 - 10 = 0.
    //  case 2, late: Starter 1 Dec, 4 used, nothing until 2 Jan: R = 6; paying Studio (A 35) on 2 Jan starts a new period to 2 Feb: 35 + 6 = 41.
    //  case 3, two months late: Starter 1 Dec, 4 used, read on 2 Mar: Dec is not the month before Mar, R = 0; the plan ended 1 Jan: nothing from it.
    //  case 4, rolled wishes go first: Studio (A 35), Dec: U 40 (35 own + 5 of the 6 rolled in), R was 6. Jan: own used = 40 - 6 = 34, R = 35 - 34 = 1.
    //  case 5, the end of a short month: Starter paid 31 Jan renews 28 Feb, paid early on 10 Feb it pushes to 28 Mar.
    const a = await account();
    const b = await business(a);
    await pay(a, "pro.starter", {}, { businessId: b });
    await db.business.update({ where: { id: b }, data: { used: 4 } });
    t.clock.set(at("2026-12-20T09:00:00.000Z"));
    await pay(a, "pro.starter", {}, { businessId: b });
    const row = await bizRow(b);
    expect(row).toMatchObject({ month: "2026-12", used: 4, rolled: 0, allowance: 10 });
    expect(row.renews!.toISOString()).toBe("2027-02-01T09:00:00.000Z");
    t.clock.set(at("2027-01-05T09:00:00.000Z"));
    expect(await read(b)).toMatchObject({ month: "2027-01", rolled: 6, used: 0, total: 16, left: 16, live: true, canMake: true });
    for (let i = 0; i < 16; i++) expect(await draw(b)).toBe("month");
    expect(await draw(b)).toBeNull();
    t.clock.set(at("2027-02-01T09:00:00.000Z"));
    expect(await read(b)).toMatchObject({ month: "2027-02", rolled: 0, used: 0, live: false, left: 0 });
    await pay(a, "pro.starter", {}, { businessId: b });
    expect(await read(b)).toMatchObject({ month: "2027-02", rolled: 0, total: 10, left: 10, live: true });

    // case 1 again, on a business nobody has read: the first thing that touches it is a draw, and it rolls first
    t.clock.set(NOW);
    const a1 = await account();
    const b1 = await business(a1);
    await pay(a1, "pro.starter", {}, { businessId: b1 });
    await db.business.update({ where: { id: b1 }, data: { used: 4 } });
    t.clock.set(at("2026-12-20T09:00:00.000Z"));
    await pay(a1, "pro.starter", {}, { businessId: b1 });
    t.clock.set(at("2027-01-05T09:00:00.000Z"));
    expect(await draw(b1)).toBe("month");
    expect(await bizRow(b1)).toMatchObject({ month: "2027-01", rolled: 6, used: 1 });
  });

  it("HH1. late, two months late, rolled wishes first, a short month", async () => {
    t.clock.set(NOW);
    const a = await account();
    const b = await business(a);
    await pay(a, "pro.starter", {}, { businessId: b });
    await db.business.update({ where: { id: b }, data: { used: 4 } });
    t.clock.set(at("2027-01-02T09:00:00.000Z"));
    await pay(a, "pro.studio", {}, { businessId: b });
    const row = await bizRow(b);
    expect(row).toMatchObject({ plan: "studio", allowance: 35, rolled: 6, used: 0, month: "2027-01" });
    expect(row.renews!.toISOString()).toBe("2027-02-02T09:00:00.000Z");
    expect(await read(b)).toMatchObject({ total: 41, left: 41 });

    t.clock.set(NOW);
    const a3 = await account();
    const b3 = await business(a3);
    await pay(a3, "pro.starter", {}, { businessId: b3 });
    await db.business.update({ where: { id: b3 }, data: { used: 4 } });
    t.clock.set(at("2027-03-02T09:00:00.000Z"));
    expect(await read(b3)).toMatchObject({ month: "2027-03", rolled: 0, used: 0, live: false, left: 0, canMake: false });

    t.clock.set(NOW);
    const a4 = await account();
    const b4 = await business(a4);
    await pay(a4, "pro.studio", {}, { businessId: b4 });
    t.clock.set(at("2026-12-28T09:00:00.000Z"));
    await pay(a4, "pro.studio", {}, { businessId: b4 }); // keeps the plan live past the month, so January is open
    await db.business.update({ where: { id: b4 }, data: { used: 40, rolled: 6 } });
    t.clock.set(at("2027-01-03T09:00:00.000Z"));
    expect(await read(b4)).toMatchObject({ month: "2027-01", rolled: 1, used: 0, total: 36 });

    t.clock.set(at("2027-01-31T09:00:00.000Z"));
    const a5 = await account();
    const b5 = await business(a5);
    await pay(a5, "pro.starter", {}, { businessId: b5 });
    expect((await bizRow(b5)).renews!.toISOString()).toBe("2027-02-28T09:00:00.000Z");
    t.clock.set(at("2027-02-10T09:00:00.000Z"));
    await pay(a5, "pro.starter", {}, { businessId: b5 });
    expect((await bizRow(b5)).renews!.toISOString()).toBe("2027-03-28T09:00:00.000Z");
  });

  it("HH2. 10 webhooks and 10 verifies at once on one payment: granted once, no 500, 10 rounds", async () => {
    for (let round = 0; round < 10; round++) {
      const a = await account();
      const token = `pb07-${a}`;
      t.tokens.set(token, { kind: "user", accountId: a, sides: ["person"] });
      const b = await business(a);
      const started = await t.http().post("/v1/payments").set(bearer(token)).set("idempotency-key", `pb07-${a}`).send({ purpose: "wish-pack", packs: 1 });
      expect(started.status).toBe(201);
      const ref = started.body.payment.reference as string;
      const rs = await Promise.all([...Array.from({ length: 10 }, () => hook(ref)), ...Array.from({ length: 10 }, () => verify(token, ref))]);
      expect(rs.filter((r) => r.status >= 500).map((r) => `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)).toEqual([]);
      const p = await paymentRow(ref);
      expect(p.status).toBe("succeeded");
      expect(await grants(p.id)).toHaveLength(1);
      expect(await db.ledgerEntry.count({ where: { paymentId: p.id, direction: "debit" } })).toBeGreaterThan(0);
      expect((await bizRow(b)).pack).toBe(5);
      expect(await db.event.count({ where: { name: "paid", key: ref } })).toBe(1);
    }
  }, 120_000);

  it("HH3. revoking one of two plan payments: the newer plan stands, or the older while still in its period", async () => {
    // starter 1 Dec (to 1 Jan), studio paid early on 10 Dec pushes the end to 1 Feb
    const setup = async () => {
      t.clock.set(NOW);
      const a = await account();
      const b = await business(a);
      const r1 = await pay(a, "pro.starter", {}, { businessId: b });
      t.clock.set(at("2026-12-10T09:00:00.000Z"));
      const r2 = await pay(a, "pro.studio", {}, { businessId: b });
      expect(await bizRow(b)).toMatchObject({ plan: "studio", allowance: 35 });
      return { b, r1, r2 };
    };
    let s = await setup();
    expect((await revoke(s.r1))[0].result).toBe("revoked"); // the older goes: the newer stands
    let row = await bizRow(s.b);
    expect(row).toMatchObject({ plan: "studio", allowance: 35 });
    expect(row.renews!.toISOString()).toBe("2027-02-01T09:00:00.000Z");

    s = await setup();
    expect((await revoke(s.r2))[0].result).toBe("revoked"); // the newer goes: the older stands, still in its period (to 1 Jan)
    row = await bizRow(s.b);
    expect(row).toMatchObject({ plan: "starter", allowance: 10 });
    expect(row.renews!.toISOString()).toBe("2027-01-01T09:00:00.000Z");

    s = await setup();
    t.clock.set(at("2027-01-05T09:00:00.000Z")); // the older's period is over by the time the newer is refunded
    await revoke(s.r2);
    expect(await bizRow(s.b)).toMatchObject({ plan: null, allowance: null, renews: null });
    expect((await revoke(s.r2))[0].result).toBe("already_revoked");

    // a wish pack with 2 of 5 used: 3 are left and they go; two packs, 2 used, refund one: 3 are left
    t.clock.set(NOW);
    const a = await account();
    const b = await business(a);
    const p1 = await pay(a, "pro.pack", {}, { businessId: b });
    expect(await draw(b)).toBe("pack");
    expect(await draw(b)).toBe("pack");
    expect((await bizRow(b)).pack).toBe(3);
    await revoke(p1);
    expect(await bizRow(b)).toMatchObject({ pack: 0, plan: null, packEnds: null });
    const p2 = await pay(a, "pro.pack", {}, { businessId: b });
    await pay(a, "pro.pack", {}, { businessId: b });
    await draw(b);
    await draw(b);
    expect((await bizRow(b)).pack).toBe(8);
    await revoke(p2);
    expect((await bizRow(b)).pack).toBe(3);

    // the creator plan and Signed work the same way
    const c = await account();
    const c1 = await pay(c, "creator.plan");
    t.clock.set(at("2026-12-10T09:00:00.000Z"));
    const c2 = await pay(c, "creator.plan");
    const s1 = await pay(c, "creator.signed");
    await pay(c, "creator.signed");
    await revoke(s1);
    expect((await db.creatorState.findUniqueOrThrow({ where: { accountId: c } })).signed).toBe(true);
    await revoke(c1);
    expect(await db.creatorState.findUniqueOrThrow({ where: { accountId: c } })).toMatchObject({ plan: "creator", credits: 13, reviewsLeft: 2 });
    await revoke(c2);
    expect(await db.creatorState.findUniqueOrThrow({ where: { accountId: c } })).toMatchObject({ plan: "open", credits: 3, reviewsLeft: 0, renews: null });
  });

  it("HH4. revoking one of two keeps works the end, keep, keptBy and keptUntil out again from the keeps that remain", async () => {
    t.clock.set(FAR);
    const a = await account();
    const ends = new Date(FAR.getTime() + 5 * DAY);
    const w = await liveWish(a, ends, { keptBy: "now_showing", keptUntil: ends });
    const k1 = await pay(a, "keep.month", { subjectId: w });
    const k2 = await pay(a, "keep.half", { subjectId: w });
    let row = await wishRow(w);
    expect(row).toMatchObject({ keep: "half", keptBy: "keep" });
    expect(row.endsAt!.getTime()).toBe(ends.getTime() + 212 * DAY);
    await revoke(k2); // the half goes: the month remains
    row = await wishRow(w);
    expect(row).toMatchObject({ keep: "month", keptBy: "keep" });
    expect(row.endsAt!.getTime()).toBe(ends.getTime() + 30 * DAY);
    expect(row.keptUntil!.getTime()).toBe(row.endsAt!.getTime());
    await revoke(k1); // the last goes: the wish is as it was before any keep
    row = await wishRow(w);
    expect(row).toMatchObject({ keep: null, keptBy: "now_showing" }); // a mark this code does not own is left as it was
    expect(row.endsAt!.getTime()).toBe(ends.getTime());
    expect(row.keptUntil!.getTime()).toBe(ends.getTime());

    // the older of two goes: the newer stands and its mark is the end
    const w2 = await liveWish(a, ends);
    const m1 = await pay(a, "keep.month", { subjectId: w2 });
    await pay(a, "keep.half", { subjectId: w2 });
    await revoke(m1);
    row = await wishRow(w2);
    expect(row).toMatchObject({ keep: "half", keptBy: "keep" });
    expect(row.endsAt!.getTime()).toBe(ends.getTime() + 182 * DAY);
    expect(row.keptUntil!.getTime()).toBe(row.endsAt!.getTime());
  });

  it("J7. a month keep bought after a year keep leaves the label on the year; revoking the year leaves the month", async () => {
    t.clock.set(FAR);
    const a = await account();
    const ends = new Date(FAR.getTime() + 5 * DAY);
    const w = await liveWish(a, ends);
    const y = await pay(a, "keep.year", { subjectId: w });
    await pay(a, "keep.month", { subjectId: w });
    let row = await wishRow(w);
    expect(row).toMatchObject({ keep: "year", keptBy: "keep" });
    expect(row.endsAt!.getTime()).toBe(ends.getTime() + 395 * DAY);
    await revoke(y);
    row = await wishRow(w);
    expect(row).toMatchObject({ keep: "month", keptBy: "keep" });
  });

  it("HH5. a payment for an erased account is recorded and flagged account_erased (refund_due is the payments service's: see the hand-back)", async () => {
    const a = await account();
    await db.account.update({ where: { id: a }, data: { erasedAt: NOW } });
    const book = await db.price.findFirstOrThrow({ where: { sku: "pass.year" }, orderBy: { version: "desc" } });
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: a, payerContact: "x@example.com", purpose: "pass", lines: [{ sku: "pass.year", name: "pass", qty: 1, unitKobo: Number(book.listKobo), totalKobo: Number(book.listKobo) }],
        amountKobo: book.listKobo, currency: "NGN", priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference,
        idempotencyKey: `${a}:${id}`, channel: "card", options: { request: { purpose: "pass" }, server: { fingerprint: id } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: book.listKobo, currency: "NGN", paidAt: NOW });
    expect(out.outcome).toBe("recorded_unfulfilled");
    const p = await paymentRow(reference);
    expect(p.flags).toContain("account_erased");
    expect(await grants(p.id)).toHaveLength(0);
    expect(await db.passMembership.count({ where: { accountId: a } })).toBe(0);
  });

  it("HH6. a handler grants only to the payer's own business: owner or a live login, else refund_due", async () => {
    const owner = await account();
    const b = await business(owner);
    const stranger = await account();
    for (const [sku, qty] of [["pro.starter", 1], ["pro.pack", 1], ["vault.block", 1]] as const) {
      const ref = await pay(stranger, sku, {}, { businessId: b, qty });
      const p = await paymentRow(ref);
      expect(p.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:business_not_payers"]));
      expect((await grants(p.id))[0].refusedReason).toBe("business_not_payers");
    }
    expect(await bizRow(b)).toMatchObject({ plan: null, pack: null, renews: null });

    const member = await account("member.pb07@example.com");
    await db.login.create({ data: { id: ids.next(), contact: "member.pb07@example.com", status: "active", businessId: b } });
    const ok = await pay(member, "pro.pack", {}, { businessId: b });
    expect((await paymentRow(ok)).flags).toEqual([]);
    expect((await bizRow(b)).pack).toBe(5);

    const invited = await account("invited.pb07@example.com");
    await db.login.create({ data: { id: ids.next(), contact: "invited.pb07@example.com", status: "invited", businessId: b } });
    const not = await pay(invited, "pro.pack", {}, { businessId: b });
    expect((await paymentRow(not)).flags).toContain("refund_due:business_not_payers");
    expect((await bizRow(b)).pack).toBe(5);

    const gone = await account("gone.pb07@example.com");
    await db.login.create({ data: { id: ids.next(), contact: "gone.pb07@example.com", status: "removed", businessId: b } });
    const no = await pay(gone, "pro.pack", {}, { businessId: b });
    expect((await paymentRow(no)).flags).toContain("refund_due:business_not_payers");
    expect((await bizRow(b)).pack).toBe(5);
  });

  it("HH7. a draw takes the month's pool only while the plan is live; pack wishes do not expire", async () => {
    const a = await account();
    const b = await business(a);
    await pay(a, "pro.starter", {}, { businessId: b });
    await pay(a, "pro.pack", {}, { businessId: b });
    expect(await draw(b)).toBe("month");
    t.clock.set(at("2027-01-05T09:00:00.000Z")); // the plan ended 1 Jan
    expect(await read(b)).toMatchObject({ live: false, left: 0, pack: 5, canMake: true });
    expect(await draw(b)).toBe("pack");
    t.clock.set(at("2027-06-05T09:00:00.000Z")); // the pack's 90 days are long gone: its wishes stay
    for (let i = 0; i < 4; i++) expect(await draw(b)).toBe("pack");
    expect(await draw(b)).toBeNull();
    const row = await bizRow(b);
    expect(row.pack).toBe(0);
    expect(row.used).toBe(0); // rolled into June with nothing owed to the month
  });

  it("HH8. a ticket line is started by its id for every ticket (the contract's ticket field is HALT; id carries the line)", async () => {
    const a = await account();
    const token = `pb07-${a}`;
    t.tokens.set(token, { kind: "user", accountId: a, sides: ["person"] });
    for (const id of ["moment", "keepsake", "signature", "premiere"]) {
      const w = await wish(a);
      const r = await t.http().post("/v1/payments").set(bearer(token)).set("idempotency-key", `pb07-${a}-${id}`).send({ purpose: "ticket", id, subjectId: w });
      expect(r.status).toBe(201);
      expect((await paymentRow(r.body.payment.reference)).lines).toMatchObject([{ sku: `ticket.${id}` }]);
    }
  });

  it("HH9. two keeps at once both count, one after the other, in either order, again and again", async () => {
    // The cause: not the handler. The two keeps queue on the wish row and the second adds to the first (a wish is read under its row
    // lock). The failure came from the other specs sharing the database: wishes.contract.spec and jobs.spec call jobs.runDue() with
    // no subject keys, on their own clocks, so a rest-wish job this keep had just scheduled (ends + 30 days) was due on THEIR clock
    // and was run by THEIR app: the wish went to resting under this test, and a keep on a resting wish wakes it from now, so endsAt
    // came out as now + 30 days. This test runs on a clock no other spec reaches, and the wish stays live.
    t.clock.set(FAR);
    const a = await account();
    for (let round = 0; round < 6; round++) {
      const ends = new Date(FAR.getTime() + 5 * DAY);
      const w = await liveWish(a, ends);
      const order = round % 2 ? ["keep.half", "keep.month"] : ["keep.month", "keep.half"];
      const refs = await Promise.all(order.map((sku) => pay(a, sku, { subjectId: w })));
      const row = await wishRow(w);
      expect(row.status).toBe("live");
      expect(row.endsAt!.getTime()).toBe(ends.getTime() + 212 * DAY);
      for (const r of refs) expect((await paymentRow(r)).flags).toEqual([]);
    }
  });

  it("PROOF seeded lines: every line grants exactly what the app says", async () => {
    const ent = await t.app.get(EntitlementsService).row();
    const a = await account();
    const pro = await account();
    const b = await business(pro);
    const tk = async (sku: string) => {
      const w = await wish(a);
      const ref = await pay(a, sku, { subjectId: w });
      const g = (await grants((await paymentRow(ref)).id))[0];
      expect((await wishRow(w)).ticket).toBe(sku.slice("ticket.".length));
      expect((await db.event.findFirstOrThrow({ where: { name: "paid", key: ref } })).wishId).toBe(w);
      return g.detail;
    };
    // the app (lib/catalog.ts): term days and photos of each ticket
    expect(await tk("ticket.moment")).toMatchObject({ termDays: 7, photos: 6 });
    expect(await tk("ticket.keepsake")).toMatchObject({ termDays: 14, photos: 15 });
    expect(await tk("ticket.signature")).toMatchObject({ termDays: 30, photos: 15 });
    expect(await tk("ticket.premiere")).toMatchObject({ termDays: 60, photos: 20 });
    // extras: each one lands on a wish whose ticket takes it
    for (const sku of ["extra.five-photos", "extra.premium-style", "extra.portrait-video", "extra.qr-card", "extra.clip-15s", "extra.clip-60s"]) {
      const ticket = ["signature", "premiere", "moment", "keepsake"].find((x) => (grantOf(ent, `ticket.${x}`)?.takes as string[] | undefined)?.includes(sku) && x !== "keepsake") ?? "keepsake";
      const w = await wish(a, { ticket });
      const ref = await pay(a, sku, { subjectId: w });
      expect((await paymentRow(ref)).flags).toEqual([]);
      expect((await wishRow(w)).adds).toEqual([sku]);
      expect((await grants((await paymentRow(ref)).id))[0].detail).toMatchObject({ extra: sku });
    }
    // keeps: 30, 182, 365 days from the end of a showing wish, never discounted
    t.clock.set(FAR);
    for (const [sku, days] of [["keep.month", 30], ["keep.half", 182], ["keep.year", 365]] as const) {
      const ends = new Date(FAR.getTime() + 3 * DAY);
      const w = await liveWish(a, ends);
      await pay(a, sku, { subjectId: w });
      expect((await wishRow(w)).endsAt!.getTime()).toBe(ends.getTime() + days * DAY);
      expect((await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } })).promoKobo).toBeNull();
    }
    t.clock.set(NOW);
    // the Pass: 20 wishes, 4 upgrades, a year, 20% off Concierge recorded
    const pr = await pay(a, "pass.year");
    expect((await grants((await paymentRow(pr)).id))[0].detail).toMatchObject({ wishes: 20, upgrades: 4, termDays: 365, conciergeDiscountPercent: 20 });
    expect((await db.passMembership.findFirstOrThrow({ where: { accountId: a } })).validUntil).toBe(new Date(NOW.getTime() + 365 * DAY).toISOString());
    // Pro: 10 and 35 a month; a pack 5 wishes and 20 GB for 90 days, per pack
    await pay(pro, "pro.starter", {}, { businessId: b });
    expect(await bizRow(b)).toMatchObject({ plan: "starter", allowance: 10 });
    await pay(pro, "pro.studio", {}, { businessId: b });
    expect(await bizRow(b)).toMatchObject({ plan: "studio", allowance: 35 });
    const pk = await pay(pro, "pro.pack", {}, { businessId: b, qty: 2 });
    expect(await bizRow(b)).toMatchObject({ pack: 10 });
    expect((await bizRow(b)).packEnds!.getTime()).toBe(NOW.getTime() + 90 * DAY);
    expect((await grants((await paymentRow(pk)).id))[0].detail).toMatchObject({ wishes: 10, vaultGb: 40, days: 90 });
    // Vault space: blocks of 100 GB for 30 days
    for (const sku of ["vault.block", "vault.block-bulk"]) {
      const v = await pay(pro, sku, {}, { businessId: b, qty: 2 });
      const g = (await grants((await paymentRow(v)).id))[0];
      expect(g.detail).toMatchObject({ gb: 200, blocks: 2 });
      expect(g.endsAt!.getTime()).toBe(NOW.getTime() + 30 * DAY);
    }
    expect(await db.$transaction((tx) => biz.extraGb(tx, b))).toBe(400);
    // the creator lines: plan 10 credits and 2 reviews, a pack 5 credits, a review 1, Signed
    const c = await account();
    await pay(c, "creator.plan");
    await pay(c, "creator.credit-pack", {}, { qty: 2 });
    await pay(c, "creator.extra-review", {}, { qty: 3 });
    await pay(c, "creator.signed");
    expect(await db.creatorState.findUniqueOrThrow({ where: { accountId: c } })).toMatchObject({ plan: "creator", credits: 23, reviewsLeft: 2, packs: 2, extraReviews: 3, signed: true });
    const order = ids.next();
    const cr = await pay(c, "concierge.single", { subjectId: order });
    expect((await grants((await paymentRow(cr)).id))[0].detail).toMatchObject({ orderId: order });
    // and every one of these can be taken back, and taken back twice changes nothing
    const refs = (await db.payment.findMany({ where: { accountId: { in: [a, pro, c] } } })).map((p) => p.providerReference);
    for (const r of refs) await revoke(r);
    const again = [];
    for (const r of refs) again.push(...(await revoke(r)));
    expect(again.every((x) => ["already_revoked", "refused_line"].includes(x.result) || x.result === "kept_wish_is_sealed")).toBe(true);
  });

  it("PROOF the Pass with 1 left and 30 draws at once: one yes; allowance 3 and pack 5 with 20 draws: exactly 8, allowance first", async () => {
    const a = await account();
    const ref = await pay(a, "pass.year");
    const m = await db.passMembership.findUniqueOrThrow({ where: { paymentId: (await paymentRow(ref)).id } });
    await db.passMembership.update({ where: { id: m.id }, data: { wishesUsed: 19 } });
    const rs = await Promise.all(Array.from({ length: 30 }, () => db.$transaction((tx) => pass.draw(tx, a, "wishes"))));
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(20);

    const o = await account();
    const b = await business(o);
    await pay(o, "pro.starter", {}, { businessId: b });
    await db.business.update({ where: { id: b }, data: { allowance: 3 } });
    await pay(o, "pro.pack", {}, { businessId: b });
    const ds = await Promise.all(Array.from({ length: 20 }, () => draw(b)));
    expect(ds.filter((x) => x === "month")).toHaveLength(3);
    expect(ds.filter((x) => x === "pack")).toHaveLength(5);
    expect(ds.filter((x) => x === null)).toHaveLength(12);
    expect(await bizRow(b)).toMatchObject({ used: 3, pack: 0 });
    // allowance first: with both open, the first draws are the month's
    const o2 = await account();
    const b2 = await business(o2);
    await pay(o2, "pro.starter", {}, { businessId: b2 });
    await db.business.update({ where: { id: b2 }, data: { allowance: 3 } });
    await pay(o2, "pro.pack", {}, { businessId: b2 });
    expect([await draw(b2), await draw(b2), await draw(b2), await draw(b2)]).toEqual(["month", "month", "month", "pack"]);
  });

  it("PROOF a handler that throws leaves nothing: no grant, no ledger, no event, the payment stays pending, a retry grants once", async () => {
    t.clock.set(FAR);
    const a = await account();
    const w = await liveWish(a, new Date(FAR.getTime() + 5 * DAY));
    const real = registry.get("keep.month")!;
    registry.replace("keep.month", async (ctx) => {
      await real(ctx);
      throw new Error("handler broke after real work");
    });
    try {
      const book = await db.price.findFirstOrThrow({ where: { sku: "keep.month" }, orderBy: { version: "desc" } });
      const id = ids.next();
      const reference = `fw-${id}`;
      await db.payment.create({
        data: {
          id, accountId: a, payerContact: "x@example.com", purpose: "keep", subjectId: w, lines: [{ sku: "keep.month", name: "keep", qty: 1, unitKobo: Number(book.listKobo), totalKobo: Number(book.listKobo) }],
          amountKobo: book.listKobo, currency: "NGN", priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference,
          idempotencyKey: `${a}:${id}`, channel: "card", options: { request: { purpose: "keep", subjectId: w }, server: { fingerprint: id } },
        },
      });
      const before = await wishRow(w);
      const answer = { reference, status: "success" as const, amountKobo: book.listKobo, currency: "NGN", paidAt: FAR };
      await expect(settle.settle(answer)).rejects.toThrow("handler broke");
      const p = await paymentRow(reference);
      expect(p.status).toBe("pending");
      expect(await grants(p.id)).toHaveLength(0);
      expect(await db.ledgerEntry.count({ where: { paymentId: p.id } })).toBe(0);
      expect(await db.event.count({ where: { name: "paid", key: reference } })).toBe(0);
      expect((await wishRow(w)).endsAt!.getTime()).toBe(before.endsAt!.getTime());
      registry.replace("keep.month", real);
      expect((await settle.settle(answer)).outcome).toBe("fulfilled");
      expect(await grants(p.id)).toHaveLength(1);
      expect((await wishRow(w)).endsAt!.getTime()).toBe(before.endsAt!.getTime() + 30 * DAY);
    } finally {
      registry.replace("keep.month", real);
    }
  });
});
