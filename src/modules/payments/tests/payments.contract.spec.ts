import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { PriceBookService } from "../../price-book/price-book.service";
import { abandonPendingPayments, PAYMENTS_ABANDON_AFTER_MINUTES } from "../abandon";
import { FulfilmentRegistry, type FulfilmentContext } from "../fulfilment.registry";
import { paymentEntries, vatInside } from "../ledger";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
let seq = 0;

describe("payments core E-87, E-88, E-217 (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let book: PriceBookService;
  let registry: FulfilmentRegistry;
  const calls: FulfilmentContext[] = [];

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    book = t.app.get(PriceBookService);
    registry = t.app.get(FulfilmentRegistry);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    for (const sku of ["ticket.keepsake", "extra.five-photos", "pro.pack", "pass.year", "keep.month"]) {
      registry.replace(sku, (ctx) => {
        calls.push(ctx);
        return Promise.resolve();
      });
    }
  });
  afterAll(() => t.close());
  beforeEach(() => {
    calls.length = 0;
  });

  async function payer(email: string | null = `b05-${process.pid}-${++seq}@example.com`) {
    const id = ids.next();
    await db.account.create({ data: { id, contact: email, sides: ["person"], lastSide: "person" } });
    const token = `b05-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  }
  const start = (token: string, body: Record<string, unknown>, key?: string) => {
    const r = t.http().post("/v1/payments").set(bearer(token));
    if (key) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  const KEEPSAKE = { purpose: "ticket", ticket: "keepsake" };
  const hook = (body: string, sig?: string) => {
    const r = t.http().post("/v1/webhooks/paystack").set("content-type", "application/json");
    if (sig !== undefined) r.set("x-paystack-signature", sig);
    return r.send(body);
  };
  const charge = (reference: string, over: Record<string, unknown> = {}, id = ++seq + 900000) =>
    JSON.stringify({ event: "charge.success", data: { id, reference, amount: 0, currency: "NGN", channel: "card", fees: 150, paid_at: NOW.toISOString(), ...over } });
  const signedHook = (body: string) => hook(body, t.payments.sign(body));
  const rows = (reference: string) => db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
  const ledgerOf = async (paymentId: string) => db.ledgerEntry.findMany({ where: { paymentId } });
  /** Signed journals: debits minus credits, per journal. */
  const unbalanced = (entries: { journalId: string; direction: string; amountKobo: bigint }[]) => {
    const sums = new Map<string, bigint>();
    for (const e of entries) sums.set(e.journalId, (sums.get(e.journalId) ?? 0n) + (e.direction === "debit" ? e.amountKobo : -e.amountKobo));
    return [...sums.values()].filter((v) => v !== 0n);
  };
  async function started(token: string, body: Record<string, unknown> = KEEPSAKE, key?: string) {
    const r = await start(token, body, key);
    expect(r.status).toBe(201);
    return r.body.payment as { reference: string; state: string; amountKobo: number; authorizationUrl: string };
  }
  const successBody = async (reference: string, over: Record<string, unknown> = {}) => charge(reference, { amount: Number((await rows(reference)).amountKobo), ...over });

  it("start: priced by the server, a pending Payment, the port asked, the shape of PaymentStarted", async () => {
    const a = await payer();
    const quote = await book.quote([{ sku: "ticket.keepsake" }], NOW);
    const r = await start(a.token, KEEPSAKE);
    expect(r.status).toBe(201);
    expect(r.body.item).toBeNull();
    expect(Object.keys(r.body.payment).sort()).toEqual(["amountKobo", "authorizationUrl", "reference", "state"]);
    expect(r.body.payment).toMatchObject({ state: "pending", amountKobo: quote.totalKobo });
    expect(r.body.payment.authorizationUrl).toMatch(/^https:\/\/checkout\./);
    const row = await rows(r.body.payment.reference);
    expect(row).toMatchObject({ status: "pending", accountId: a.id, priceBookVersion: quote.version, provider: "paystack", currency: "NGN" });
    expect(row.amountKobo).toBe(BigInt(quote.totalKobo));
    expect(r.body.payment.reference).toBe(`fw-${row.id}`);
    expect(t.payments.started.at(-1)).toMatchObject({ reference: r.body.payment.reference, email: expect.stringContaining("@") });
    expect(t.payments.started.at(-1)?.amount.kobo).toBe(quote.totalKobo);
  });

  it("start: 401 without a token, 422 for an amount or an unknown field, a bad line, no email; a non-canonical purpose is normalised", async () => {
    const a = await payer();
    expect((await t.http().post("/v1/payments").send(KEEPSAKE)).status).toBe(401);
    for (const field of ["amount", "amountKobo", "price"]) {
      const r = await start(a.token, { ...KEEPSAKE, [field]: 1 });
      expect(r.status).toBe(422);
      expect(r.body.error.fields[field]).toBeDefined();
    }
    expect((await start(a.token, { purpose: "nonsense" })).status).toBe(422);
    const bad = await start(a.token, { purpose: "ticket", ticket: "not-a-line" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).length).toBeGreaterThan(0);
    expect((await start(a.token, { purpose: "ticket" })).status).toBe(422);
    const noMail = await payer(null);
    expect((await start(noMail.token, KEEPSAKE)).status).toBe(422);
    const r = await start(a.token, { purpose: " Ticket ", ticket: "keepsake" });
    expect(r.status).toBe(201);
    expect((await rows(r.body.payment.reference)).purpose).toBe("ticket");
  });

  it("start: a business line needs a business (403 without one)", async () => {
    const a = await payer();
    expect((await start(a.token, { purpose: "wish-pack", packs: 1 })).status).toBe(403);
  });

  it("idempotency: the same key and body is one payment and one row, also sent at once; another body is 409; keys are per account", async () => {
    const a = await payer();
    const key = `key-${ids.next()}`;
    const first = await start(a.token, KEEPSAKE, key);
    const again = await start(a.token, KEEPSAKE, key);
    expect(again.status).toBe(201); // still waiting: the same answer
    expect(again.body).toEqual(first.body);
    expect(await db.payment.count({ where: { accountId: a.id } })).toBe(1);
    expect(t.payments.started.filter((s) => s.reference === first.body.payment.reference)).toHaveLength(1);
    const other = await start(a.token, { purpose: "extra", id: "five-photos" }, key);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("idempotency_key_reused");
    const b = await payer();
    const theirs = await start(b.token, { purpose: "extra", id: "five-photos" }, key);
    expect(theirs.status).toBe(201);
    const racer = await payer();
    const k2 = `race-${ids.next()}`;
    const all = await Promise.all(Array.from({ length: 6 }, () => start(racer.token, KEEPSAKE, k2)));
    expect(all.every((r) => r.status === 201 && r.body.payment.reference === all[0].body.payment.reference)).toBe(true);
    expect(await db.payment.count({ where: { accountId: racer.id } })).toBe(1);
    expect((await start(a.token, KEEPSAKE, "short")).status).toBe(422);
  });

  it("webhook: only a valid signature over the raw body is accepted", async () => {
    const a = await payer();
    const p = await started(a.token);
    const body = await successBody(p.reference);
    expect((await hook(body)).status).toBe(401);
    expect((await hook(body, "deadbeef")).status).toBe(401);
    expect((await hook(body, t.payments.sign(`${body} `))).status).toBe(401);
    expect((await hook(body, "not hex!")).status).toBe(401);
    expect(await db.webhookEvent.count({ where: { payload: { path: ["data", "reference"], equals: p.reference } } })).toBe(0);
    expect((await rows(p.reference)).status).toBe("pending");
    expect((await signedHook(body)).status).toBe(200);
  });

  it("paid: state, balanced ledger, fulfilledAt, the handler once, the paid event; a replay changes nothing", async () => {
    const a = await payer();
    const p = await started(a.token);
    const body = await successBody(p.reference);
    const r1 = await signedHook(body);
    expect(r1.status).toBe(200);
    const row = await rows(p.reference);
    expect(row.status).toBe("succeeded");
    expect(row.fulfilledAt).not.toBeNull();
    expect(row.feeKobo).toBe(150n);
    expect(row.channel).toBe("card");
    expect(calls.map((c) => c.line.sku)).toEqual(["ticket.keepsake"]);
    expect(calls[0].payment.id).toBe(row.id);
    const entries = await ledgerOf(row.id);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(unbalanced(entries)).toEqual([]);
    const debit = entries.filter((e) => e.journalId === entries[0].journalId && e.direction === "debit").reduce((s, e) => s + e.amountKobo, 0n);
    expect(debit).toBe(row.amountKobo);
    expect(entries.every((e) => e.currency === "NGN" && e.paymentId === row.id)).toBe(true);
    expect(await db.event.count({ where: { name: "paid", key: p.reference } })).toBe(1);
    const r2 = await signedHook(body);
    expect(r2.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(await db.ledgerEntry.count({ where: { paymentId: row.id } })).toBe(entries.length);
    expect(await db.webhookEvent.count({ where: { payload: { path: ["data", "reference"], equals: p.reference } } })).toBe(1);
    const stored = await db.webhookEvent.findFirstOrThrow({ where: { payload: { path: ["data", "reference"], equals: p.reference } } });
    expect(stored).toMatchObject({ provider: "paystack", type: "charge.success", signatureValid: true });
    expect(stored.processedAt).not.toBeNull();
  });

  it("the same event delivered at once is stored once and fulfils once", async () => {
    const a = await payer();
    const p = await started(a.token);
    const body = await successBody(p.reference);
    const all = await Promise.all(Array.from({ length: 5 }, () => signedHook(body)));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(await db.webhookEvent.count({ where: { payload: { path: ["data", "reference"], equals: p.reference } } })).toBe(1);
    expect(await db.ledgerEntry.count({ where: { paymentId: (await rows(p.reference)).id } })).toBeGreaterThan(0);
  });

  it("webhook and verify at the same moment fulfil once", async () => {
    for (let i = 0; i < 4; i++) {
      calls.length = 0;
      const a = await payer();
      const p = await started(a.token);
      t.payments.settle(p.reference, "success");
      const body = await successBody(p.reference);
      const [w, v, v2] = await Promise.all([signedHook(body), t.http().get(`/v1/payments/${p.reference}`).set(bearer(a.token)), t.http().get(`/v1/payments/${p.reference}`).set(bearer(a.token))]);
      expect([w.status, v.status, v2.status]).toEqual([200, 200, 200]);
      expect(calls).toHaveLength(1);
      const row = await rows(p.reference);
      expect(row.status).toBe("succeeded");
      expect(unbalanced(await ledgerOf(row.id))).toEqual([]);
      expect(await db.event.count({ where: { name: "paid", key: p.reference } })).toBe(1);
    }
  });

  it("an event for an unknown reference is stored and flagged, not dropped", async () => {
    const ref = `fw-${ids.next()}`;
    expect((await signedHook(charge(ref, { amount: 5000 }))).status).toBe(200);
    const ev = await db.webhookEvent.findFirstOrThrow({ where: { payload: { path: ["data", "reference"], equals: ref } } });
    expect(ev.outcome).toBe("unknown_reference");
    expect(ev.event).toBeNull();
    expect(ev.processedAt).not.toBeNull();
  });

  it("success for another amount or currency is not fulfilled and is flagged", async () => {
    for (const over of [{ amount: 100 }, { currency: "USD" }]) {
      const a = await payer();
      const p = await started(a.token);
      const body = await successBody(p.reference, over);
      expect((await signedHook(body)).status).toBe(200);
      const row = await rows(p.reference);
      expect(row.status).toBe("pending");
      expect(row.fulfilledAt).toBeNull();
      expect(await ledgerOf(row.id)).toHaveLength(0);
      expect(calls).toHaveLength(0);
      expect(row.flags).toEqual(["amount_mismatch"]);
      const ev = await db.webhookEvent.findFirstOrThrow({ where: { payload: { path: ["data", "reference"], equals: p.reference } } });
      expect(ev.outcome).toBe("amount_mismatch");
    }
    const a = await payer();
    const p = await started(a.token);
    t.payments.settle(p.reference, "success", (await import("../../../common/money/money")).Money.kobo(100));
    const v = await t.http().get(`/v1/payments/${p.reference}`).set(bearer(a.token));
    expect(v.body.state).toBe("pending");
    expect(calls).toHaveLength(0);
  });

  it("a handler that throws undoes everything, and the next delivery retries cleanly", async () => {
    const a = await payer();
    const p = await started(a.token, { purpose: "extra", id: "five-photos" });
    let boom = true;
    registry.replace("extra.five-photos", async (ctx) => {
      await ctx.tx.$executeRaw`SELECT 1`;
      calls.push(ctx);
      if (boom) throw new Error("handler broke");
    });
    const body = await successBody(p.reference);
    const bad = await signedHook(body);
    expect(bad.status).toBe(500);
    let row = await rows(p.reference);
    expect(row).toMatchObject({ status: "pending", fulfilledAt: null });
    expect(await ledgerOf(row.id)).toHaveLength(0);
    expect(await db.event.count({ where: { name: "paid", key: p.reference } })).toBe(0);
    const ev = await db.webhookEvent.findFirstOrThrow({ where: { payload: { path: ["data", "reference"], equals: p.reference } } });
    expect(ev.processedAt).toBeNull();
    boom = false;
    expect((await signedHook(body)).status).toBe(200);
    row = await rows(p.reference);
    expect(row.status).toBe("succeeded");
    expect(unbalanced(await ledgerOf(row.id))).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(await db.webhookEvent.count({ where: { payload: { path: ["data", "reference"], equals: p.reference } } })).toBe(1);
  });

  it("a line with no registered handler fails the settle and keeps the payment pending", async () => {
    const a = await payer();
    const p = await started(a.token, { purpose: "keep", id: "month" });
    registry.clear("keep.month");
    const body = await successBody(p.reference);
    expect((await signedHook(body)).status).toBe(500);
    expect((await rows(p.reference)).status).toBe("pending");
    registry.replace("keep.month", (ctx) => {
      calls.push(ctx);
      return Promise.resolve();
    });
    expect((await signedHook(body)).status).toBe(200);
    expect((await rows(p.reference)).status).toBe("succeeded");
  });

  it("verify: asks the port, ignores the query, the payer's own only", async () => {
    const a = await payer();
    const b = await payer();
    const p = await started(a.token);
    t.payments.settle(p.reference, "pending");
    const lie = await t.http().get(`/v1/payments/${p.reference}`).query({ status: "success", amount: 1 }).set(bearer(a.token));
    expect(lie.status).toBe(422);
    expect((await rows(p.reference)).status).toBe("pending");
    const pending = await t.http().get(`/v1/payments/${p.reference}`).set(bearer(a.token));
    expect(pending.status).toBe(200);
    expect(pending.body).toMatchObject({ reference: p.reference, state: "pending", amountKobo: p.amountKobo, fulfilled: false });
    expect(pending.body.idempotencyKey).toBeUndefined();
    expect(pending.body.options).toBeUndefined();
    expect(calls).toHaveLength(0);
    t.payments.settle(p.reference, "success");
    expect((await t.http().get(`/v1/payments/${p.reference}`).set(bearer(b.token))).status).toBe(404);
    expect((await t.http().get(`/v1/payments/${p.reference}`)).status).toBe(401);
    const done = await t.http().get(`/v1/payments/${p.reference}`).set(bearer(a.token));
    expect(done.body).toMatchObject({ state: "succeeded", fulfilled: true, authorizationUrl: null });
    expect(calls).toHaveLength(1);
    expect(await t.http().get(`/v1/payments/${p.reference}`).set(bearer(a.token))).toMatchObject({ status: 200 });
    expect(calls).toHaveLength(1);
    expect((await t.http().get(`/v1/payments/fw-nothing`).set(bearer(a.token))).status).toBe(404);
  });

  it("abandoned: past the declared time a pending payment is marked; a late success still fulfils once and is flagged", async () => {
    const a = await payer();
    const old = await started(a.token);
    t.clock.advance((PAYMENTS_ABANDON_AFTER_MINUTES - 1) * 60_000);
    const fresh = await started(a.token, { purpose: "extra", id: "five-photos" });
    await abandonPendingPayments(db, t.clock.now()); // sweeps every spec payment that is 60 minutes or older, none of ours yet
    expect((await rows(old.reference)).status).toBe("pending");
    t.clock.advance(60_000);
    expect(await abandonPendingPayments(db, t.clock.now())).toBeGreaterThanOrEqual(1);
    expect((await rows(old.reference)).status).toBe("abandoned");
    expect((await rows(fresh.reference)).status).toBe("pending");
    const body = await successBody(old.reference);
    expect((await signedHook(body)).status).toBe(200);
    const row = await rows(old.reference);
    expect(row.status).toBe("succeeded");
    expect(row.flags).toEqual(["late_success_after_abandoned"]);
    expect(calls).toHaveLength(1);
    expect(await abandonPendingPayments(db, t.clock.now())).toBeGreaterThanOrEqual(0);
    expect((await rows(old.reference)).status).toBe("succeeded");
  });

  it("list: the payer's own, newest first, by cursor", async () => {
    const a = await payer();
    const b = await payer();
    for (let i = 0; i < 3; i++) await started(a.token);
    await started(b.token);
    const svc = (await import("../payments.service")).PaymentsService;
    const s = t.app.get(svc);
    const p1 = await s.listOwn(a.id, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await s.listOwn(a.id, { limit: 2, cursor: p1.nextCursor as string });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...p1.items, ...p2.items].map((x) => x.id)).size).toBe(3);
    expect((await s.listOwn(b.id)).items).toHaveLength(1);
    await expect(s.listOwn(a.id, { cursor: "x" })).rejects.toMatchObject({ status: 422 });
  });

  it("the ledger is never updated or deleted, and every journal of a random run of payments sums to zero", async () => {
    const run: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = await payer();
      const body = [KEEPSAKE, { purpose: "extra", id: "five-photos" }, { purpose: "pass" }, { purpose: "keep", id: "month" }][i % 4];
      const p = await started(a.token, body);
      const fee = i % 2 ? { fees: Math.floor(Math.random() * 500) } : { fees: 0 };
      expect((await signedHook(await successBody(p.reference, fee))).status).toBe(200);
      run.push((await rows(p.reference)).id);
    }
    const all = await db.ledgerEntry.findMany({ where: { paymentId: { in: run } } });
    expect(all.length).toBeGreaterThan(16);
    expect(unbalanced(all)).toEqual([]);
    await expect(db.ledgerEntry.update({ where: { id: all[0].id }, data: { memo: "changed" } })).rejects.toThrow();
    await expect(db.ledgerEntry.delete({ where: { id: all[0].id } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE ledger_entry SET "amountKobo" = 1 WHERE id = ${all[0].id}::uuid`).rejects.toThrow();
  });

  it("an erased account's payment is recorded in the ledger but nothing is fulfilled, and it is flagged", async () => {
    const a = await payer();
    const p = await started(a.token);
    await db.account.update({ where: { id: a.id }, data: { erasedAt: NOW } });
    expect((await signedHook(await successBody(p.reference))).status).toBe(200);
    const row = await rows(p.reference);
    expect(row).toMatchObject({ status: "succeeded", fulfilledAt: null });
    expect(row.flags).toContain("account_erased");
    expect(calls).toHaveLength(0);
    expect(unbalanced(await ledgerOf(row.id))).toEqual([]);
    expect((await start(a.token, KEEPSAKE)).status).toBe(401);
  });

  it("HH5 an erased account's payment is also flagged refund_due", async () => {
    const a = await payer();
    const p = await started(a.token);
    await db.account.update({ where: { id: a.id }, data: { erasedAt: NOW } });
    expect((await signedHook(await successBody(p.reference))).status).toBe(200);
    expect((await rows(p.reference)).flags).toEqual(expect.arrayContaining(["account_erased", "refund_due"]));
  });

  it("webhook: refund events are stored for the refunds bundle; junk with a valid signature is 400", async () => {
    const body = JSON.stringify({ event: "refund.processed", data: { id: 777000 + ++seq, reference: "fw-x" } });
    expect((await signedHook(body)).status).toBe(200);
    const ev = await db.webhookEvent.findFirstOrThrow({ where: { type: "refund.processed", payload: { path: ["data", "id"], equals: JSON.parse(body).data.id } } });
    expect(ev.processedAt).toBeNull();
    expect((await signedHook("not json")).status).toBe(400);
    expect((await signedHook(JSON.stringify({ event: "charge.success" }))).status).toBe(400);
  });
});

describe("ledger entries (unit)", () => {
  it("VAT inside a price is split to the kobo and every journal balances", () => {
    expect(vatInside(10750n, 750n)).toBe(750n);
    for (let i = 0; i < 200; i++) {
      const lines = [1 + Math.floor(Math.random() * 5_000_000), 1 + Math.floor(Math.random() * 90_000)].map((n, k) => ({ sku: k ? "extra.qr-card" : "ticket.moment", totalKobo: BigInt(n), vatIncluded: Math.random() > 0.5 }));
      let n = 0;
      const drafts = paymentEntries({ journal: () => `j${++n}`, lines, vatRate: "7.5", feeKobo: BigInt(Math.floor(Math.random() * 3000)), reference: "fw-1" });
      const sums = new Map<string, bigint>();
      for (const d of drafts) sums.set(d.journalId, (sums.get(d.journalId) ?? 0n) + (d.direction === "debit" ? d.amountKobo : -d.amountKobo));
      expect([...sums.values()].every((v) => v === 0n)).toBe(true);
      expect(drafts.every((d) => d.amountKobo > 0n || d.account === "provider_fees")).toBe(true);
    }
  });
});
