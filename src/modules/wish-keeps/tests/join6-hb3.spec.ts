import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { JobsService } from "../../jobs/jobs.service";
import { endOf } from "../../purchases/pass-cover";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";

// J9 (HB3) and J10 (a job's cancel never throws; an ended Pass is not live).
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2035-03-01T09:00:00.000Z"); // a start no other spec uses
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("join 6: the end function at first open and rest; cancelling a job; an ended Pass", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let jobs: JobsService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    jobs = t.app.get(JobsService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const at = (days: number) => new Date(NOW.getTime() + days * DAY);
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  async function account() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `j6hb3-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    const token = `j6hb3-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] });
    return { accountId, token };
  }
  async function live(accountId: string, endsAt: Date) {
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: `j6${seq}${id.slice(-5)}`, openedAt: new Date(endsAt.getTime() - 14 * DAY), endsAt } as never,
    });
    await jobs.schedule("rest-wish", endsAt, id);
    return id;
  }
  /** A sealed wish, open time passed, with its link: opened through the real public route. */
  async function sealed(accountId: string) {
    const id = ids.next();
    const slug = `j6hb3-${String(++seq).padStart(3, "0")}abcdefghi`.slice(0, 24);
    await db.wish.create({
      data: { id, accountId, status: "sealed", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: `j7${seq}${id.slice(-5)}`, name: "Chidi", opensAt: new Date(NOW.getTime() - 60_000), sealedAt: NOW, content: { letter: { paras: ["Hi"] } } } as never,
    });
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    return { id, slug };
  }
  async function pay(accountId: string, sku: string, wishId: string | null) {
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
    const out = await settle.settle({ reference: `fw-${id}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: t.clock.now() });
    return { id, out };
  }
  const restJobOf = (w: string) => db.job.findFirst({ where: { subjectId: w, type: "rest_wish" } });

  // ---- J9 ----

  it("J9: a wish opened while its owner holds a live Pass ends with the Pass; with no Pass it ends with its own term", async () => {
    const o = await account();
    expect((await pay(o.accountId, "pass.year", null)).out.outcome).toBe("fulfilled");
    const w = await sealed(o.accountId);
    expect((await t.http().post(`/v1/w/${w.slug}/opens`).send({})).status).toBe(200);
    const r = await row(w.id);
    expect(r.status).toBe("live");
    expect(r.endsAt!.getTime()).toBe(at(365).getTime());
    expect(r.keptBy).toBe("pass");
    expect((await restJobOf(w.id))!.runAt.getTime()).toBe(at(365).getTime());

    const plain = await account();
    const p = await sealed(plain.accountId);
    expect((await t.http().post(`/v1/w/${p.slug}/opens`).send({})).status).toBe(200);
    const pr = await row(p.id);
    expect(pr.endsAt!.getTime()).toBe(at(14).getTime()); // a keepsake's term
    expect(pr.keptBy).toBeNull();
    expect((await restJobOf(p.id))!.runAt.getTime()).toBe(at(14).getTime());
  });

  it("J9: the rest job never rests a wish a live Pass still covers: it sets the next rest time; with nothing covering it rests it", async () => {
    const o = await account();
    await pay(o.accountId, "pass.year", null); // bought before the wish exists, so no end was worked out for it
    const w = await live(o.accountId, at(2));
    t.clock.set(at(3));
    await jobs.runDue(20, [w]);
    const r = await row(w);
    expect(r.status).toBe("live");
    expect(r.endsAt!.getTime()).toBe(at(365).getTime());
    expect(r.keptBy).toBe("pass");
    const job = (await restJobOf(w))!;
    expect(job).toMatchObject({ status: "scheduled" });
    expect(job.runAt.getTime()).toBe(at(365).getTime());
    // the Pass ends: the job rests the wish
    t.clock.set(at(366));
    await jobs.runDue(20, [w]);
    const after = await row(w);
    expect(after.status).toBe("resting");
    expect(after.keptBy).toBeNull();

    const plain = await account();
    const w2 = await live(plain.accountId, at(2));
    t.clock.set(at(3));
    await jobs.runDue(20, [w2]);
    expect((await row(w2)).status).toBe("resting");
  });

  it("J9: the rest job never rests a wish a paid keep still covers", async () => {
    const o = await account();
    const w = await live(o.accountId, at(2));
    expect((await pay(o.accountId, "keep.month", w)).out.outcome).toBe("fulfilled");
    const keepEnd = (await row(w)).endsAt!;
    expect(keepEnd.getTime()).toBe(at(32).getTime());
    // the job is put back to the old time, as if the keep's change had not reached it
    await db.wish.update({ where: { id: w }, data: { endsAt: at(2) } });
    await jobs.schedule("rest-wish", at(2), w);
    t.clock.set(at(3));
    await jobs.runDue(20, [w]);
    const r = await row(w);
    expect(r.status).toBe("live");
    expect(r.endsAt!.getTime()).toBe(keepEnd.getTime());
    expect((await restJobOf(w))!.runAt.getTime()).toBe(keepEnd.getTime());
  });

  // ---- J10 ----

  it("J10: an ended Pass is not live: end and keptBy do not show it", async () => {
    const o = await account();
    const w = await live(o.accountId, at(2));
    await pay(o.accountId, "pass.year", null);
    expect((await endOf(db as never, w, { now: t.clock.now() })).by).toBe("pass");
    const later = at(400);
    const e = await endOf(db as never, w, { now: later });
    expect(e.passEnd).toBeNull();
    expect(e.by).toBeNull();
    expect(e.end!.getTime()).toBe(at(2).getTime());
  });

  const subject = () => `j6-cancel-${run}-${++seq}`;
  const history = (jobId: string) => db.$executeRaw`INSERT INTO job_run (id, "jobId", "startedAt", "finishedAt", outcome) VALUES (${ids.next()}::uuid, ${jobId}::uuid, now(), now(), 'succeeded')`;
  const jobRow = (key: string) => db.job.findFirst({ where: { subjectId: key, type: "rest_wish" } });

  it("J10: cancel removes a waiting job with no history; marks one with history so it never runs; leaves one that already ran; never throws", async () => {
    const plain = subject();
    await jobs.schedule("rest-wish", at(1), plain);
    await expect(jobs.cancel("rest-wish", plain)).resolves.toBeUndefined();
    expect(await jobRow(plain)).toBeNull();

    const withHistory = subject();
    const id = await jobs.schedule("rest-wish", at(1), withHistory);
    await history(id);
    await expect(jobs.cancel("rest-wish", withHistory)).resolves.toBeUndefined();
    expect(await jobRow(withHistory)).toMatchObject({ id, status: "succeeded" });
    t.clock.set(at(2));
    expect(await jobs.runDue(20, [withHistory])).toBe(0); // the runner skips it
    // scheduled again, it waits again
    await jobs.schedule("rest-wish", at(5), withHistory);
    expect(await jobRow(withHistory)).toMatchObject({ id, status: "scheduled" });

    const ran = subject();
    const rid = await jobs.schedule("rest-wish", at(1), ran);
    await history(rid);
    await db.$executeRaw`UPDATE job SET status = 'succeeded' WHERE id = ${rid}::uuid`;
    await expect(jobs.cancel("rest-wish", ran)).resolves.toBeUndefined();
    expect(await jobRow(ran)).toMatchObject({ status: "succeeded" });
    await expect(jobs.cancel("rest-wish", subject())).resolves.toBeUndefined(); // no such job
    await expect(jobs.cancel("rest-wish", plain)).resolves.toBeUndefined();
  });

  it("J10: 20 cancels at once, with and without history, all settle", async () => {
    const keys = Array.from({ length: 10 }, subject);
    for (const [i, k] of keys.entries()) {
      const id = await jobs.schedule("rest-wish", at(1), k);
      if (i % 2) await history(id);
    }
    const res = await Promise.allSettled(keys.flatMap((k) => [jobs.cancel("rest-wish", k), jobs.cancel("rest-wish", k)]));
    expect(res.filter((r) => r.status === "rejected")).toHaveLength(0);
    for (const [i, k] of keys.entries()) {
      const j = await jobRow(k);
      if (i % 2) expect(j!.status).toBe("succeeded");
      else expect(j).toBeNull();
    }
  });

  it("J10: rests, restore window passes, a keep wakes it, it rests again, a keep is paid: the keep settles and the end is right", async () => {
    const o = await account();
    const w = await live(o.accountId, at(2));
    const life = t.app.get(WishLifecycleService);
    const restoreDays = await life.restoreDays();
    t.clock.set(at(3));
    await jobs.runDue(20, [w]);
    expect((await row(w)).status).toBe("resting");
    t.clock.set(at(3 + restoreDays + 1));
    await jobs.runDue(20, [w]); // the restore-window-end job runs: it now has history
    const first = await pay(o.accountId, "keep.month", w); // wakes it
    expect(first.out.outcome).toBe("fulfilled");
    expect((await row(w)).status).toBe("live");
    const firstEnd = (await row(w)).endsAt!;
    t.clock.set(new Date(firstEnd.getTime() + DAY));
    await jobs.runDue(20, [w]); // rests again: the restore-window-end job is waiting again, with its history
    expect((await row(w)).status).toBe("resting");
    const bought = t.clock.now();
    const second = await pay(o.accountId, "keep.month", w);
    expect(second.out.outcome).toBe("fulfilled");
    const r = await row(w);
    expect(r.status).toBe("live");
    expect(r.keptBy).toBe("keep");
    expect(r.endsAt!.getTime()).toBe(bought.getTime() + 30 * DAY);
    expect(await db.payment.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "succeeded" });
    expect(await db.job.count({ where: { subjectId: w, type: "rest_wish", status: "scheduled" } })).toBe(1);
  });
});
