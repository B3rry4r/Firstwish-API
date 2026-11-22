import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { withTimeLimit } from "../../../common/ports/time-limit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { JobHandlers } from "../../job-handlers/job-handlers.service";
import { abandonPendingPayments } from "../abandon";
import { FulfilmentRegistry } from "../fulfilment.registry";

/* P-B05: the rulings of Verify B05 (FF1 to FF5) and the lead's (DD2 to DD4), each in a test named by its id, on a real database. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-02T09:00:00.000Z");
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const KEEPSAKE = { purpose: "ticket", ticket: "keepsake" };
let seq = 0;

describe("P-B05 rulings (payments)", () => {
  let t: TestApp;
  let db: PrismaService;
  let calls = 0;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    const registry = t.app.get(FulfilmentRegistry);
    registry.clearStartChecks(); // INT-4 (GG3): this spec tests the payments core with stand-in handlers, not the start check
    for (const sku of ["ticket.keepsake", "extra.five-photos", "pass.year", "keep.month"]) {
      registry.replace(sku, () => {
        calls++;
        return Promise.resolve();
      });
    }
  });
  afterAll(() => t.close());
  beforeEach(() => {
    calls = 0;
  });

  async function payer() {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `pb05-${process.pid}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    const token = `pb05-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  }
  const start = (token: string, body: Record<string, unknown>, key?: string) => {
    const r = t.http().post("/v1/payments").set(bearer(token));
    if (key) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  async function started(token: string, body: Record<string, unknown> = KEEPSAKE, key?: string) {
    const r = await start(token, body, key);
    expect(r.status).toBe(201);
    return r.body.payment as { reference: string; state: string; amountKobo: number; authorizationUrl: string };
  }
  const row = (reference: string) => db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
  const charge = async (reference: string, over: Record<string, unknown> = {}, id: number | string = ++seq + 700000) =>
    JSON.stringify({ event: "charge.success", data: { id, reference, amount: Number((await row(reference)).amountKobo), currency: "NGN", channel: "card", fees: 150, paid_at: NOW.toISOString(), ...over } });
  const hook = (body: string) => t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  const verify = (token: string, reference: string) => t.http().get(`/v1/payments/${reference}`).set(bearer(token));
  const unbalanced = (entries: { journalId: string; direction: string; amountKobo: bigint }[]) => {
    const sums = new Map<string, bigint>();
    for (const e of entries) sums.set(e.journalId, (sums.get(e.journalId) ?? 0n) + (e.direction === "debit" ? e.amountKobo : -e.amountKobo));
    return [...sums.values()].filter((v) => v !== 0n);
  };

  it("FF2: a signed event whose id or reference holds a control character is 400, and nothing is stored", async () => {
    const a = await payer();
    const p = await started(a.token);
    const mine = () => db.webhookEvent.count({ where: { payload: { path: ["data", "reference"], string_starts_with: p.reference } } });
    const cases = [
      { event: "charge.success", data: { id: "12\u00003", reference: p.reference, amount: 1 } },
      { event: "charge.success", data: { id: 123, reference: `${p.reference}\u0000`, amount: 1 } },
      { event: "charge.success", data: { id: 123, reference: `${p.reference}\n`, amount: 1 } },
      { event: "charge.success", data: { id: "a\u001fb", reference: p.reference, amount: 1 } },
      { event: "charge.success", data: { id: 123, reference: p.reference, amount: 1, note: "x\u0000y" } },
      { event: "charge.suc\u0007cess", data: { id: 123, reference: p.reference } },
    ];
    for (const c of cases) {
      const r = await hook(JSON.stringify(c));
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("bad_event");
    }
    expect(await mine()).toBe(0);
    expect((await row(p.reference)).status).toBe("pending");
  });

  it("FF3: the stored event id is type:provider id:reference; one transaction id for two references stores both", async () => {
    const a = await payer();
    const p1 = await started(a.token);
    const p2 = await started(a.token, { purpose: "extra", id: "five-photos" });
    const shared = 880000 + ++seq;
    expect((await hook(await charge(p1.reference, {}, shared))).status).toBe(200);
    expect((await hook(await charge(p2.reference, {}, shared))).status).toBe(200);
    expect((await row(p1.reference)).status).toBe("succeeded");
    expect((await row(p2.reference)).status).toBe("succeeded");
    const stored = await db.webhookEvent.findMany({ where: { eventId: { in: [`charge.success:${shared}:${p1.reference}`, `charge.success:${shared}:${p2.reference}`] } } });
    expect(stored).toHaveLength(2);
    expect(stored.every((e) => e.processedAt !== null && e.outcome === "fulfilled")).toBe(true);
    // the same event again is a replay of one of them
    expect((await hook(await charge(p1.reference, {}, shared))).status).toBe(200);
    expect(await db.webhookEvent.count({ where: { eventId: `charge.success:${shared}:${p1.reference}` } })).toBe(1);
    expect(calls).toBe(2);
  });

  it("FF4: the same key after success answers 200 with the payment as it stands and no checkout address", async () => {
    const a = await payer();
    const key = `ff4-${ids.next()}`;
    const first = await start(a.token, KEEPSAKE, key);
    expect(first.status).toBe(201);
    expect(first.body.payment.authorizationUrl).not.toBe("");
    expect((await hook(await charge(first.body.payment.reference))).status).toBe(200);
    const again = await start(a.token, KEEPSAKE, key);
    expect(again.status).toBe(200);
    expect(again.body.payment).toMatchObject({ reference: first.body.payment.reference, state: "succeeded", amountKobo: first.body.payment.amountKobo, authorizationUrl: "" });
    expect(await db.payment.count({ where: { accountId: a.id } })).toBe(1);
    expect(t.payments.started.filter((s) => s.reference === first.body.payment.reference)).toHaveLength(1);
    expect((await start(a.token, { purpose: "extra", id: "five-photos" }, key)).status).toBe(409);
  });

  it("FF5: a pending payment is abandoned at exactly 60 minutes, not before", async () => {
    const a = await payer();
    const at = new Date("2019-06-01T10:00:00.000Z");
    const make = async (age: number) => {
      const id = ids.next();
      await db.payment.create({
        data: { id, accountId: a.id, purpose: "ticket", lines: [{ sku: "ticket.keepsake", qty: 1, totalKobo: 100 }], amountKobo: 100n, currency: "NGN", priceBookVersion: 1, status: "pending", provider: "paystack", providerReference: `ff5-${id}`, idempotencyKey: `ff5-${id}`, createdAt: new Date(at.getTime() - age) },
      });
      return id;
    };
    const exact = await make(60 * 60_000);
    const justYounger = await make(60 * 60_000 - 1);
    const older = await make(61 * 60_000);
    expect(await abandonPendingPayments(db, at)).toBe(2);
    const st = async (id: string) => (await db.payment.findUniqueOrThrow({ where: { id } })).status;
    expect([await st(exact), await st(justYounger), await st(older)]).toEqual(["abandoned", "pending", "abandoned"]);
  });

  it("DD2: GET /v1/payments is the payer's own, newest first, by cursor; another account's never appears", async () => {
    const a = await payer();
    const b = await payer();
    const mine: string[] = [];
    for (let i = 0; i < 5; i++) mine.push((await started(a.token)).reference);
    const theirs = await started(b.token);
    const refs = (r: { body: { items: { reference: string }[] } }) => r.body.items.map((i) => i.reference);
    const get = (token: string, q: Record<string, unknown> = {}) => t.http().get("/v1/payments").query(q).set(bearer(token));
    expect((await t.http().get("/v1/payments")).status).toBe(401);
    const p1 = await get(a.token, { limit: 2 });
    expect(p1.status).toBe(200);
    expect(refs(p1)).toEqual([mine[4], mine[3]]);
    expect(p1.body.nextCursor).not.toBeNull();
    expect(p1.body.items[0]).toMatchObject({ state: "pending", fulfilled: false });
    expect(p1.body.items[0].idempotencyKey).toBeUndefined();
    expect(p1.body.items[0].flags).toBeUndefined();
    const p2 = await get(a.token, { limit: 2, cursor: p1.body.nextCursor });
    expect(refs(p2)).toEqual([mine[2], mine[1]]);
    const p3 = await get(a.token, { limit: 2, cursor: p2.body.nextCursor });
    expect(refs(p3)).toEqual([mine[0]]);
    expect(p3.body.nextCursor).toBeNull();
    const everything = refs(await get(a.token));
    expect(everything).not.toContain(theirs.reference);
    expect(refs(await get(b.token))).toEqual([theirs.reference]);
    // another account's cursor leaks nothing: it is only a position in the caller's own list
    const cross = await get(b.token, { cursor: p1.body.nextCursor });
    expect(refs(cross)).not.toEqual(expect.arrayContaining(mine));
    expect((await get(a.token, { cursor: "nope" })).status).toBe(422);
    expect((await get(a.token, { limit: 0 })).status).toBe(422);
    expect((await get(a.token, { limit: 51 })).status).toBe(422);
  });

  it("DD3: staff flags live in payment.flags and webhook_event.outcome; nothing is written to the options JSON or the event column", async () => {
    const a = await payer();
    const p = await started(a.token);
    expect((await hook(await charge(p.reference, { amount: 1 }))).status).toBe(200);
    let r = await row(p.reference);
    expect(r.flags).toEqual(["amount_mismatch"]);
    expect(JSON.stringify(r.options)).not.toContain("flags");
    expect(JSON.stringify(r.options)).not.toContain("amount_mismatch");
    // the same flag twice is one flag; a later good payment after abandon adds its own
    expect((await hook(await charge(p.reference, { amount: 2 }))).status).toBe(200);
    expect((await row(p.reference)).flags).toEqual(["amount_mismatch"]);
    await db.payment.update({ where: { id: r.id }, data: { status: "abandoned" } });
    expect((await hook(await charge(p.reference))).status).toBe(200);
    r = await row(p.reference);
    expect(r).toMatchObject({ status: "succeeded" });
    expect(r.flags).toEqual(["amount_mismatch", "late_success_after_abandoned"]);
    const ev = await db.webhookEvent.findMany({ where: { payload: { path: ["data", "reference"], equals: p.reference } } });
    expect(ev.map((e) => e.outcome).sort()).toEqual(["amount_mismatch", "amount_mismatch", "fulfilled"].sort());
    expect(ev.every((e) => e.event === null)).toBe(true);
    const ignored = JSON.stringify({ event: "customeridentification.success", data: { id: 990000 + ++seq } });
    expect((await hook(ignored)).status).toBe(200);
    const ig = await db.webhookEvent.findFirstOrThrow({ where: { type: "customeridentification.success", eventId: { startsWith: "customeridentification.success:" }, payload: { path: ["data", "id"], equals: JSON.parse(ignored).data.id } } });
    expect(ig).toMatchObject({ outcome: "ignored", event: null });
    expect(ig.processedAt).not.toBeNull();
  });

  it("DD4: a payment that is not the caller's is 404 (verify and list); upgrade is not a purpose (422)", async () => {
    const a = await payer();
    const b = await payer();
    const p = await started(a.token);
    expect((await verify(b.token, p.reference)).status).toBe(404);
    expect((await verify(a.token, p.reference)).status).toBe(200);
    expect((await verify(b.token, "fw-no-such")).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    const up = await start(a.token, { purpose: "upgrade", id: "x" });
    expect(up.status).toBe(422);
    expect(up.body.error.fields).toHaveProperty("purpose");
    expect(await db.payment.count({ where: { accountId: a.id } })).toBe(1);
  });

  it("proof again: 10 webhooks and 10 verifies at once on one payment fulfil once, 10 rounds", async () => {
    for (let round = 0; round < 10; round++) {
      calls = 0;
      const a = await payer();
      const p = await started(a.token);
      t.payments.settle(p.reference, "success");
      const body = await charge(p.reference);
      const out = await Promise.all([...Array.from({ length: 10 }, () => hook(body)), ...Array.from({ length: 10 }, () => verify(a.token, p.reference))]);
      expect(out.every((r) => r.status === 200)).toBe(true);
      expect(calls).toBe(1);
      const r = await row(p.reference);
      expect(r.status).toBe("succeeded");
      expect(r.fulfilledAt).not.toBeNull();
      expect(await db.event.count({ where: { name: "paid", key: p.reference } })).toBe(1);
      const entries = await db.ledgerEntry.findMany({ where: { paymentId: r.id } });
      expect(unbalanced(entries)).toEqual([]);
    }
  });

  it("proof again: a forged smaller amount is not fulfilled", async () => {
    const a = await payer();
    const p = await started(a.token);
    for (const amount of [1, p.amountKobo - 1, 0, -5]) expect((await hook(await charge(p.reference, { amount }))).status).toBe(200);
    const r = await row(p.reference);
    expect(r).toMatchObject({ status: "pending", fulfilledAt: null });
    expect(r.flags).toContain("amount_mismatch");
    expect(await db.ledgerEntry.count({ where: { paymentId: r.id } })).toBe(0);
    expect(calls).toBe(0);
  });

  it("proof again: 30 random payments balance", async () => {
    const lots = [KEEPSAKE, { purpose: "extra", id: "five-photos" }, { purpose: "pass" }, { purpose: "keep", id: "month" }];
    const run: string[] = [];
    for (let i = 0; i < 30; i++) {
      const a = await payer();
      const p = await started(a.token, lots[Math.floor(Math.random() * lots.length)]);
      expect((await hook(await charge(p.reference, { fees: Math.floor(Math.random() * 800) }))).status).toBe(200);
      run.push((await row(p.reference)).id);
    }
    const entries = await db.ledgerEntry.findMany({ where: { paymentId: { in: run } } });
    expect(new Set(entries.map((e) => e.paymentId)).size).toBe(30);
    expect(unbalanced(entries)).toEqual([]);
  });
});

describe("P-B05 FF1: a provider that never answers", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    t.app.get(FulfilmentRegistry).replace("ticket.keepsake", () => Promise.resolve());
    t.app.get(FulfilmentRegistry).clearStartChecks(); // INT-4 (GG3): a time-limit spec, not a start-check spec
  });
  afterAll(() => t.close());

  it("FF1: verify answers the payment as it stands (pending) within the limit and grants nothing; a start that times out is a 502 and the payment fails", async () => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `pb05-ff1-${process.pid}@example.com`, sides: ["person"], lastSide: "person" } });
    t.tokens.set(`ff1-${id}`, { kind: "user", accountId: id, sides: ["person"] });
    const auth = bearer(`ff1-${id}`);
    const made = await t.http().post("/v1/payments").set(auth).send(KEEPSAKE);
    expect(made.status).toBe(201);
    const ref = made.body.payment.reference as string;

    // The stand-in now never answers; the kernel's time limit (shortened here) is what ends the wait.
    const never = () => new Promise<never>(() => undefined);
    const port = t.payments as unknown as { verify: unknown; start: unknown };
    port.verify = never;
    port.start = never;
    withTimeLimit(t.payments, "payments", 300);

    const t0 = Date.now();
    const res = await t.http().get(`/v1/payments/${ref}`).set(auth);
    const took = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reference: ref, state: "pending", fulfilled: false });
    expect(took).toBeLessThan(3000);
    const r = await db.payment.findUniqueOrThrow({ where: { providerReference: ref } });
    expect(r).toMatchObject({ status: "pending", fulfilledAt: null });
    expect(await db.ledgerEntry.count({ where: { paymentId: r.id } })).toBe(0);
    expect(await db.event.count({ where: { name: "paid", key: ref } })).toBe(0);

    const t1 = Date.now();
    const s = await t.http().post("/v1/payments").set(auth).send({ purpose: "extra", id: "five-photos" });
    expect(Date.now() - t1).toBeLessThan(3000);
    expect(s.status).toBe(502);
    expect(s.body.error.code).toBe("payment_provider_unavailable");
    const failed = await db.payment.findFirstOrThrow({ where: { accountId: id, purpose: "extra" } });
    expect(failed.status).toBe("failed");
  });
});

describe("P-B05: the abandon job on the tick (clock port)", () => {
  // A clock before every other spec's: the global sweep finds only this spec's old rows.
  const EARLY = new Date("2019-06-01T10:00:00.000Z");
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: EARLY });
    db = t.app.get(PrismaService);
    t.app.get(JobHandlers).registerAll();
  });
  afterAll(() => t.close());

  it("the abandon-payment job, run by the tick, abandons payments 60 minutes or older and no others", async () => {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `pb05-job-${process.pid}@example.com`, sides: ["person"], lastSide: "person" } });
    const make = async (ageMin: number, status: "pending" | "started" | "succeeded" = "pending") => {
      const id = ids.next();
      await db.payment.create({
        data: { id, accountId, purpose: "ticket", lines: [{ sku: "ticket.keepsake", qty: 1, totalKobo: 100 }], amountKobo: 100n, currency: "NGN", priceBookVersion: 1, status, provider: "paystack", providerReference: `job-${id}`, idempotencyKey: `job-${id}`, createdAt: new Date(EARLY.getTime() - ageMin * 60_000) },
      });
      return id;
    };
    const old = await make(60);
    const older = await make(500, "started");
    const young = await make(59);
    const paid = await make(900, "succeeded");
    const key = `pb05-${process.pid}-${Date.now()}`;
    const jobs = t.app.get(JobsService);
    await jobs.schedule("abandon-payment", EARLY, key);
    expect(await jobs.runDue(5, [key])).toBe(1);
    const st = async (id: string) => (await db.payment.findUniqueOrThrow({ where: { id } })).status;
    expect([await st(old), await st(older), await st(young), await st(paid)]).toEqual(["abandoned", "abandoned", "pending", "succeeded"]);
    const job = await db.job.findUniqueOrThrow({ where: { type_subjectId: { type: "abandon_payment", subjectId: key } } });
    const runs = await db.jobRun.findMany({ where: { jobId: job.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("succeeded");
    // a minute later the young one is 60 old: the next run takes it
    t.clock.advance(5 * 60_000);
    expect(await jobs.runDue(5, [key])).toBe(1);
    expect(await st(young)).toBe("abandoned");
    await db.jobRun.deleteMany({ where: { jobId: job.id } });
    await db.job.delete({ where: { id: job.id } });
    await db.payment.deleteMany({ where: { id: { in: [old, older, young, paid] } } });
    // INT-7: an account row is never deleted (the database refuses it); the test leaves its own account row.
  });
});
