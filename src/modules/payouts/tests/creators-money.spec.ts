import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { PortTimeoutError } from "../../../common/ports/time-limit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { RoyaltiesService } from "../../royalties/royalties.service";
import { percentOf, splitRoyalty } from "../../royalties/royalty-math";
import { readStyleOwners } from "../../royalties/style-owners";
import { PayoutRunService, REFERENCE_PREFIX } from "../payout-run.service";
import { PayoutProviderPort } from "../payout-provider.port";
import { StandinPayoutProvider } from "../standin-payout-provider";
import { nextFifth } from "../payouts.module";

/* B16: creators' money, on a real database. The app's clock stands on 6 December 2026, so "last month" is 2026-11. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-06T09:00:00.000Z");
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const PREMIUM = 400000n; // list price of extra.premium-style; 240000 while 40% off: the royalty is 80000 or 48000
let seq = 0;

describe("creators' money (B16)", () => {
  let t: TestApp;
  let db: PrismaService;
  let royalties: RoyaltiesService;
  let runs: PayoutRunService;
  let provider: StandinPayoutProvider;
  const tag = `b16${process.pid}`;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    royalties = t.app.get(RoyaltiesService);
    runs = t.app.get(PayoutRunService);
    provider = t.app.get<StandinPayoutProvider>(PayoutProviderPort);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    for (const role of ["owner", "finance", "ops", "reviewer", "support"] as const) {
      t.tokens.set(`staff-${role}`, { kind: "staff", staffId: ids.next(), roles: [role] });
    }
  });
  afterAll(() => t.close());
  beforeEach(() => {
    provider.refusing(null);
  });

  async function creator(handle: string, opts: { house?: boolean; bank?: boolean } = {}) {
    const accountId = ids.next();
    const creatorId = ids.next();
    const n = ++seq;
    await db.account.create({ data: { id: accountId, contact: `${tag}-${n}@example.com`, handle: `${tag}${n}`.slice(0, 20), name: handle, sides: ["person", "creator"], lastSide: "creator" } });
    await db.creator.create({ data: { id: creatorId, accountId, name: handle, house: opts.house ?? false } });
    const token = `c-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", "creator"] });
    let bankId: string | null = null;
    if (opts.bank !== false) {
      bankId = ids.next();
      await db.bankAccount.create({ data: { id: bankId, creatorId, accountNumber: "0123456789", bankCode: "058" } });
    }
    return { accountId, creatorId, token, bankId };
  }
  async function style(slug: string, level: string, creatorDoc: Record<string, unknown> | null, house = false) {
    const s = `${tag}-${slug}`;
    await db.style.create({ data: { id: ids.next(), slug: s, level, tier: level, name: slug, house, on: true, creator: (creatorDoc ?? undefined) as never } });
    return s;
  }
  async function person() {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `${tag}-p${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    return id;
  }
  async function business() {
    const accountId = await person();
    const id = ids.next();
    await db.business.create({ data: { id, accountId } });
    return { accountId, id };
  }
  /** A paid payment row, as the settle leaves it, for a wish in `styleSlug`. */
  async function paid(o: { styleSlug: string; sku?: string; at: string; amount?: bigint; businessId?: string; accountId?: string; purpose?: "ticket" | "pass" | "extra" }) {
    const accountId = o.accountId ?? (await person());
    const sku = o.sku ?? "ticket.keepsake";
    const amount = o.amount ?? 1_500_000n;
    const n = ++seq;
    const wishId = ids.next();
    return db.payment.create({
      data: {
        id: ids.next(), accountId, businessId: o.businessId ?? null, purpose: o.purpose ?? "ticket", subjectId: wishId,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(amount), totalKobo: Number(amount) }], amountKobo: amount, currency: "NGN", priceBookVersion: 1,
        status: "succeeded", provider: "paystack", providerReference: `${tag}-ref-${n}`, idempotencyKey: `${tag}-key-${n}`, verifiedAt: new Date(o.at), createdAt: new Date(o.at),
        options: { request: { purpose: "ticket", subjectId: wishId, options: { style: o.styleSlug } }, server: { fingerprint: "x" } },
      },
    });
  }
  const accrue = (p: Awaited<ReturnType<typeof paid>>) => db.$transaction((tx) => royalties.accrue(tx, p));
  const rowsOf = (creatorId: string) => db.royaltyAccrual.findMany({ where: { creatorId }, orderBy: { id: "asc" } });
  async function journals(where: Record<string, unknown>) {
    const entries = await db.ledgerEntry.findMany({ where });
    const sums = new Map<string, bigint>();
    for (const e of entries) sums.set(e.journalId, (sums.get(e.journalId) ?? 0n) + (e.direction === "debit" ? e.amountKobo : -e.amountKobo));
    return { entries, unbalanced: [...sums.values()].filter((v) => v !== 0n) };
  }
  const payable = async (creatorId: string) => {
    const e = await db.ledgerEntry.findMany({ where: { account: "royalties_payable", memo: { contains: creatorId } } });
    return e.reduce((n, x) => n + (x.direction === "credit" ? x.amountKobo : -x.amountKobo), 0n);
  };

  describe("1. accrual", () => {
    it("T-65: a person's paid wish in a creator's Premium style earns 20% of the premium price in force (the royalty is 80000 at list, 48000 while 40% off)", async () => {
      const c = await creator("Ada");
      const s = await style("ada-premium", "premium", { creatorId: c.creatorId });
      const promo = await accrue(await paid({ styleSlug: s, at: "2026-11-10T10:00:00Z" }));
      expect(promo).toMatchObject([{ creatorId: c.creatorId, basis: "premium_style", amountKobo: 48000n }]);
      const list = await accrue(await paid({ styleSlug: s, at: "2027-02-10T10:00:00Z" }));
      expect(list[0].amountKobo).toBe(percentOf(PREMIUM, 20));
      expect(list[0].amountKobo).toBe(80000n);
      const rows = await rowsOf(c.creatorId);
      expect(rows.map((r) => [r.basis, r.amountKobo, r.month, r.styleSlug])).toEqual([["premium_style", 48000n, "2026-11", s], ["premium_style", 80000n, "2027-02", s]]);
    });

    it("T-66: a business's paid wish earns 20% of what the business paid, whatever the premium price is", async () => {
      const c = await creator("Bola");
      const s = await style("bola-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      const made = await accrue(await paid({ styleSlug: s, at: "2026-11-11T10:00:00Z", amount: 2_500_000n, businessId: b.id, accountId: b.accountId }));
      expect(made).toMatchObject([{ basis: "pro_wish", amountKobo: 500000n }]);
    });

    it("T-77: a Pass wish earns nothing (no payment of its own, and the Pass payment names no style); Standard, Starter, house and style-less payments earn nothing", async () => {
      const c = await creator("Chi");
      const premium = await style("chi-premium", "premium", { creatorId: c.creatorId });
      const standard = await style("chi-standard", "standard", { creatorId: c.creatorId });
      const starter = await style("chi-starter", "starter", { creatorId: c.creatorId });
      const house = await style("chi-house", "premium", null, true);
      expect(await accrue(await paid({ styleSlug: premium, sku: "pass.year", purpose: "pass", at: "2026-11-10T10:00:00Z" }))).toEqual([]);
      for (const s of [standard, starter, house, `${tag}-nope`]) expect(await accrue(await paid({ styleSlug: s, at: "2026-11-10T10:00:00Z" }))).toEqual([]);
      expect(await rowsOf(c.creatorId)).toEqual([]);
    });

    it("T-67: a style made from a template gives a quarter of the royalty to the original creator, out of it, not on top", async () => {
      const maker = await creator("Dayo");
      const original = await creator("Eze");
      const s = await style("dayo-from-eze", "premium", { creatorId: maker.creatorId, templateCreatorId: original.creatorId });
      const made = await accrue(await paid({ styleSlug: s, at: "2026-11-10T10:00:00Z" }));
      expect(made.map((m) => [m.creatorId, m.basis, m.amountKobo])).toEqual([[maker.creatorId, "premium_style", 36000n], [original.creatorId, "template_share", 12000n]]);
      expect(made.reduce((n, m) => n + m.amountKobo, 0n)).toBe(48000n);
      expect(readStyleOwners({ id: maker.creatorId, template: { creatorId: original.creatorId } })).toEqual({ creatorId: maker.creatorId, templateCreatorId: original.creatorId });
    });

    it("half a kobo rounds down to the creator and the rest stays with Firstwish", async () => {
      expect(percentOf(240005n, 20)).toBe(48001n);
      expect(splitRoyalty(48001n, 25, true)).toEqual({ template: 12000n, creator: 36001n });
      expect(percentOf(1003n, 20)).toBe(200n);
      const c = await creator("Fola");
      const s = await style("fola-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      const made = await accrue(await paid({ styleSlug: s, at: "2026-11-11T10:00:00Z", amount: 4003n, businessId: b.id, accountId: b.accountId }));
      expect(made[0].amountKobo).toBe(800n); // 800.6 kobo
    });

    it("one accrual per payment and creator: a replay changes nothing; a second payment for the same wish earns nothing more", async () => {
      const c = await creator("Gift");
      const s = await style("gift-premium", "premium", { creatorId: c.creatorId });
      const p = await paid({ styleSlug: s, at: "2026-11-10T10:00:00Z" });
      expect(await accrue(p)).toHaveLength(1);
      const before = await journals({ paymentId: p.id });
      expect(await accrue(p)).toEqual([]);
      expect(await rowsOf(c.creatorId)).toHaveLength(1);
      expect((await journals({ paymentId: p.id })).entries).toHaveLength(before.entries.length);
      const again = await db.payment.create({ data: { ...p, id: ids.next(), providerReference: `${p.providerReference}-2`, idempotencyKey: `${p.idempotencyKey}-2` } as never });
      expect(await accrue(again)).toEqual([]);
      const racing = await paid({ styleSlug: s, at: "2026-11-12T10:00:00Z" });
      const both = await Promise.all([accrue(racing), accrue(racing), accrue(racing)]);
      expect(both.flat()).toHaveLength(1);
    });

    it("an erased creator, and a house creator, earn nothing", async () => {
      const c = await creator("Hope");
      const s = await style("hope-premium", "premium", { creatorId: c.creatorId });
      await t.app.get(AccountErasureService).erase(c.accountId, { actor: { type: "system", id: null, requestId: "r" }, reason: null });
      expect(await accrue(await paid({ styleSlug: s, at: "2026-11-10T10:00:00Z" }))).toEqual([]);
      const h = await creator("House", { house: true, bank: false });
      const hs = await style("house-owned", "premium", { creatorId: h.creatorId });
      expect(await accrue(await paid({ styleSlug: hs, at: "2026-11-10T10:00:00Z" }))).toEqual([]);
    });
  });

  describe("3 and 5. the ledger, the summary and the run (worked by hand)", () => {
    it("the summary equals the ledger; the run pays the whole balance once, sends keyed by the payout id, and the signed event pays it", async () => {
      const a = await creator("Ife");
      const s = await style("ife-premium", "premium", { creatorId: a.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-11-10T10:00:00Z" })); //  48000
      await accrue(await paid({ styleSlug: s, at: "2026-11-12T10:00:00Z" })); //  48000
      await accrue(await paid({ styleSlug: s, at: "2026-11-20T10:00:00Z", amount: 2_500_000n, businessId: b.id, accountId: b.accountId })); // 500000
      await accrue(await paid({ styleSlug: s, at: "2026-12-02T10:00:00Z" })); // 48000, this month
      const thin = await creator("Jide");
      const ts = await style("jide-premium", "premium", { creatorId: thin.creatorId });
      await accrue(await paid({ styleSlug: ts, at: "2026-11-10T10:00:00Z" })); // 48000, under the threshold

      // before the run: this month 48000, waiting 644000 (48000 + 48000 + 500000 + 48000), paid 0
      expect(await royalties.summary(a.creatorId)).toEqual({ thisMonthKobo: 48000, waitingKobo: 644000, sendingKobo: 0, paidKobo: 0, byStyle: [{ styleSlug: s, amountKobo: 644000 }] });
      expect(await payable(a.creatorId)).toBe(644000n);

      const first = await runs.run("2026-11");
      expect(first.created).toBeGreaterThanOrEqual(1);
      const mine = await db.payout.findMany({ where: { creatorId: a.creatorId } });
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ month: "2026-11", amountKobo: 596000n, status: "sent", bankAccountId: a.bankId });
      expect(await db.payout.count({ where: { creatorId: thin.creatorId } })).toBe(0); // 48000 is under 500000: it carries over
      expect(await royalties.balance(db, thin.creatorId, "2026-11")).toBe(48000n);
      const asked = provider.asked.filter((x) => x.reference === REFERENCE_PREFIX + mine[0].id);
      expect(asked).toHaveLength(1);
      expect(asked[0]).toMatchObject({ bankCode: "058", accountNumber: "0123456789" });
      expect(asked[0].amount.kobo).toBe(596000);

      // run twice: nothing new
      const second = await runs.run("2026-11");
      expect(second.created).toBe(0);
      expect(await db.payout.count({ where: { creatorId: a.creatorId } })).toBe(1);
      expect(provider.asked.filter((x) => x.reference === REFERENCE_PREFIX + mine[0].id)).toHaveLength(1);

      // the provider's signed event marks it paid; never before
      expect((await db.payout.findUniqueOrThrow({ where: { id: mine[0].id } })).status).toBe("sent");
      const ev = await db.webhookEvent.create({ data: { id: ids.next(), provider: "paystack", eventId: `transfer.success:${seq}:${mine[0].id}`, type: "transfer.success", signatureValid: true, payload: {} } });
      await runs.apply(ev.id, "transfer.success", { reference: REFERENCE_PREFIX + mine[0].id, amount: 596000 });
      expect((await db.payout.findUniqueOrThrow({ where: { id: mine[0].id } })).status).toBe("succeeded");
      expect(await db.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ outcome: "paid" });
      expect(await db.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } }).then((e) => e.processedAt)).not.toBeNull();

      // after: this month 48000, waiting 48000, paid 596000; and the ledger says the same
      expect(await royalties.summary(a.creatorId)).toEqual({ thisMonthKobo: 48000, waitingKobo: 48000, sendingKobo: 0, paidKobo: 596000, byStyle: [{ styleSlug: s, amountKobo: 644000 }] });
      expect(await payable(a.creatorId)).toBe(48000n);
      const paidOut = await db.ledgerEntry.findMany({ where: { payoutId: mine[0].id } });
      expect(paidOut.map((e) => [e.account, e.direction, e.amountKobo]).sort()).toEqual([["payouts", "credit", 596000n], ["royalties_payable", "debit", 596000n]]);
      // every journal sums to zero, integer kobo
      const j = await journals({ OR: [{ memo: { contains: a.creatorId } }, { payoutId: mine[0].id }] });
      expect(j.entries.length).toBeGreaterThanOrEqual(10);
      expect(j.unbalanced).toEqual([]);
    });

    it("the run refuses a month that is not over; an unknown or odd event changes nothing", async () => {
      await expect(runs.run("2026-12")).rejects.toMatchObject({ code: "validation_failed" });
      await expect(runs.run("2027-01")).rejects.toMatchObject({ code: "validation_failed" });
      await expect(runs.run("last month")).rejects.toMatchObject({ code: "validation_failed" });
      const ev = await db.webhookEvent.create({ data: { id: ids.next(), provider: "paystack", eventId: `transfer.success:${++seq}:x`, type: "transfer.success", signatureValid: true, payload: {} } });
      await runs.apply(ev.id, "transfer.success", { reference: "someone-else" });
      expect(await db.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ outcome: "unknown_reference" });
    });

    it("5 runs at once make one set of payouts and ask the provider once for each", async () => {
      const cs = [];
      for (const name of ["Kemi", "Lola", "Moyo"]) {
        const c = await creator(name);
        const s = await style(`${name}-premium`.toLowerCase(), "premium", { creatorId: c.creatorId });
        const b = await business();
        await accrue(await paid({ styleSlug: s, at: "2026-11-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId })); // 600000
        cs.push(c);
      }
      await Promise.all([1, 2, 3, 4, 5].map(() => runs.run("2026-11")));
      for (const c of cs) {
        const rows = await db.payout.findMany({ where: { creatorId: c.creatorId } });
        expect(rows).toHaveLength(1);
        expect(rows[0].amountKobo).toBe(600000n);
        expect(provider.asked.filter((x) => x.reference === REFERENCE_PREFIX + rows[0].id)).toHaveLength(1);
        expect(await db.ledgerEntry.count({ where: { payoutId: rows[0].id } })).toBe(2);
      }
    });

    it("a refusal marks the payout failed and the balance returns; the next month's run pays it", async () => {
      const c = await creator("Nene");
      const s = await style("nene-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-10-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      provider.refusing("Account is closed.");
      await runs.run("2026-10");
      const p = await db.payout.findFirstOrThrow({ where: { creatorId: c.creatorId } });
      expect(p.status).toBe("failed");
      expect(await royalties.balance(db, c.creatorId, null)).toBe(600000n);
      expect(await payable(c.creatorId)).toBe(600000n);
      const j = await journals({ payoutId: p.id });
      expect(j.entries).toHaveLength(4);
      expect(j.unbalanced).toEqual([]);
      provider.refusing(null);
      await runs.run("2026-10"); // (creator, month) is unique: the failed row stands, nothing new
      expect(await db.payout.count({ where: { creatorId: c.creatorId } })).toBe(1);
      t.clock.set(new Date("2027-01-06T09:00:00Z"));
      await runs.run("2026-12");
      t.clock.set(NOW);
      const next = await db.payout.findMany({ where: { creatorId: c.creatorId, month: "2026-12" } });
      expect(next).toMatchObject([{ amountKobo: 600000n, status: "sent" }]);
    });

    it("a time-out leaves the payout sent, never paid; a failed event after that gives the balance back", async () => {
      const c = await creator("Ola");
      const s = await style("ola-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-09-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      const spy = jest.spyOn(provider, "transfer").mockRejectedValueOnce(new PortTimeoutError("payments", "transfer", 1));
      await runs.run("2026-09");
      spy.mockRestore();
      const p = await db.payout.findFirstOrThrow({ where: { creatorId: c.creatorId } });
      expect(p).toMatchObject({ status: "sent", providerReference: null });
      const ev = await db.webhookEvent.create({ data: { id: ids.next(), provider: "paystack", eventId: `transfer.failed:${++seq}:${p.id}`, type: "transfer.failed", signatureValid: true, payload: {} } });
      await runs.apply(ev.id, "transfer.failed", { reference: REFERENCE_PREFIX + p.id });
      expect((await db.payout.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("failed");
      expect(await royalties.balance(db, c.creatorId, null)).toBe(600000n);
      // a late success after a failure does not pay it
      const late = await db.webhookEvent.create({ data: { id: ids.next(), provider: "paystack", eventId: `transfer.success:${++seq}:${p.id}`, type: "transfer.success", signatureValid: true, payload: {} } });
      await runs.apply(late.id, "transfer.success", { reference: REFERENCE_PREFIX + p.id });
      expect((await db.payout.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("failed");
    });

    it("an amount that is not the payout's marks the event and changes nothing", async () => {
      const c = await creator("Pere");
      const s = await style("pere-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-08-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      await runs.run("2026-08");
      const p = await db.payout.findFirstOrThrow({ where: { creatorId: c.creatorId } });
      const ev = await db.webhookEvent.create({ data: { id: ids.next(), provider: "paystack", eventId: `transfer.success:${++seq}:${p.id}`, type: "transfer.success", signatureValid: true, payload: {} } });
      await runs.apply(ev.id, "transfer.success", { reference: REFERENCE_PREFIX + p.id, amount: 1 });
      expect(await db.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ outcome: "amount_mismatch" });
      expect((await db.payout.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("sent");
    });

    it("the job's next run is the 5th at 08:00 UTC", () => {
      expect(nextFifth(new Date("2026-12-06T09:00:00Z")).toISOString()).toBe("2027-01-05T08:00:00.000Z");
      expect(nextFifth(new Date("2026-12-01T09:00:00Z")).toISOString()).toBe("2026-12-05T08:00:00.000Z");
      expect(nextFifth(new Date("2026-12-05T08:00:00Z")).toISOString()).toBe("2027-01-05T08:00:00.000Z");
    });
  });

  describe("2. refund", () => {
    it("a negative row, never a delete; after a payout the balance goes below zero; the next run pays the difference less", async () => {
      const c = await creator("Qudus");
      const s = await style("qudus-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      const nov = await paid({ styleSlug: s, at: "2026-07-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }); // 600000
      await accrue(nov);
      await runs.run("2026-07");
      const first = await db.payout.findFirstOrThrow({ where: { creatorId: c.creatorId, month: "2026-07" } });
      expect(first.amountKobo).toBe(600000n);

      const reversed = await db.$transaction((tx) => royalties.reverse(tx, nov.id));
      expect(reversed).toEqual([{ creatorId: c.creatorId, amountKobo: -600000n }]);
      expect(await db.royaltyAccrual.count({ where: { paymentId: nov.id } })).toBe(1); // the accrual is still there
      expect(await db.$transaction((tx) => royalties.reverse(tx, nov.id))).toEqual([]); // twice: nothing new
      const neg = await db.$queryRaw<{ amountKobo: bigint }[]>`SELECT "amountKobo" FROM royalty_reversal WHERE "paymentId" = ${nov.id}::uuid`;
      expect(neg).toEqual([{ amountKobo: -600000n }]);
      expect(await royalties.balance(db, c.creatorId, null)).toBe(-600000n); // already paid out: below zero
      expect((await royalties.summary(c.creatorId)).waitingKobo).toBe(-600000);
      const j = await journals({ paymentId: nov.id });
      expect(j.unbalanced).toEqual([]);
      expect(await payable(c.creatorId)).toBe(-600000n);
      await accrue(await paid({ styleSlug: s, at: "2026-08-15T10:00:00Z", amount: 7_500_000n, businessId: b.id, accountId: b.accountId })); // 1500000
      expect(await payable(c.creatorId)).toBe(900000n);

      // the reversal is dated this month (2026-12): the run for December, on 6 January, takes it off what is owed
      t.clock.set(new Date("2027-01-06T09:00:00Z"));
      await runs.run("2026-12");
      t.clock.set(NOW);
      const next = await db.payout.findFirstOrThrow({ where: { creatorId: c.creatorId, month: "2026-12" } });
      expect(next.amountKobo).toBe(900000n); // 1,500,000 earned, less the 600,000 taken back
      const list = await t.http().get("/v1/creator/earnings").set(bearer(c.token));
      expect(list.status).toBe(200);
      const amounts = (list.body.items as { amountKobo: number }[]).map((i) => i.amountKobo);
      expect(amounts).toEqual(expect.arrayContaining([-600000, 600000, 1500000]));
      expect(list.body.summary.byStyle).toEqual([{ styleSlug: s, amountKobo: 1500000 }]);
    });
  });

  describe("4. bank account (E-22)", () => {
    const post = (token: string, body: Record<string, unknown>) => t.http().post("/v1/bank-accounts").set(bearer(token)).send(body);

    it("401 without a token, 403 for a person with no creator side, 422 with fields", async () => {
      expect((await t.http().post("/v1/bank-accounts").send({ accountNumber: "0123456789", bankCode: "058" })).status).toBe(401);
      const p = await person();
      t.tokens.set("plain", { kind: "user", accountId: p, sides: ["person"] });
      expect((await post("plain", { accountNumber: "0123456789", bankCode: "058" })).status).toBe(403);
      const c = await creator("Rita", { bank: false });
      const bad = await post(c.token, { accountNumber: "12345", bankCode: "x" });
      expect(bad.status).toBe(422);
      expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(["accountNumber", "bankCode"]));
      expect((await post(c.token, { accountNumber: "1234567890", bankCode: "058", extra: 1 })).status).toBe(422);
    });

    it("the account name comes from the payments port; an account that does not exist is refused; answers show the last four digits only; a change sends a notice", async () => {
      const c = await creator("Sade", { bank: false });
      const sentBefore = t.email.sent.length;
      const none = await post(c.token, { accountNumber: "0123450000", bankCode: "058" });
      expect(none.status).toBe(422);
      expect(none.body.error.fields.accountNumber).toBeDefined();
      expect(await db.bankAccount.count({ where: { creatorId: c.creatorId } })).toBe(0);

      const ok = await post(c.token, { accountNumber: " 0123 456-789 ", bankCode: " 058 " }); // not canonical: spaces and a dash
      expect(ok.status).toBe(201);
      expect(ok.body).toEqual({ accountNumber: "******6789", bankCode: "058" });
      expect(provider.resolved.at(-1)).toEqual({ bankCode: "058", accountNumber: "0123456789" });
      expect(JSON.stringify(ok.body)).not.toContain("012345");
      expect(await db.bankAccount.findMany({ where: { creatorId: c.creatorId } })).toMatchObject([{ accountNumber: "0123456789", bankCode: "058" }]);
      const mail = t.email.sent.slice(sentBefore);
      expect(mail).toHaveLength(1);
      expect(mail[0].text).toContain("6789");
      expect(mail[0].text).not.toContain("0123456789");

      const same = await post(c.token, { accountNumber: "0123456789", bankCode: "058" });
      expect(same.status).toBe(201);
      expect(await db.bankAccount.count({ where: { creatorId: c.creatorId } })).toBe(1);
      expect(t.email.sent.slice(sentBefore)).toHaveLength(1);

      const changed = await post(c.token, { accountNumber: "9876543210", bankCode: "044" });
      expect(changed.body).toEqual({ accountNumber: "******3210", bankCode: "044" });
      expect(await db.bankAccount.count({ where: { creatorId: c.creatorId } })).toBe(2); // earlier payouts keep the account they went to
      expect(t.email.sent.slice(sentBefore)).toHaveLength(2);
    });
  });

  describe("6. staff and the creator's own lists", () => {
    it("E-154 and E-116: creator only; the owner is the query (another creator's rows never show)", async () => {
      const mine = await creator("Tola");
      const other = await creator("Uche");
      const s = await style("tola-premium", "premium", { creatorId: mine.creatorId });
      const os = await style("uche-premium", "premium", { creatorId: other.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-06-10T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      await accrue(await paid({ styleSlug: os, at: "2026-06-10T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      await runs.run("2026-06");
      for (const path of ["/v1/creator/earnings", "/v1/creator/payouts"]) {
        expect((await t.http().get(path)).status).toBe(401);
        t.tokens.set("person-only", { kind: "user", accountId: await person(), sides: ["person"] });
        expect((await t.http().get(path).set(bearer("person-only"))).status).toBe(403);
        expect((await t.http().get(path).set(bearer("staff-owner"))).status).toBe(403);
        expect((await t.http().get(path).query({ limit: 0 }).set(bearer(mine.token))).status).toBe(422);
        expect((await t.http().get(path).query({ cursor: "nope" }).set(bearer(mine.token))).status).toBe(422);
      }
      const e = await t.http().get("/v1/creator/earnings").set(bearer(mine.token));
      expect(e.body.items).toHaveLength(1);
      expect(e.body.items[0]).toMatchObject({ creatorId: mine.creatorId, styleSlug: s, basis: "pro-wish", amountKobo: 600000, month: "2026-06" });
      expect(e.body.nextCursor).toBeNull();
      expect(e.body.summary).toMatchObject({ thisMonthKobo: 0, waitingKobo: 0, sendingKobo: 600000, paidKobo: 0 });
      const p = await t.http().get("/v1/creator/payouts").set(bearer(mine.token));
      expect(p.body.items).toHaveLength(1);
      expect(p.body.items[0]).toMatchObject({ creatorId: mine.creatorId, month: "2026-06", amountKobo: 600000, status: "sent", state: "sent", threshold: 500000, payDay: "2026-07-05", earned: 600000, carried: 0, total: 600000, handle: expect.any(String) });
      expect(JSON.stringify(p.body)).not.toContain("0123456789");
    });

    it("E-41: finance, ops, owner and reviewer read creators; support is 403; bank numbers are masked", async () => {
      const c = await creator("Vera");
      const path = "/v1/admin/creators";
      expect((await t.http().get(path)).status).toBe(401);
      expect((await t.http().get(path).set(bearer("staff-support"))).status).toBe(403);
      expect((await t.http().get(path).set(bearer(c.token))).status).toBe(403);
      for (const role of ["finance", "ops", "owner", "reviewer"]) expect((await t.http().get(path).query({ limit: 1 }).set(bearer(`staff-${role}`))).status).toBe(200);
      let cursor: string | null = null;
      let found: Record<string, unknown> | undefined;
      do {
        const r: { body: { items: { id: string }[]; nextCursor: string | null } } = await t.http().get(path).query(cursor ? { limit: 50, cursor } : { limit: 50 }).set(bearer("staff-finance"));
        found = r.body.items.find((i) => i.id === c.creatorId);
        cursor = found ? null : r.body.nextCursor;
      } while (cursor);
      expect(found).toMatchObject({ id: c.creatorId, plan: "open", bank: { bankCode: "058", accountNumber: "******6789" }, styles: { total: 0 } });
      expect(JSON.stringify(found)).not.toContain("0123456789");
      expect((await t.http().get(path).query({ limit: 99 }).set(bearer("staff-finance"))).status).toBe(422);
    });

    const markBody = (month: string, reason = "Paid by transfer TX-4411") => ({ month, reason });
    async function duePayout(name: string, month: string) {
      const c = await creator(name);
      const s = await style(`${name}-premium`.toLowerCase(), "premium", { creatorId: c.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: `${month}-15T10:00:00Z`, amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      const bank = await db.bankAccount.findFirstOrThrow({ where: { creatorId: c.creatorId } });
      const id = ids.next();
      // a payout the run made but could not hand over yet: due
      await db.$transaction(async (tx) => {
        await tx.payout.create({ data: { id, creatorId: c.creatorId, month, amountKobo: 600000n, status: "pending", bankAccountId: bank.id } });
        await tx.$executeRaw`INSERT INTO payout_detail ("payoutId") VALUES (${id}::uuid)`;
      });
      return { c, id };
    }

    it("E-114: only finance and owner; reason of 4 or more; only a payout that is due; one audit row; no money moves", async () => {
      const { c, id } = await duePayout("Wale", "2026-05");
      const url = `/v1/admin/creators/payouts/${c.creatorId}/paid`;
      expect((await t.http().post(url).send(markBody("2026-05"))).status).toBe(401);
      for (const role of ["ops", "reviewer", "support"]) expect((await t.http().post(url).set(bearer(`staff-${role}`)).send(markBody("2026-05"))).status).toBe(403);
      expect((await t.http().post(url).set(bearer("staff-finance")).send({ month: "2026-05", reason: "ab" })).status).toBe(422);
      expect((await t.http().post(url).set(bearer("staff-finance")).send({ month: "2026-05" })).status).toBe(422);
      expect((await t.http().post(`/v1/admin/creators/payouts/not-an-id/paid`).set(bearer("staff-finance")).send(markBody("2026-05"))).status).toBe(404);
      expect((await t.http().post(url).set(bearer("staff-finance")).send(markBody("2026-04"))).status).toBe(404);
      const asked = provider.asked.length;
      const ok = await t.http().post(url).set(bearer("staff-finance")).send(markBody("2026-05"));
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ id, status: "succeeded", state: "paid", paid: { decision: "paid", reason: "Paid by transfer TX-4411" }, reason: "Paid by transfer TX-4411" });
      expect(provider.asked.length).toBe(asked);
      expect(await db.auditEntry.count({ where: { subjectId: id, action: "payout.mark-paid", section: "/admin/creators" } })).toBe(1);
      const again = await t.http().post(url).set(bearer("staff-owner")).send(markBody("2026-05"));
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("not_allowed");
      expect(await db.auditEntry.count({ where: { subjectId: id } })).toBe(1);
    });

    it("E-115: only finance and owner; reason and month; runs the month with an audit row; the rows are the run's payouts; running again changes nothing", async () => {
      const c = await creator("Xena");
      const s = await style("xena-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-04-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      const url = "/v1/admin/payout-runs/2026-04/approve";
      expect((await t.http().post(url).send(markBody("2026-04"))).status).toBe(401);
      expect((await t.http().post(url).set(bearer("staff-ops")).send(markBody("2026-04"))).status).toBe(403);
      expect((await t.http().post(url).set(bearer("staff-finance")).send({ month: "2026-04", reason: "no" })).status).toBe(422);
      expect((await t.http().post(url).set(bearer("staff-finance")).send({ month: "2026-05", reason: "Month's run" })).status).toBe(422);
      expect((await t.http().post("/v1/admin/payout-runs/2026-12/approve").set(bearer("staff-finance")).send(markBody("2026-12"))).status).toBe(422);
      expect(await db.payout.count({ where: { creatorId: c.creatorId } })).toBe(0);
      const r = await t.http().post(url).set(bearer("staff-finance")).send(markBody("2026-04", "Approve the April run"));
      expect(r.status).toBe(200);
      const row = (r.body.items as { creatorId: string; amountKobo: number; status: string }[]).find((i) => i.creatorId === c.creatorId);
      expect(row).toMatchObject({ amountKobo: 600000, status: "sent" });
      expect(r.body.nextCursor).toBeNull();
      expect(await db.auditEntry.count({ where: { subjectId: "2026-04", action: "payout-run.approve" } })).toBe(1);
      const again = await t.http().post(url).set(bearer("staff-owner")).send(markBody("2026-04", "Approve again"));
      expect(again.status).toBe(200);
      expect(await db.payout.count({ where: { creatorId: c.creatorId } })).toBe(1);
    });

    it("E-50: finance and owner only; earnings by line over two days, from the paid payments", async () => {
      const a = await person();
      await paid({ styleSlug: `${tag}-none`, at: "2031-03-03T10:00:00Z", amount: 400000n, accountId: a });
      await paid({ styleSlug: `${tag}-none`, at: "2031-03-04T23:30:00Z", amount: 600000n, accountId: a });
      await paid({ styleSlug: `${tag}-none`, sku: "keep.year", at: "2031-03-04T10:00:00Z", amount: 600000n, accountId: a });
      await paid({ styleSlug: `${tag}-none`, at: "2031-03-05T00:00:00Z", amount: 999n, accountId: a }); // outside
      const q = { from: "2031-03-03", to: "2031-03-04" };
      expect((await t.http().get("/v1/admin/earnings").query(q)).status).toBe(401);
      for (const role of ["ops", "reviewer", "support"]) expect((await t.http().get("/v1/admin/earnings").query(q).set(bearer(`staff-${role}`))).status).toBe(403);
      expect((await t.http().get("/v1/admin/earnings").query({ from: "2031-03-03" }).set(bearer("staff-finance"))).status).toBe(422);
      expect((await t.http().get("/v1/admin/earnings").query({ from: "03/03/2031", to: "2031-03-04" }).set(bearer("staff-finance"))).status).toBe(422);
      expect((await t.http().get("/v1/admin/earnings").query({ from: "2031-03-04", to: "2031-03-03" }).set(bearer("staff-finance"))).status).toBe(422);
      const r = await t.http().get("/v1/admin/earnings").query(q).set(bearer("staff-owner"));
      expect(r.status).toBe(200);
      expect(r.body.items).toEqual([
        { line: "keeps", period: "2031-03-03 to 2031-03-04", from: "2031-03-03T00:00:00.000Z", to: "2031-03-04T23:59:59.999Z", grossKobo: 600000, count: 1 },
        { line: "tickets", period: "2031-03-03 to 2031-03-04", from: "2031-03-03T00:00:00.000Z", to: "2031-03-04T23:59:59.999Z", grossKobo: 1000000, count: 2 },
      ]);
    });
  });

  describe("7. erase", () => {
    it("the bank account and personal data go; the money rows stay without them; an erased creator is never paid", async () => {
      const c = await creator("Yemi");
      const s = await style("yemi-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      const p = await paid({ styleSlug: s, at: "2026-03-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId });
      await accrue(p);
      await t.app.get(AccountErasureService).erase(c.accountId, { actor: { type: "system", id: null, requestId: "r" }, reason: null });
      expect(await db.bankAccount.findUniqueOrThrow({ where: { id: c.bankId as string } })).toMatchObject({ accountNumber: null });
      expect(await db.royaltyAccrual.count({ where: { creatorId: c.creatorId } })).toBe(1); // money rows stay
      const asked = provider.asked.length;
      await runs.run("2026-03");
      expect(await db.payout.count({ where: { creatorId: c.creatorId } })).toBe(0);
      expect(provider.asked.length).toBe(asked);
      const row = await t.http().post("/v1/bank-accounts").set(bearer(c.token)).send({ accountNumber: "0123456789", bankCode: "058" });
      expect([401, 403]).toContain(row.status);
    });

    it("a payout made before the erase is not sent after it: it fails and the balance is kept", async () => {
      const c = await creator("Zane");
      const s = await style("zane-premium", "premium", { creatorId: c.creatorId });
      const b = await business();
      await accrue(await paid({ styleSlug: s, at: "2026-02-15T10:00:00Z", amount: 3_000_000n, businessId: b.id, accountId: b.accountId }));
      const bank = await db.bankAccount.findFirstOrThrow({ where: { creatorId: c.creatorId } });
      const id = ids.next();
      await db.$transaction(async (tx) => {
        await tx.payout.create({ data: { id, creatorId: c.creatorId, month: "2026-02", amountKobo: 600000n, status: "pending", bankAccountId: bank.id } });
        await tx.$executeRaw`INSERT INTO payout_detail ("payoutId") VALUES (${id}::uuid)`;
      });
      await t.app.get(AccountErasureService).erase(c.accountId, { actor: { type: "system", id: null, requestId: "r" }, reason: null });
      const asked = provider.asked.length;
      expect(await runs.sendOne(id)).toBe("failed");
      expect(provider.asked.length).toBe(asked);
      expect((await db.payout.findUniqueOrThrow({ where: { id } })).status).toBe("failed");
    });
  });
});
