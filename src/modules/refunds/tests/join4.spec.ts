import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { SettlementService } from "../../payments/settlement.service";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { StandinRefundProvider } from "../../../common/ports/adapters/standin-refund-provider";
import { RefundProviderPort } from "../../../common/ports/refund-provider.port";
import { FulfilmentRegistry } from "../../payments/fulfilment.registry";
import { testSlug, testWishNo, RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-03-10T09:00:00.000Z");
const TERM_DAYS: Record<string, number> = { moment: 7, keepsake: 14, signature: 30, premiere: 60 };
/** A wish row's first open is its end less the ticket's term (EE7): the end is worked out from it (HB1). */
const openedFor = (d: Record<string, unknown>): Date | undefined => (d.endsAt instanceof Date && typeof d.ticket === "string" && TERM_DAYS[d.ticket] ? new Date(d.endsAt.getTime() - TERM_DAYS[d.ticket] * 86_400_000) : undefined);
const ids = new UuidV7Maker();
let seq = 0;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const REASON = "Customer asked, checked";

describe("Wave 4 join: invoices with payments and refunds (J1), a refund of a listed wish (J4)", () => {
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
      const token = `j4r-${s.id}`;
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

  const account = async (contact: string | null = `j4r-${RUN}-${++seq}@example.com`) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact, name: "Ada", sides: ["person"], lastSide: "person" } });
    return id;
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ...over, ...(openedFor(over) ? { openedAt: openedFor(over) } : {}) } as never });
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

  const start = (token: string, paymentId: string, body: Record<string, unknown> = {}) => t.http().post("/v1/admin/refunds").set(auth(token)).send({ paymentId, reason: REASON, ...body });
  const send = (token: string, id: string, reason = REASON) => t.http().post(`/v1/admin/refunds/${id}/approve-refund`).set(auth(token)).send({ reason });
  const hook = (event: string, data: Record<string, unknown>) => {
    const body = JSON.stringify({ event, data });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };
  const processed = (reference: string, amount: number, id = 7000 + ++seq) => hook("refund.processed", { id, transaction_reference: reference, amount, status: "processed" });

  const sentRefund = async (p: { id: string; total: bigint }) => {
    const s = await start(staff.financeA.token, p.id, { amountKobo: Number(p.total) });
    expect(s.status).toBe(201);
    const r = await send(staff.financeB.token, s.body.id);
    expect(r.status).toBe(200);
    return r.body as { id: string; status: string };
  };


  const counter = async () => (await db.$queryRaw<{ last: number }[]>`SELECT last FROM invoice_counter WHERE id = 1`)[0].last;
  /** The sequence number an invoice number ends in. */
  const tailOf = (no: string) => Number(/(\d+)$/.exec(no)![1]);
  /** Every committed invoice number, as the sequence numbers they end in. Other specs in the database take numbers too, so a spec
   *  checks its own invoice against this set, never against the counter's value before it paid. */
  const takenNumbers = async () => (await db.$queryRaw<{ n: number }[]>`SELECT substring(no from '[0-9]+$')::int AS n FROM invoice`).map((r) => r.n);
  const business = async () => {
    const a = await account();
    const id = ids.next();
    await db.business.create({ data: { id, accountId: a, name: "Studio", business: "Studio", since: NOW } });
    return { a, b: id };
  };
  const invoicesOf = (businessId: string) => db.$queryRaw<{ id: string; no: string; vat: bigint; amount: bigint; voidedAt: Date | null }[]>`
    SELECT i.id::text AS id, i.no, i.vat, i.amount, k."voidedAt" AS "voidedAt" FROM invoice i JOIN invoice_link k ON k."invoiceId" = i.id WHERE i."businessId" = ${businessId}::uuid`;

  it("J1: a settled plan payment leaves one invoice with the next number and the VAT part; a refund voids it and keeps it", async () => {
    const o = await business();
    const before = await counter();
    const p = await pay(o.a, "pro.starter", {}, 150n, { businessId: o.b });
    expect(p.outcome).toBe("fulfilled");
    const rows = await invoicesOf(o.b);
    expect(rows).toHaveLength(1);
    expect(rows[0].no).toMatch(/^FW-\d{4}-\d{4,}$/);
    // The next number: past the counter as this spec saw it, one more than a number already issued (numbers are taken in
    // order and never skipped), and used by no other invoice.
    const n = tailOf(rows[0].no);
    expect(n).toBeGreaterThan(before);
    expect(n === 1 || (await takenNumbers()).includes(n - 1)).toBe(true);
    expect((await takenNumbers()).filter((x) => x === n)).toHaveLength(1);
    expect(rows[0].amount).toBe(p.total);
    expect(rows[0].vat).toBeGreaterThan(0n);
    expect(rows[0].voidedAt).toBeNull();
    expect(await counter()).toBeGreaterThanOrEqual(n);
    const rf = await sentRefund({ id: p.id, total: p.total });
    expect((await processed(p.reference, Number(p.total))).status).toBe(200);
    expect((await db.refund.findUniqueOrThrow({ where: { id: rf.id } })).status).toBe("succeeded");
    const after = await invoicesOf(o.b);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(rows[0].id);
    expect(after[0].voidedAt).not.toBeNull();
  });

  it("J1: a pack payment is invoiced too; a settle that rolls back leaves no invoice and gives the number back", async () => {
    const o = await business();
    const pk = await pay(o.a, "pro.pack", {}, 150n, { businessId: o.b });
    expect(pk.outcome).toBe("fulfilled");
    expect(await invoicesOf(o.b)).toHaveLength(1);
    const registry = t.app.get(FulfilmentRegistry);
    const original = registry.get("pro.starter")!;
    const before = await counter();
    registry.replace("pro.starter", async (ctx) => {
      await original(ctx);
      throw new Error("settle fails after the invoice is written");
    });
    try {
      await pay(o.a, "pro.starter", {}, 150n, { businessId: o.b }).catch(() => null);
    } finally {
      registry.replace("pro.starter", original);
    }
    expect(await invoicesOf(o.b)).toHaveLength(1);
    // The number the rolled-back settle took is given back: the numbers issued have no gap in them (a number taken and kept
    // would leave one), whoever else issued meanwhile.
    const taken = (await takenNumbers()).sort((a, b) => a - b);
    expect(taken).toEqual(Array.from({ length: taken.length }, (_, i) => taken[0] + i));
    expect(await counter()).toBeGreaterThanOrEqual(before);
    // INT-7: the counter stands at the highest number taken: a number the rolled-back settle kept would leave it one above. Other specs
    // issue numbers too, so the pair is read until the highest number did not move while the counter was read.
    let last: { top: number; counter: number } = { top: -1, counter: -2 };
    for (let i = 0; i < 8; i++) {
      const top = Math.max(...(await takenNumbers()));
      const c = await counter();
      last = { top, counter: c };
      if (Math.max(...(await takenNumbers())) === top && c === top) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect(last.counter).toBe(last.top);
  });

  /** A paid ticket on a wish that is now live and listed on Now showing. */
  async function listedTicket(sku = "ticket.keepsake") {
    const a = await account();
    await db.account.update({ where: { id: a }, data: { sides: ["person", "creator"] } });
    const token = `j4r-owner-${a}`;
    t.tokens.set(token, { kind: "user", accountId: a, sides: ["person", "creator"] });
    const w = await wish(a);
    const p = await pay(a, sku, { subjectId: w });
    expect(p.outcome).toBe("fulfilled");
    const no = testWishNo();
    await db.wish.update({
      where: { id: w },
      data: { status: "live", no, name: "Ada", opensAt: new Date(NOW.getTime() - 86_400_000), openedAt: new Date(NOW.getTime() - 3_600_000), endsAt: new Date(NOW.getTime() + 7 * 86_400_000) },
    });
    await db.wishLink.create({ data: { id: ids.next(), slug: testSlug("ada-j4"), wishId: w, active: true } });
    expect((await t.http().post(`/v1/wishes/${w}/publish-requests`).set(auth(token)).send({ consent: true })).status).toBe(201);
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w, status: "waiting" } });
    expect((await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(auth(staff.mod.token)).send({ decision: "approve", reason: "Looks lovely" })).status).toBe(200);
    return { a, w, token, ...p };
  }
  const publicHas = async (wishId: string) => {
    let cursor: string | null = null;
    do {
      const r = await t.http().get(`/v1/showing?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
      if ((r.body.items as { wish: string }[]).some((i) => i.wish === wishId)) return true;
      cursor = r.body.nextCursor as string | null;
    } while (cursor);
    return false;
  };

  it("J4: refunding the ticket of a listed wish: the wish is live, so the ticket is kept (kept_wish_is_sealed) and the wish stays listed", async () => {
    const x = await listedTicket();
    expect(await publicHas(x.w)).toBe(true);
    await sentRefund({ id: x.id, total: x.total });
    expect((await processed(x.reference, Number(x.total))).status).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: x.id } })).status).toBe("refunded");
    const w = await db.wish.findUniqueOrThrow({ where: { id: x.w } });
    expect(w.status).toBe("live");
    expect(w.ticket).not.toBeNull();
    expect(await db.publishedWish.count({ where: { wishId: x.w } })).toBe(1);
    expect(await publicHas(x.w)).toBe(true);
    const kept = await db.auditEntry.findMany({ where: { action: "refund.kept", reason: { contains: "kept_wish_is_sealed" } } });
    expect(kept.length).toBeGreaterThan(0);
  });

  it("J4: refunding a keep that ends the wish's term: the wish rests, its listing and ask go, and it needs a new ask", async () => {
    const x = await listedTicket();
    const k = await pay(x.a, "keep.month", { subjectId: x.w });
    expect(k.outcome).toBe("fulfilled");
    const grant = await db.purchaseGrant.findFirstOrThrow({ where: { paymentId: k.id } });
    const days = Number((grant.detail as { days: number }).days);
    expect(days).toBe(30);
    t.clock.set(new Date(NOW.getTime() + 15 * 86_400_000)); // past the wish's own term (HB1 works the end out from it), inside the keep's
    await sentRefund({ id: k.id, total: k.total });
    expect((await processed(k.reference, Number(k.total))).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: x.w } })).endsAt!.getTime()).toBeLessThan(t.clock.now().getTime());
    await t.app.get(JobsService).runDue(20, [x.w]);
    expect((await db.wish.findUniqueOrThrow({ where: { id: x.w } })).status).toBe("resting");
    expect(await db.publishedWish.count({ where: { wishId: x.w } })).toBe(0);
    expect(await db.publishRequest.count({ where: { wishId: x.w } })).toBe(0);
    expect(await publicHas(x.w)).toBe(false);
    const again = await t.http().post(`/v1/wishes/${x.w}/publish-requests`).set(auth(x.token)).send({ consent: true });
    expect(again.status).toBe(409);
  });
});
