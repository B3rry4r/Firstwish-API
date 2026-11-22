import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { JobsService } from "../../jobs/jobs.service";
import { endOf, PassCover } from "../../purchases/pass-cover";
import { PurchasesService } from "../../purchases/purchases.service";
import { WishKeepsService } from "../wish-keeps.service";
import { testWishNo } from "../../../../test/kit/unique";

// HB1: a wish's end is always worked out from scratch by endOf and written by applyEnd.
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2034-02-01T09:00:00.000Z"); // a start no other spec uses
const DAY = 86_400_000;
const TERM = 14; // keepsake
const KEEP_DAYS: Record<string, number> = { "keep.month": 30, "keep.half": 182, "keep.year": 365 };
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("HB1 the end of a wish is worked out from the rows", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let jobs: JobsService;
  let purchases: PurchasesService;
  let keeps: WishKeepsService;
  let cover: PassCover;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    jobs = t.app.get(JobsService);
    purchases = t.app.get(PurchasesService);
    keeps = t.app.get(WishKeepsService);
    cover = t.app.get(PassCover);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function account() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `hb1-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    return accountId;
  }
  /** A live keepsake opened `TERM` days before `endsAt` (so its own term ends there), or a wedding wish. */
  async function wish(accountId: string, endsAt: Date, over: Record<string, unknown> = {}) {
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo(), openedAt: new Date(endsAt.getTime() - TERM * DAY), endsAt, ...over } as never,
    });
    await jobs.schedule("rest-wish", endsAt, id); // what the first open did
    return id;
  }
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  async function payFor(accountId: string, sku: string, wishId: string | null) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    await db.payment.create({
      data: {
        id, accountId, payerContact: "x@example.com", purpose: sku === "pass.year" ? "pass" : "keep", subjectId: wishId, lines: [{ sku, name: sku, qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x", ...(wishId ? { subjectId: wishId } : {}) }, server: { fingerprint: id, flags: [] } },
      },
    });
    return { id, reference: `fw-${id}`, amount: unit };
  }
  async function pay(accountId: string, sku: string, wishId: string | null) {
    const p = await payFor(accountId, sku, wishId);
    const out = await settle.settle({ reference: p.reference, status: "success", amountKobo: p.amount, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return p.id;
  }
  const refund = (paymentId: string) => db.$transaction((tx) => purchases.revoke(tx, { id: paymentId }));
  const settleJobs = (w: string) => jobs.runDue(50, [w]);
  const at = (days: number) => new Date(NOW.getTime() + days * DAY);

  it("the verifier's first case: a half keep on a wish ending in 2 days, the Pass refunded at day 10: the end stays what was paid for", async () => {
    const a = await account();
    const w = await wish(a, at(2));
    const passPay = await pay(a, "pass.year", null);
    await db.$transaction(async (tx) => cover.apply(tx, a, w));
    expect((await row(w)).keptBy).toBe("pass");
    await pay(a, "keep.half", w);
    t.clock.set(at(10));
    await refund(passPay);
    await settleJobs(w);
    const r = await row(w);
    expect(r.status).toBe("live");
    expect(r.endsAt!.getTime()).toBe(at(2 + 182).getTime()); // its own end and the half keep, never the Pass end plus half
    expect(r.keptBy).toBe("keep");
    expect(r.keptUntil!.getTime()).toBe(r.endsAt!.getTime());
    expect(r.keep).toBe("half");
    expect(await db.job.count({ where: { subjectId: w, type: "rest_wish", status: "scheduled" } })).toBe(1);
    expect((await db.job.findFirstOrThrow({ where: { subjectId: w, type: "rest_wish" } })).runAt.getTime()).toBe(r.endsAt!.getTime());
  });

  it("the verifier's second case: a month keep, then a Pass keep, then the month refunded: the Pass holds the end, nothing comes off it", async () => {
    const a = await account();
    const w = await wish(a, at(2));
    const month = await pay(a, "keep.month", w);
    expect((await row(w)).endsAt!.getTime()).toBe(at(32).getTime());
    const passPay = await pay(a, "pass.year", null);
    expect((await row(w)).keptBy).toBe("pass"); // a Pass bought moves the live wish's end
    expect((await row(w)).endsAt!.getTime()).toBe(at(365).getTime());
    await refund(month);
    let r = await row(w);
    expect(r.endsAt!.getTime()).toBe(at(365).getTime());
    expect(r.keptBy).toBe("pass");
    expect(r.keep).toBeNull();
    await refund(passPay);
    r = await row(w);
    expect(r.endsAt!.getTime()).toBe(at(2).getTime());
    expect(r.keptBy).toBeNull();
    expect(r.keptUntil).toBeNull();
  });

  it("a wedding wish keeps its wedding rule through a Pass refund", async () => {
    const a = await account();
    const wedding = new Date("2034-06-10T00:00:00.000Z"); // the day, in Lagos (UTC+1) it begins at 23:00 the evening before
    const own = new Date(Date.UTC(2034, 5, 9, 23, 0, 0) + TERM * DAY);
    const w = await wish(a, own, { weddingDate: wedding });
    const passPay = await pay(a, "pass.year", null);
    expect((await row(w)).endsAt!.getTime()).toBe(at(365).getTime());
    t.clock.set(at(10));
    await refund(passPay);
    const r = await row(w);
    expect(r.endsAt!.getTime()).toBe(own.getTime());
    expect(r.keptBy).toBeNull();
    expect((await endOf(db as never, w, { now: t.clock.now() })).own!.getTime()).toBe(own.getTime());
  });

  it("20 events at once leave one consistent end", async () => {
    const a = await account();
    const w = await wish(a, at(3));
    const standing = [await pay(a, "keep.month", w), await pay(a, "keep.half", w), await pay(a, "keep.month", w)];
    const fresh = await Promise.all(["keep.year", "keep.month", "keep.half", "keep.month", "keep.year", "keep.month", "keep.half", "keep.month"].map((sku) => payFor(a, sku, w)));
    const events: Promise<unknown>[] = [
      ...fresh.map((p) => settle.settle({ reference: p.reference, status: "success", amountKobo: p.amount, currency: "NGN", paidAt: t.clock.now() })),
      refund(standing[0]), refund(standing[0]), refund(standing[2]), refund(standing[2]),
      ...Array.from({ length: 8 }, () => db.$transaction((tx) => cover.applyEnd(tx, w))),
    ];
    expect(events).toHaveLength(20);
    const settled = await Promise.allSettled(events);
    expect(settled.filter((s) => s.status === "rejected")).toHaveLength(0);
    // by hand: the half and the eight new keeps (30 + 365 + 30 ... ) stand; the two month keeps bought first are refunded
    const days = 182 + [365, 30, 182, 30, 365, 30, 182, 30].reduce((x, y) => x + y, 0);
    const r = await row(w);
    expect(r.endsAt!.getTime()).toBe(at(3 + days).getTime());
    expect(r.keptBy).toBe("keep");
    expect(r.keep).toBe("year");
    expect((await endOf(db as never, w, { now: t.clock.now() })).end!.getTime()).toBe(r.endsAt!.getTime());
    expect(await db.job.count({ where: { subjectId: w, type: "rest_wish", status: "scheduled" } })).toBe(1);
  });

  it("a resting wish gets no rest job from a refund (HB2)", async () => {
    const a = await account();
    const w = await wish(a, at(2));
    const month = await pay(a, "keep.month", w);
    t.clock.set(at(40)); // the keep is over: the wish rests
    await settleJobs(w);
    expect((await row(w)).status).toBe("resting");
    await refund(month);
    expect((await row(w)).status).toBe("resting");
    expect(await db.job.count({ where: { subjectId: w, type: "rest_wish", status: "scheduled" } })).toBe(0);
  });

  it("E-83 shows the end of the last live Pass when two are stacked (HB2)", async () => {
    const a = await account();
    await pay(a, "pass.year", null);
    await pay(a, "pass.year", null);
    const ends = (await db.passMembership.findMany({ where: { accountId: a } })).map((m) => new Date(m.validUntil as string).getTime());
    const last = Math.max(...ends);
    const token = `hb1-${a}`;
    t.tokens.set(token, { kind: "user", accountId: a, sides: ["person"] });
    const r = await t.http().get("/v1/me/pass").set({ authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(new Date(r.body.endsAt).getTime()).toBe(last);
    expect(last).toBe(at(730).getTime());
  });

  it("property: 200 random orders of keep, refund, Pass, time and wake events: after each, the stored end is endOf worked out by hand, never later than what is paid for or covered, keptBy right", async () => {
    let state = 20240601;
    const rnd = (n: number) => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state % n;
    };
    for (let seqNo = 0; seqNo < 200; seqNo++) {
      t.clock.set(NOW);
      const a = await account();
      const own = at(1 + rnd(10));
      const w = await wish(a, own);
      const keepsMade: { payment: string; days: number; bought: Date; refunded: boolean }[] = [];
      const passes: { payment: string; since: Date; until: Date; refunded: boolean }[] = [];
      const log: string[] = [];
      for (let step = 0; step < 8; step++) {
        const pick = rnd(8);
        const now = t.clock.now();
        if (pick <= 2) {
          const sku = ["keep.month", "keep.half", "keep.year"][pick];
          log.push(sku);
          keepsMade.push({ payment: await pay(a, sku, w), days: KEEP_DAYS[sku], bought: now, refunded: false });
        } else if (pick === 3) {
          const standing = keepsMade.filter((k) => !k.refunded);
          if (!standing.length) continue;
          const k = standing[rnd(standing.length)];
          log.push("refund keep");
          await refund(k.payment);
          k.refunded = true;
        } else if (pick === 4) {
          log.push("pass");
          const live = passes.filter((p) => !p.refunded).reduce<Date | null>((m, p) => (!m || p.until > m ? p.until : m), null);
          const since = live && live > now ? live : now;
          passes.push({ payment: await pay(a, "pass.year", null), since, until: new Date(since.getTime() + 365 * DAY), refunded: false });
        } else if (pick === 5) {
          const standing = passes.filter((p) => !p.refunded);
          if (!standing.length) continue;
          const p = standing[rnd(standing.length)];
          log.push("refund pass");
          await refund(p.payment);
          p.refunded = true;
        } else if (pick === 6) {
          const days = 1 + rnd(150);
          log.push(`time ${days}`);
          t.clock.set(new Date(now.getTime() + days * DAY));
        } else {
          log.push("wake");
          await keeps.wake(a, w, undefined, { address: null }).catch((e: { status?: number }) => {
            if (e.status !== 402 && e.status !== 409) throw e;
          });
        }
        await settleJobs(w);
        // by hand
        const clock = t.clock.now();
        let running = own.getTime();
        const standingKeeps = keepsMade.filter((k) => !k.refunded);
        for (const k of standingKeeps) running = Math.max(running, k.bought.getTime()) + k.days * DAY;
        const startedPass = passes.filter((p) => !p.refunded);
        const passEnd = startedPass.some((p) => p.since <= clock) ? Math.max(...startedPass.map((p) => p.until.getTime())) : null;
        const expected = Math.max(running, passEnd ?? 0);
        const r = await row(w);
        const ctx = `seq ${seqNo} step ${step}: ${log.join(", ")}`;
        if (r.status === "live") {
          if (passEnd && !standingKeeps.length && passEnd <= own.getTime()) expect(r.endsAt!.getTime()).toBe(own.getTime());
          expect({ ctx, end: r.endsAt!.getTime() }).toEqual({ ctx, end: expected });
          expect(r.endsAt!.getTime()).toBeGreaterThan(clock.getTime());
          // never later than paid for or covered
          const bound = Math.max(passEnd ?? 0, Math.max(own.getTime(), ...standingKeeps.map((k) => k.bought.getTime())) + standingKeeps.reduce((s, k) => s + k.days * DAY, 0));
          expect(r.endsAt!.getTime()).toBeLessThanOrEqual(bound);
          const by = passEnd && passEnd > running ? "pass" : standingKeeps.length ? "keep" : null;
          expect({ ctx, by: r.keptBy }).toEqual({ ctx, by });
          expect(r.keptUntil?.getTime() ?? null).toBe(by ? r.endsAt!.getTime() : null);
        } else {
          // at rest: its end is over, and no rest job is waiting
          expect(r.status).toBe("resting");
          expect(r.endsAt!.getTime()).toBeLessThanOrEqual(clock.getTime());
          expect(await db.job.count({ where: { subjectId: w, type: "rest_wish", status: "scheduled" } })).toBe(0);
        }
      }
    }
  }, 600_000);
});
