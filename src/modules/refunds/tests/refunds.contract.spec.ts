import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { SettlementService } from "../../payments/settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { DAILY_SETTLEMENT_KEY, RefundsModule } from "../refunds.module";
import { BusinessHandlers } from "../../purchases/business-handlers";
import { StandinRefundProvider } from "../../../common/ports/adapters/standin-refund-provider";
import { RefundProviderPort } from "../../../common/ports/refund-provider.port";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2031-03-10T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";

describe("B08 refunds, the settlement check and staff payments (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let provider: StandinRefundProvider;
  const staff: Record<string, { id: string; token: string }> = {};
  const savedTimeouts = process.env.PORT_TIMEOUTS_MS;

  beforeAll(async () => {
    process.env.PORT_TIMEOUTS_MS = "payments=400";
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    provider = t.app.get<RefundProviderPort, StandinRefundProvider>(RefundProviderPort);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    for (const [name, roles] of [["financeA", ["finance"]], ["financeB", ["finance"]], ["owner", ["owner"]], ["ops", ["ops"]], ["support", ["support"]], ["mod", ["moderator"]]] as const) {
      const s = await makeStaff(db, [...roles]);
      const token = `b08-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [...roles] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(async () => {
    if (savedTimeouts === undefined) delete process.env.PORT_TIMEOUTS_MS;
    else process.env.PORT_TIMEOUTS_MS = savedTimeouts;
    await t.close();
  });
  beforeEach(() => {
    t.clock.set(NOW);
    provider.refusing(null);
    provider.hanging(false);
  });

  const account = async (contact: string | null = `b08-${process.pid}-${++seq}@example.com`) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact, name: "Ada", sides: ["person"], lastSide: "person" } });
    return id;
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ...over } as never });
    return id;
  };
  /** A payment as the start would store it, then the provider's good answer through the one settle path. */
  async function pay(accountId: string, sku = "ticket.keepsake", request: Record<string, unknown> = {}, fee: bigint | null = 150n, o: { qty?: number; businessId?: string } = {}) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const qty = o.qty ?? 1;
    const unit = book.promoKobo ?? book.listKobo;
    const total = unit * BigInt(qty);
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId, businessId: o.businessId ?? null, payerContact: null, purpose: "ticket", subjectId: (request.subjectId as string) ?? null,
        lines: [{ sku, name: sku, qty, unitKobo: Number(unit), totalKobo: Number(total) }], amountKobo: total, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x", ...request }, server: { fingerprint: id } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now(), feeKobo: fee });
    return { id, reference, total, outcome: out.outcome };
  }
  const paidTicket = async () => {
    const a = await account();
    const w = await wish(a);
    const p = await pay(a, "ticket.keepsake", { subjectId: w });
    expect(p.outcome).toBe("fulfilled");
    return { a, w, ...p };
  };
  const start = (token: string, paymentId: string, body: Record<string, unknown> = {}) => t.http().post("/v1/admin/refunds").set(auth(token)).send({ paymentId, reason: REASON, ...body });
  const send = (token: string, id: string, reason = REASON) => t.http().post(`/v1/admin/refunds/${id}/approve-refund`).set(auth(token)).send({ reason });
  const refundOf = (paymentId: string) => db.refund.findFirstOrThrow({ where: { paymentId }, orderBy: { id: "desc" } });
  type Items = { items: { reference: string; flags: string[]; type?: string }[] };
  const itemsOf = (r: { body: unknown }) => (r.body as Items).items;
  const hook = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const processed = (reference: string, amount: number, id = 7000 + ++seq) => hook("refund.processed", { id, transaction_reference: reference, amount, status: "processed" });
  const signed = (rows: { journalId: string; direction: string; amountKobo: bigint }[]) => {
    const sums = new Map<string, bigint>();
    for (const e of rows) sums.set(e.journalId, (sums.get(e.journalId) ?? 0n) + (e.direction === "debit" ? e.amountKobo : -e.amountKobo));
    return [...sums.values()].filter((v) => v !== 0n);
  };
  const sentRefund = async (p: { id: string; total: bigint }) => {
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    expect(s.status).toBe(201);
    const r = await send(staff.financeB.token, s.body.id);
    expect(r.status).toBe(200);
    return r.body as { id: string; status: string };
  };

  it("start: the payment's own amount, one audit row with the reason, status requested", async () => {
    const p = await paidTicket();
    const r = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ paymentId: p.id, amountKobo: Number(p.total), status: "requested", reason: "staff-decision", requestedBy: staff.financeA.id });
    const audit = await db.auditEntry.findMany({ where: { subjectId: r.body.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "refund.start", actorId: staff.financeA.id, reason: REASON, section: "/admin/payments" });
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("succeeded");
    expect(provider.asked.filter((a) => a.paymentReference === p.reference)).toHaveLength(0);
  });

  it("start: 401, 403 (wrong role, a user, a role without the section), 422 (reason, amount, body), 404 (unknown, not a uuid), 409 (not paid)", async () => {
    const p = await paidTicket();
    const body = { paymentId: p.id, amountKobo: Number(p.total), reason: REASON };
    expect((await t.http().post("/v1/admin/refunds").send(body)).status).toBe(401);
    expect((await start(staff.mod.token, p.id)).status).toBe(403);
    expect((await start(staff.ops.token, p.id)).status).toBe(403);
    const user = await account();
    t.tokens.set("b08-user", { kind: "user", accountId: user, sides: ["person"] });
    expect((await start("b08-user", p.id)).status).toBe(403);
    const short = await start(staff.financeA.token, p.id, { reason: "ok" });
    expect(short.status).toBe(422);
    expect(short.body.error.fields).toHaveProperty("reason");
    const part = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) - 1 });
    expect(part.status).toBe(422);
    expect(part.body.error.fields).toHaveProperty("amountKobo");
    const noAmount = await start(staff.financeA.token, p.id);
    expect(noAmount.status).toBe(422);
    expect((await start(staff.financeA.token, p.id, { amountKobo: 1.5 })).status).toBe(422);
    expect((await start(staff.financeA.token, ids.next(), { amountKobo: 100 })).status).toBe(404);
    expect((await start(staff.financeA.token, "nope", { amountKobo: 100 })).status).toBe(404);
    expect(await db.refund.count({ where: { paymentId: p.id } })).toBe(0);
    expect(await db.auditEntry.count({ where: { subjectType: "refund", actorId: staff.financeA.id, subjectId: { in: [] } } })).toBe(0);
    // not paid
    const a = await account();
    const id = ids.next();
    await db.payment.create({
      data: { id, accountId: a, purpose: "ticket", lines: [], amountKobo: 5000n, currency: "NGN", priceBookVersion: 1, status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${a}:${id}` },
    });
    expect((await start(staff.financeA.token, id, { amountKobo: 5000 })).status).toBe(409);
  });

  it("start: two at once make one refund row; a payment already being refunded is 409", async () => {
    const p = await paidTicket();
    const [x, y] = await Promise.all([start(staff.financeA.token, p.id, { amountKobo: Number(p.total) }), start(staff.owner.token, p.id, { amountKobo: Number(p.total) })]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect(await db.refund.count({ where: { paymentId: p.id } })).toBe(1);
    expect((await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) })).status).toBe(409);
  });

  it("send: the requester cannot; another finance member can: sent, the provider asked once for the refund's own id, the payment reads 'refund-started'", async () => {
    const p = await paidTicket();
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    expect((await send(staff.financeA.token, s.body.id)).status).toBe(403);
    expect((await refundOf(p.id)).status).toBe("requested");
    expect((await send(staff.mod.token, s.body.id)).status).toBe(403);
    expect((await send(staff.financeB.token, s.body.id, "no")).status).toBe(422);
    expect((await t.http().post(`/v1/admin/refunds/${s.body.id}/approve-refund`).send({ reason: REASON })).status).toBe(401);
    expect((await send(staff.financeB.token, "nope")).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    const r = await send(staff.financeB.token, s.body.id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: s.body.id, status: "sent", approvedBy: staff.financeB.id, providerReference: `standin-refund-${s.body.id}` });
    const asked = provider.asked.filter((a) => a.refundId === s.body.id);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ paymentReference: p.reference });
    expect(asked[0].amount.kobo).toBe(Number(p.total));
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("succeeded");
    const detail = await t.http().get(`/v1/admin/payments/${p.reference}`).set(auth(staff.financeA.token));
    expect(detail.body.state).toBe("refund-started");
    expect((await send(staff.financeB.token, s.body.id)).status).toBe(409);
    expect(await db.auditEntry.count({ where: { subjectId: s.body.id, actorType: "staff" } })).toBe(2);
  });

  it("send: a provider refusal marks it failed with the reason; the payment stays paid and can be started again", async () => {
    const p = await paidTicket();
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    provider.refusing("Transaction is too old to refund");
    const r = await send(staff.owner.token, s.body.id);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("failed");
    const note = await db.auditEntry.findFirstOrThrow({ where: { subjectId: s.body.id, action: "refund.failed" } });
    expect(note).toMatchObject({ actorType: "system", reason: "Transaction is too old to refund" });
    const detail = await t.http().get(`/v1/admin/payments/${p.reference}`).set(auth(staff.financeA.token));
    expect(detail.body.refunds[0].notes[0]).toMatchObject({ action: "refund.failed", text: "Transaction is too old to refund" });
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("succeeded");
    provider.refusing(null);
    expect((await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) })).status).toBe(201);
  });

  it("send: a provider time-out leaves it approved (never succeeded) and the same send can be tried again", async () => {
    const p = await paidTicket();
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    provider.hanging(true);
    const r = await send(staff.financeB.token, s.body.id);
    expect(r.status).toBe(504);
    expect(r.body.error.code).toBe("provider_timeout");
    expect((await refundOf(p.id)).status).toBe("approved");
    provider.hanging(false);
    const again = await send(staff.financeB.token, s.body.id);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("sent");
  });

  it("confirm: one transaction: refunded, reversing rows that balance, originals untouched, what was granted taken back; replay and ten at once change nothing", async () => {
    const p = await paidTicket();
    expect((await db.wish.findUniqueOrThrow({ where: { id: p.w } })).ticket).toBe("keepsake");
    const before = await db.ledgerEntry.findMany({ where: { paymentId: p.id }, orderBy: { id: "asc" } });
    expect(before.length).toBeGreaterThan(2);
    const rf = await sentRefund(p);
    const eventId = 99_000 + ++seq;
    const sends = await Promise.all(Array.from({ length: 10 }, () => processed(p.reference, Number(p.total), eventId)));
    expect(sends.map((s) => s.status)).toEqual(Array(10).fill(200));
    const refund = await db.refund.findUniqueOrThrow({ where: { id: rf.id } });
    expect(refund.status).toBe("succeeded");
    const pay = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(pay.status).toBe("refunded");
    const rows = await db.ledgerEntry.findMany({ where: { paymentId: p.id }, orderBy: { id: "asc" } });
    const mine = rows.filter((r) => r.refundId === rf.id);
    expect(mine.length).toBeGreaterThan(0);
    // the zero-kobo "reversed before accrual" mark (ZZ6) is the one row a refund of a ticket payment may leave beside the originals
    expect(rows.filter((r) => r.refundId === null && !r.memo.startsWith("Royalty reversed before accrual"))).toEqual(before);
    expect(signed(rows)).toEqual([]);
    expect(signed(mine)).toEqual([]);
    const clearing = (rs: typeof rows) => rs.filter((r) => r.account === "provider_clearing").reduce((a, r) => a + (r.direction === "debit" ? r.amountKobo : -r.amountKobo), 0n);
    expect(clearing(mine)).toBe(-p.total);
    expect((await db.wish.findUniqueOrThrow({ where: { id: p.w } })).ticket).toBeNull();
    const ev = await db.webhookEvent.findMany({ where: { type: "refund.processed", eventId: { startsWith: `refund.processed:${eventId}:` } } });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ outcome: "refunded" });
    expect(ev[0].processedAt).not.toBeNull();
    // a replay, and the same news under another event id: nothing more is written
    expect((await processed(p.reference, Number(p.total), eventId)).status).toBe(200);
    expect((await processed(p.reference, Number(p.total))).status).toBe(200);
    expect(await db.ledgerEntry.count({ where: { paymentId: p.id } })).toBe(rows.length);
    expect((await db.webhookEvent.findFirstOrThrow({ where: { type: "refund.processed", eventId: { endsWith: `:` }, outcome: "already" } })).outcome).toBe("already");
    const detail = await t.http().get(`/v1/admin/payments/${p.reference}`).set(auth(staff.ops.token));
    expect(detail.body.state).toBe("refunded");
    expect(detail.body.ledger.length).toBe(rows.length);
    expect((detail.body.events as { type: string }[]).map((e) => e.type)).toContain("refund.processed");
  });

  it("confirm: an event for another amount is flagged on the payment and applies nothing; an unsigned one is refused; an unknown refund is only recorded", async () => {
    const p = await paidTicket();
    const rf = await sentRefund(p);
    const wrong = await processed(p.reference, Number(p.total) - 5);
    expect(wrong.status).toBe(200);
    expect((await db.refund.findUniqueOrThrow({ where: { id: rf.id } })).status).toBe("sent");
    const row = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("succeeded");
    expect(row.flags).toContain("refund_amount_mismatch");
    expect(await db.ledgerEntry.count({ where: { paymentId: p.id, refundId: { not: null } } })).toBe(0);
    const bad = await t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", "00").send("{}");
    expect([400, 401]).toContain(bad.status);
    const stranger = await processed(`fw-${ids.next()}`, 100);
    expect(stranger.status).toBe(200);
    expect((await processed(p.reference, Number(p.total))).status).toBe(200);
    expect((await db.refund.findUniqueOrThrow({ where: { id: rf.id } })).status).toBe("succeeded");
  });

  it("confirm: a refund the provider reports failed is failed, with its reason; the payment is untouched", async () => {
    const p = await paidTicket();
    const rf = await sentRefund(p);
    const r = await hook("refund.failed", { id: 81000 + ++seq, transaction_reference: p.reference, amount: Number(p.total), status: "failed", failure_reason: "Bank account closed" });
    expect(r.status).toBe(200);
    expect((await db.refund.findUniqueOrThrow({ where: { id: rf.id } })).status).toBe("failed");
    expect((await db.auditEntry.findFirstOrThrow({ where: { subjectId: rf.id, action: "refund.failed" } })).reason).toBe("Bank account closed");
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("succeeded");
  });

  it("what could not be taken back (a sealed wish keeps its ticket) is recorded on the refund; the money still goes back", async () => {
    const p = await paidTicket();
    await db.wish.update({ where: { id: p.w }, data: { status: "sealed", sealedAt: NOW } });
    const rf = await sentRefund(p);
    expect((await processed(p.reference, Number(p.total))).status).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("refunded");
    expect((await db.refund.findUniqueOrThrow({ where: { id: rf.id } })).status).toBe("succeeded");
    expect((await db.wish.findUniqueOrThrow({ where: { id: p.w } })).ticket).toBe("keepsake");
    const note = await db.auditEntry.findFirstOrThrow({ where: { subjectId: rf.id, action: "refund.kept" } });
    expect(note.reason).toContain("kept_wish_is_sealed");
    const detail = await t.http().get(`/v1/admin/payments/${p.reference}`).set(auth(staff.financeA.token));
    expect(detail.body.refunds[0].notes[0].text).toContain("kept_wish_is_sealed");
  });

  it("refund_due: a payment that granted nothing is in the staff list; refunding it clears the flag", async () => {
    const a = await account();
    const w = await wish(a);
    await db.account.update({ where: { id: a }, data: { erasedAt: NOW } });
    const p = await pay(a, "ticket.keepsake", { subjectId: w });
    expect(p.outcome).toBe("recorded_unfulfilled");
    const list = await t.http().get("/v1/admin/payments?flag=refund_due&limit=50").set(auth(staff.financeA.token));
    expect(list.status).toBe(200);
    const mine = itemsOf(list).find((i) => i.reference === p.reference);
    expect(mine?.flags).toEqual(expect.arrayContaining(["refund_due", "account_erased"]));
    expect(itemsOf(list).every((i) => i.flags.includes("refund_due"))).toBe(true);
    const r = await t.http().post(`/v1/admin/payments/${p.reference}/refund`).set(auth(staff.owner.token)).send({ reason: REASON });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ reference: p.reference, state: "refund-started" });
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).flags).toContain("refund_due");
    expect((await processed(p.reference, Number(p.total))).status).toBe(200);
    const after = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("refunded");
    expect(after.flags).not.toContain("refund_due");
    expect(after.flags).toContain("account_erased");
    const again = await t.http().get("/v1/admin/payments?flag=refund_due&limit=50").set(auth(staff.financeA.token));
    expect(itemsOf(again).map((i) => i.reference)).not.toContain(p.reference);
    // the one-step route: 401, 403, 404, 409, 422
    expect((await t.http().post(`/v1/admin/payments/${p.reference}/refund`).send({ reason: REASON })).status).toBe(401);
    expect((await t.http().post(`/v1/admin/payments/${p.reference}/refund`).set(auth(staff.support.token)).send({ reason: REASON })).status).toBe(403);
    expect((await t.http().post(`/v1/admin/payments/${p.reference}/refund`).set(auth(staff.financeA.token)).send({ reason: REASON })).status).toBe(409);
    expect((await t.http().post(`/v1/admin/payments/fw-nope/refund`).set(auth(staff.financeA.token)).send({ reason: REASON })).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await t.http().post(`/v1/admin/payments/${p.reference}/refund`).set(auth(staff.financeA.token)).send({ reason: "x" })).status).toBe(422);
  });

  it("staff list: what each was for, the reference, state, flags; find by reference, wish number or the payer's email (masked); cursor pages", async () => {
    const email = `find-${process.pid}-${++seq}@example.com`;
    const a = await account(email);
    const w = await wish(a, { no: `FW-B08-${process.pid}-${seq}` });
    const p1 = await pay(a, "ticket.keepsake", { subjectId: w });
    const p2 = await pay(a, "extra.five-photos", { subjectId: w }).catch(() => null);
    const get = (qs: string, token = staff.financeA.token) => t.http().get(`/v1/admin/payments${qs}`).set(auth(token));
    const byRef = await get(`?q=${encodeURIComponent(p1.reference)}`);
    expect(byRef.status).toBe(200);
    expect(byRef.body.items).toHaveLength(1);
    const item = byRef.body.items[0];
    expect(item).toMatchObject({ reference: p1.reference, ref: p1.reference, line: "ticket.keepsake", status: "succeeded", state: "succeeded", amountKobo: Number(p1.total), accountId: a, wish: `FW-B08-${process.pid}-${seq}`, flags: [] });
    expect(item.person).toBe(`${email.slice(0, 1)}***${email.slice(email.indexOf("@"))}`);
    expect(JSON.stringify(item)).not.toContain(email);
    const byWish = await get(`?q=${encodeURIComponent(`FW-B08-${process.pid}-${seq}`)}`);
    expect(itemsOf(byWish).map((i) => i.reference)).toContain(p1.reference);
    const byMail = await get(`?q=${encodeURIComponent(email.toUpperCase())}&limit=1`);
    expect(byMail.body.items).toHaveLength(1);
    expect(JSON.stringify(byMail.body)).not.toContain(email);
    if (p2) {
      expect(byMail.body.nextCursor).not.toBeNull();
      const next = await get(`?q=${encodeURIComponent(email)}&limit=1&cursor=${encodeURIComponent(byMail.body.nextCursor)}`);
      expect(next.body.items).toHaveLength(1);
      expect(next.body.items[0].id).not.toBe(byMail.body.items[0].id);
      expect(next.body.items[0].id < byMail.body.items[0].id).toBe(true);
    }
    expect((await get("?q=a@")).status).toBe(422);
    expect((await get("?cursor=garbage")).status).toBe(422);
    expect((await get("?limit=51")).status).toBe(422);
    expect((await get("?flag=Bad Flag")).status).toBe(422);
    expect((await t.http().get("/v1/admin/payments")).status).toBe(401);
    expect((await get("", staff.support.token)).status).toBe(403);
    expect((await get("", staff.ops.token)).status).toBe(200);
  });

  it("staff detail: the payment with its ledger rows, refunds and events; 401, 403, 404", async () => {
    const p = await paidTicket();
    const d = await t.http().get(`/v1/admin/payments/${p.reference}`).set(auth(staff.ops.token));
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ reference: p.reference, id: p.id, record: Number(p.total) });
    expect(d.body.ledger.length).toBeGreaterThan(2);
    expect(d.body.refunds).toEqual([]);
    expect(Object.keys(d.body.ledger[0]).sort()).toEqual(["account", "amountKobo", "createdAt", "direction", "id", "journalId", "memo", "refundId"]);
    expect((await t.http().get(`/v1/admin/payments/${p.reference}`)).status).toBe(401);
    expect((await t.http().get(`/v1/admin/payments/${p.reference}`).set(auth(staff.mod.token))).status).toBe(403);
    expect((await t.http().get("/v1/admin/payments/fw-nope").set(auth(staff.ops.token))).status).toBe(422);  // IF2: a name that is not an id is 422 in words
  });

  const e86 = (token: string, reference: string) => t.http().post(`/v1/admin/payments/${reference}/refund`).set(auth(token)).send({ reason: REASON });

  it("TT1: 20 sends at once: the provider is asked once, one answer 200, the rest 409", async () => {
    const p = await paidTicket();
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    const out = await Promise.all(Array.from({ length: 20 }, (_, i) => send(i % 2 ? staff.financeB.token : staff.owner.token, s.body.id)));
    const codes = out.map((o) => o.status);
    expect(codes.filter((c) => c === 200 || c === 504)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(19);
    expect(provider.asked.filter((a) => a.refundId === s.body.id)).toHaveLength(1);
    expect((await refundOf(p.id)).status).toBe("sent");
    expect(await db.auditEntry.count({ where: { subjectId: s.body.id, action: "refund.send" } })).toBe(1);
  });

  it("TT1: a time-out that did land at the provider, then send again: no second refund is created", async () => {
    const p = await paidTicket();
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    provider.hanging(true);
    expect((await send(staff.financeB.token, s.body.id)).status).toBe(504);
    expect((await refundOf(p.id)).status).toBe("approved");
    expect(provider.creations.filter((c) => c === s.body.id)).toHaveLength(1);
    provider.hanging(false);
    const again = await send(staff.owner.token, s.body.id);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: "sent", providerReference: `standin-refund-${s.body.id}` });
    expect(provider.asked.filter((a) => a.refundId === s.body.id)).toHaveLength(2);
    expect(provider.creations.filter((c) => c === s.body.id)).toHaveLength(1);
    expect(await db.refund.count({ where: { paymentId: p.id } })).toBe(1);
  });

  it("TT2: support starts a refund (E-145) and cannot send one or read the payments pages", async () => {
    const p = await paidTicket();
    const s = await start(staff.support.token, p.id, { amountKobo: Number(p.total) });
    expect(s.status).toBe(201);
    expect((await send(staff.support.token, s.body.id)).status).toBe(403);
    expect((await send(staff.financeB.token, s.body.id)).status).toBe(200);
    for (const path of ["/v1/admin/payments", `/v1/admin/payments/${p.reference}`, "/v1/admin/ledger"]) {
      expect((await t.http().get(path).set(auth(staff.support.token))).status).toBe(403);
    }
    expect((await e86(staff.support.token, p.reference)).status).toBe(403);
    expect((await t.http().post("/v1/admin/reconciliations").set(auth(staff.support.token)).send({ day: "2031-03-01", reason: REASON })).status).toBe(403);
  });

  it("TT3: E-86 sends in the same step only for the owner; anyone else leaves it waiting and the answer says so", async () => {
    const mine = await paidTicket();
    const waiting = await e86(staff.financeA.token, mine.reference);
    expect(waiting.status).toBe(200);
    expect(waiting.body).toMatchObject({ reference: mine.reference, state: "refund-waiting" });
    const rf = await refundOf(mine.id);
    expect(rf.status).toBe("requested");
    expect(provider.asked.filter((a) => a.refundId === rf.id)).toHaveLength(0);
    expect((await send(staff.financeA.token, rf.id)).status).toBe(403); // the same person
    expect((await send(staff.financeB.token, rf.id)).status).toBe(200);
    const ops = await paidTicket();
    expect((await e86(staff.ops.token, ops.reference)).body.state).toBe("refund-waiting");
    expect((await refundOf(ops.id)).status).toBe("requested");
    const own = await paidTicket();
    const sent = await e86(staff.owner.token, own.reference);
    expect(sent.body.state).toBe("refund-started");
    expect((await refundOf(own.id)).status).toBe("sent");
  });

  it("TT4: the amount-mismatch flag is cleared in the transaction that marks the refund succeeded", async () => {
    const p = await paidTicket();
    await sentRefund(p);
    expect((await processed(p.reference, Number(p.total) - 1)).status).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).flags).toContain("refund_amount_mismatch");
    expect((await processed(p.reference, Number(p.total))).status).toBe(200);
    const after = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe("refunded");
    expect(after.flags).not.toContain("refund_amount_mismatch");
  });

  it("TT5: two packs, the first partly used, the second refunded: 10 + 5 bought, 6 used, refund the 5: 4 left; then the 10 refunded: 0 left, never below, the kept row says 6 were used", async () => {
    const a = await account();
    const b = ids.next();
    await db.business.create({ data: { id: b, accountId: a, name: "Studio" } });
    const biz = t.app.get(BusinessHandlers);
    const first = await pay(a, "pro.pack", {}, 150n, { qty: 2, businessId: b });
    const second = await pay(a, "pro.pack", {}, 150n, { businessId: b });
    expect((await db.business.findUniqueOrThrow({ where: { id: b } })).pack).toBe(15);
    for (let i = 0; i < 6; i++) expect(await db.$transaction((tx) => biz.draw(tx, b))).toBe("pack");
    expect((await db.business.findUniqueOrThrow({ where: { id: b } })).pack).toBe(9); // 15 - 6
    await sentRefund(second);
    expect((await processed(second.reference, Number(second.total))).status).toBe(200);
    const row = await db.business.findUniqueOrThrow({ where: { id: b } });
    expect(row.pack).toBe(4); // 9 - 5, the first pack's unused wishes stay
    expect(row.plan).toBe("pack");
    const rf = await refundOf(second.id);
    expect(await db.auditEntry.count({ where: { subjectId: rf.id, action: "refund.kept" } })).toBe(0); // all 5 of its wishes were unused
    expect((await db.payment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("succeeded");
    // never below zero: the first pack refunded too, 4 left, 10 to take off
    await sentRefund(first);
    expect((await processed(first.reference, Number(first.total))).status).toBe(200);
    const end = await db.business.findUniqueOrThrow({ where: { id: b } });
    expect(end.pack).toBe(0);
    expect(end.plan).toBeNull();
    const note2 = await db.auditEntry.findFirstOrThrow({ where: { subjectId: (await refundOf(first.id)).id, action: "refund.kept" } });
    expect(note2.reason).toContain("6_of_10_wishes_already_used");
  });

  it("TT6: a plain provider error on the settlement check is 502 in the envelope and writes no row", async () => {
    const spy = jest.spyOn(provider, "settlement").mockRejectedValueOnce(new Error("socket hang up"));
    const r = await t.http().post("/v1/admin/reconciliations").set(auth(staff.financeA.token)).send({ day: "2031-02-20", reason: REASON });
    spy.mockRestore();
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("provider_unavailable");
    expect(await db.reconciliation.count({ where: { day: new Date("2031-02-20T00:00:00.000Z") } })).toBe(0);
  });

  describe("UU1: a claim left with no answer", () => {
    const claimed = async (minutesAgo: number, landed: boolean) => {
      const p = await paidTicket();
      const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
      const at = new Date(NOW.getTime() - minutesAgo * 60_000);
      await db.refund.update({ where: { id: s.body.id }, data: { status: "sent", approvedBy: staff.financeB.id, updatedAt: at } });
      if (landed) provider.created.set(p.reference, { providerReference: "standin-first-ask" });
      return { p, id: s.body.id as string };
    };
    it("(a) claimed 11 minutes ago, the first ask never reached the provider: sent again, one creation", async () => {
      const { p, id } = await claimed(11, false);
      const r = await send(staff.owner.token, id);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "sent", providerReference: `standin-refund-${id}` });
      expect(provider.creations.filter((c) => c === id)).toHaveLength(1);
      expect(await db.refund.count({ where: { paymentId: p.id } })).toBe(1);
    });
    it("(b) claimed 11 minutes ago and the first ask did land: no second creation, the refund takes that reference", async () => {
      const { id } = await claimed(11, true);
      const r = await send(staff.owner.token, id);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "sent", providerReference: "standin-first-ask" });
      expect(provider.creations.filter((c) => c === id)).toHaveLength(0);
    });
    it("(c) claimed 2 minutes ago: 409 and the provider is not asked", async () => {
      const { id } = await claimed(2, false);
      expect((await send(staff.owner.token, id)).status).toBe(409);
      expect(provider.asked.filter((a) => a.refundId === id)).toHaveLength(0);
    });
  });

  describe("settlement check", () => {
    const DAY_X = "2031-04-02";
    let refs: { a: string; b: string; c: string; d: string };

    it("a finished day: our total against the provider's, each difference listed; run twice, changes nothing; nothing is corrected", async () => {
      t.clock.set(new Date(`${DAY_X}T10:00:00.000Z`));
      const a = await account();
      const pa = await pay(a, "ticket.keepsake", {}, 100n);
      const pb = await pay(a, "ticket.keepsake", {}, 100n);
      const pc = await pay(a, "ticket.keepsake", {}, 100n);
      refs = { a: pa.reference, b: pb.reference, c: pc.reference, d: `fw-${ids.next()}` };
      const net = (p: { total: bigint }) => p.total - 100n;
      provider.setSettlement(DAY_X, {
        totalKobo: net(pa) + (net(pb) - 7n) + 5000n,
        lines: [
          { reference: refs.a, netKobo: net(pa) }, // matches
          { reference: refs.b, netKobo: net(pb) - 7n }, // amounts differ
          { reference: refs.d, netKobo: 5000n }, // at the provider, not in ours
          // refs.c is in ours, not at the provider
        ],
      });
      // counted for this test's own payments only: other specs write ledger rows and payments at the same time in the shared database
      const mine = { id: { in: [pa.id, pb.id, pc.id] } };
      const ledgerBefore = await db.ledgerEntry.count({ where: { paymentId: mine.id } });
      const paymentsBefore = await db.payment.count({ where: mine });
      expect((await t.http().post("/v1/admin/reconciliations").set(auth(staff.financeA.token)).send({ day: DAY_X, reason: REASON })).status).toBe(422); // not over yet
      t.clock.set(new Date(`2031-04-03T01:00:00.000Z`));
      const r = await t.http().post("/v1/admin/reconciliations").set(auth(staff.financeA.token)).send({ day: DAY_X, reason: REASON });
      expect(r.status).toBe(201);
      const ours = net(pa) + net(pb) + net(pc);
      expect(r.body).toMatchObject({ providerTotalKobo: Number(net(pa) + net(pb) - 7n + 5000n), ledgerTotalKobo: Number(ours), status: "mismatch" });
      expect(r.body.differenceKobo).toBe(Number(ours - (net(pa) + net(pb) - 7n + 5000n)));
      const diffs = r.body.mismatches as { kind: string; reference: string; oursKobo: number; theirsKobo: number }[];
      expect(diffs.find((d) => d.reference === refs.b)).toEqual({ kind: "amount_differs", reference: refs.b, oursKobo: Number(net(pb)), theirsKobo: Number(net(pb) - 7n) });
      expect(diffs.find((d) => d.reference === refs.c)).toMatchObject({ kind: "ours_only", oursKobo: Number(net(pc)), theirsKobo: 0 });
      expect(diffs.find((d) => d.reference === refs.d)).toMatchObject({ kind: "provider_only", oursKobo: 0, theirsKobo: 5000 });
      expect(diffs.some((d) => d.reference === refs.a)).toBe(false);
      expect(diffs).toHaveLength(3);
      const audit = await db.auditEntry.findMany({ where: { subjectId: r.body.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: "reconciliation.run", reason: REASON });
      // a second run (even with a changed provider answer) is the stored row, unchanged
      provider.setSettlement(DAY_X, { totalKobo: 0n, lines: [] });
      const again = await t.http().post("/v1/admin/reconciliations").set(auth(staff.owner.token)).send({ day: DAY_X, reason: REASON });
      expect(again.body).toEqual(r.body);
      expect(await db.reconciliation.count({ where: { day: new Date(`${DAY_X}T00:00:00.000Z`) } })).toBe(1);
      expect(await db.auditEntry.count({ where: { subjectId: r.body.id } })).toBe(1);
      expect(await db.ledgerEntry.count({ where: { paymentId: mine.id } })).toBe(ledgerBefore);
      expect(await db.payment.count({ where: mine })).toBe(paymentsBefore);
      const view = await t.http().get(`/v1/admin/ledger?day=${DAY_X}`).set(auth(staff.ops.token));
      expect(view.status).toBe(200);
      expect(view.body).toMatchObject({ ours: Number(ours), theirs: r.body.providerTotalKobo, oursCount: 3, theirsCount: 3 });
      expect(view.body.diffs).toEqual(diffs);
    });

    it("two staff runs at once make one row; matched days say matched", async () => {
      const day = "2031-04-04";
      t.clock.set(new Date(`2031-04-05T01:00:00.000Z`));
      provider.setSettlement(day, { totalKobo: 0n, lines: [] });
      const [x, y] = await Promise.all([1, 2].map(() => t.http().post("/v1/admin/reconciliations").set(auth(staff.financeA.token)).send({ day, reason: REASON })));
      expect([x.status, y.status]).toEqual([201, 201]);
      expect(x.body.id).toBe(y.body.id);
      expect(x.body).toMatchObject({ status: "matched", differenceKobo: 0, mismatches: [] });
      expect(await db.reconciliation.count({ where: { day: new Date(`${day}T00:00:00.000Z`) } })).toBe(1);
      expect(await db.auditEntry.count({ where: { subjectId: x.body.id } })).toBe(1);
    });

    it("checks: 401, 403, 422 (bad day, reason), 404 for a day never checked", async () => {
      const body = { day: "2031-04-01", reason: REASON };
      expect((await t.http().post("/v1/admin/reconciliations").send(body)).status).toBe(401);
      expect((await t.http().post("/v1/admin/reconciliations").set(auth(staff.ops.token)).send(body)).status).toBe(403);
      expect((await t.http().post("/v1/admin/reconciliations").set(auth(staff.financeA.token)).send({ day: "31 March", reason: REASON })).status).toBe(422);
      expect((await t.http().post("/v1/admin/reconciliations").set(auth(staff.financeA.token)).send({ day: "2031-04-01", reason: "x" })).status).toBe(422);
      expect((await t.http().get("/v1/admin/ledger").send()).status).toBe(401);
      expect((await t.http().get("/v1/admin/ledger?day=2031-04-01").set(auth(staff.support.token))).status).toBe(403);
      expect((await t.http().get("/v1/admin/ledger?day=2031-01-01").set(auth(staff.ops.token))).status).toBe(404);
      expect((await t.http().get("/v1/admin/ledger?day=soon").set(auth(staff.ops.token))).status).toBe(422);
      const latest = await t.http().get("/v1/admin/ledger").set(auth(staff.ops.token));
      expect(latest.status).toBe(200);
    });

    it("the daily job (registered with the jobs frame) checks yesterday once and sets the next night", async () => {
      const jobs = t.app.get(JobsService);
      const mod = t.app.get(RefundsModule);
      const day = "2031-05-01";
      t.clock.set(new Date("2031-05-02T03:00:00.000Z"));
      provider.setSettlement(day, { totalKobo: 0n, lines: [] });
      mod.registerJobs();
      await jobs.schedule("reconcile-ledger", t.clock.now(), DAILY_SETTLEMENT_KEY);
      expect(await jobs.runDue(5, [DAILY_SETTLEMENT_KEY])).toBe(1);
      const row = await db.reconciliation.findUniqueOrThrow({ where: { day: new Date(`${day}T00:00:00.000Z`) } });
      expect(row.status).toBe("matched");
      const job = await db.job.findFirstOrThrow({ where: { subjectId: DAILY_SETTLEMENT_KEY } });
      expect(job.runAt.toISOString()).toBe("2031-05-03T02:00:00.000Z");
      // run again the same night: nothing is due, and a forced second run changes nothing
      expect(await jobs.runDue(5, [DAILY_SETTLEMENT_KEY])).toBe(0);
      await jobs.schedule("reconcile-ledger", t.clock.now(), DAILY_SETTLEMENT_KEY);
      await jobs.runDue(5, [DAILY_SETTLEMENT_KEY]);
      expect(await db.reconciliation.count({ where: { day: new Date(`${day}T00:00:00.000Z`) } })).toBe(1);
      expect((await db.reconciliation.findUniqueOrThrow({ where: { id: row.id } })).createdAt).toEqual(row.createdAt);
    });
  });
});
