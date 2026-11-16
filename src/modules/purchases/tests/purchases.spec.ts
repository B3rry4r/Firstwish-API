import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { EntitlementsService } from "../../price-book/entitlements.service";
import { FulfilmentRegistry } from "../../payments/fulfilment.registry";
import { SettlementService } from "../../payments/settlement.service";
import { PassService } from "../pass.service";
import { BusinessHandlers } from "../business-handlers";
import { PurchasesService } from "../purchases.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
let seq = 0;

describe("purchases B07: what a payment buys", () => {
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

  const account = async () => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `b07-${process.pid}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    return id;
  };
  const business = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.business.create({ data: { id, accountId, name: "Studio", ...over } });
    return id;
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ...over } as never,
    });
    return id;
  };
  const wishRow = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const paymentRow = (reference: string) => db.payment.findUniqueOrThrow({ where: { providerReference: reference } });

  /** A payment as the start would have stored it, then the provider's good answer through the one settle path. */
  async function pay(accountId: string, sku: string, request: Record<string, unknown> = {}, o: { qty?: number; businessId?: string } = {}) {
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
  const grants = (paymentId: string) => db.$queryRaw<{ sku: string; kind: string; refusedReason: string | null; detail: Record<string, unknown>; revokedAt: Date | null }[]>`
    SELECT sku, kind, "refusedReason", detail, "revokedAt" FROM purchase_grant WHERE "paymentId" = ${paymentId}::uuid ORDER BY sku`;
  const flagged = async (reference: string) => (await paymentRow(reference)).flags;

  it("1. every line of the seeded price book has a handler and an entitlement", async () => {
    const lines = await db.price.findMany({ where: { version: (await db.price.aggregate({ _max: { version: true } }))._max.version ?? 1 } });
    expect(lines.length).toBeGreaterThan(20);
    const ent = t.app.get(EntitlementsService);
    const missing: string[] = [];
    for (const l of lines) {
      if (!registry.get(l.sku)) missing.push(`${l.sku}: no handler`);
      try {
        await ent.for(l.sku);
      } catch {
        missing.push(`${l.sku}: no entitlement`);
      }
    }
    expect(missing).toEqual([]);
    // the price book's own file agrees with the database about which lines are sold
    const file = JSON.parse(readFileSync(join(ROOT, ".pipeline/declared/price-book.json"), "utf8")) as { seed: { prices: { sku: string }[] } };
    const declared = file.seed.prices.map((p) => p.sku);
    for (const sku of declared.filter((s) => s !== "concierge.rush")) expect(registry.get(sku)).toBeDefined();
    // keeps are never discounted
    for (const l of lines.filter((x) => x.sku.startsWith("keep.") || x.sku.startsWith("vault."))) expect(l.promoKobo).toBeNull();
  });

  it("2. ticket: the wish gets it; a paid-in-a-style event; a repeat of the handler changes nothing", async () => {
    const a = await account();
    const w = await wish(a);
    const ref = await pay(a, "ticket.keepsake", { subjectId: w });
    expect((await wishRow(w)).ticket).toBe("keepsake");
    const p = await paymentRow(ref);
    expect(p.flags).toEqual([]);
    const ev = await db.event.findFirstOrThrow({ where: { name: "paid", key: ref } });
    expect(ev.styleSlug).toBe("golden");
    expect(ev.wishId).toBe(w);
    const before = await wishRow(w);
    // the same payment's handler run again inside a transaction changes nothing
    await db.$transaction(async (tx) => {
      await registry.get("ticket.keepsake")!({ tx, payment: p, line: { sku: "ticket.keepsake", name: "k", qty: 1, unitKobo: 1, totalKobo: 1 }, request: { purpose: "ticket", subjectId: w }, grant: () => t.app.get(EntitlementsService).for("ticket.keepsake") });
    });
    expect((await wishRow(w)).version).toBe(before.version);
    expect(await grants(p.id)).toHaveLength(1);
  });

  it("2. ticket: upgrade only upward; same ticket, a stranger's wish, an erased wish and a sealed wish are flagged and grant nothing", async () => {
    const a = await account();
    const other = await account();
    const w = await wish(a, { ticket: "keepsake" });
    const up = await pay(a, "ticket.signature", { subjectId: w });
    expect((await wishRow(w)).ticket).toBe("signature");
    expect(await flagged(up)).toEqual([]);
    const down = await pay(a, "ticket.keepsake", { subjectId: w });
    expect((await wishRow(w)).ticket).toBe("signature");
    expect(await flagged(down)).toContain("refund_due:ticket_not_an_upgrade");
    const same = await pay(a, "ticket.signature", { subjectId: w });
    expect(await flagged(same)).toContain("refund_due:ticket_already_held");
    const strangers = await wish(other);
    const s = await pay(a, "ticket.moment", { subjectId: strangers });
    expect((await wishRow(strangers)).ticket).toBeNull();
    expect(await flagged(s)).toContain("refund_due:wish_not_payers");
    const erased = await wish(a, { status: "removed", erasedAt: NOW });
    expect(await flagged(await pay(a, "ticket.moment", { subjectId: erased }))).toContain("refund_due:wish_erased");
    const sealed = await wish(a, { status: "sealed" });
    expect(await flagged(await pay(a, "ticket.moment", { subjectId: sealed }))).toContain("refund_due:wish_sealed");
    expect(await flagged(await pay(a, "ticket.moment", { subjectId: "not-an-id" }))).toContain("refund_due:wish_not_payers");
    const pr = await paymentRow(s);
    expect(pr.status).toBe("succeeded");
    expect((await db.ledgerEntry.count({ where: { paymentId: pr.id } })) > 0).toBe(true);
  });

  it("3. extras: recorded on the wish; the Keepsake ceiling holds at start and at fulfilment; an extra the ticket does not take is flagged", async () => {
    const a = await account();
    const w = await wish(a, { ticket: "keepsake" });
    // list prices: five-photos 200000, qr-card 250000, premium-style 400000, portrait-video 350000; the ceiling is 750000
    for (const sku of ["extra.five-photos", "extra.qr-card", "extra.five-photos"]) await pay(a, sku, { subjectId: w });
    expect((await wishRow(w)).adds).toEqual(["extra.five-photos", "extra.qr-card", "extra.five-photos"]);
    const purchasesSvc = purchases;
    await expect(purchasesSvc.assertStartable(a, { purpose: "extra", subjectId: w }, ["extra.five-photos"])).rejects.toMatchObject({ status: 422 });
    const over = await pay(a, "extra.premium-style", { subjectId: w });
    expect(await flagged(over)).toContain("refund_due:keepsake_extras_ceiling");
    expect(await flagged(await pay(a, "extra.qr-card", { subjectId: w }))).toContain("refund_due:extra_already_held");
    expect((await wishRow(w)).adds).toHaveLength(3);
    const no = await pay(a, "extra.clip-15s", { subjectId: w });
    expect(await flagged(no)).toContain("refund_due:extra_not_taken_by_ticket");
    const bare = await wish(a);
    expect(await flagged(await pay(a, "extra.five-photos", { subjectId: bare }))).toContain("refund_due:extra_needs_a_ticket");
    await expect(purchasesSvc.assertStartable(a, { purpose: "extra" }, ["extra.five-photos"])).rejects.toMatchObject({ status: 422 });
    await expect(purchasesSvc.assertStartable(a, { purpose: "ticket", subjectId: w }, ["ticket.keepsake"])).rejects.toMatchObject({ status: 422 });
    // GG3 (INT-4): the app sells no paid upgrade, so a ticket line for a wish that has a ticket is refused at start, a higher one too
    await expect(purchasesSvc.assertStartable(a, { purpose: "ticket", subjectId: w }, ["ticket.premiere"])).rejects.toMatchObject({ status: 422 });
  });

  it("3. keep: from endsAt, two at once both count one after the other, resting wakes from now, never on a ticket that cannot be kept", async () => {
    // HH9: specs share one database and others run the due jobs of every row on their own clocks, so this test runs on a clock no
    // other spec reaches (a rest-wish job of ours that was due for them put the wish to rest mid-test).
    const NOW = new Date("2150-03-01T09:00:00.000Z");
    t.clock.set(NOW);
    const a = await account();
    const ends = new Date(NOW.getTime() + 5 * DAY);
    const w = await wish(a, { ticket: "keepsake", status: "live", openedAt: NOW, endsAt: ends });
    const refs = await Promise.all([pay(a, "keep.month", { subjectId: w }), pay(a, "keep.half", { subjectId: w })]);
    const row = await wishRow(w);
    expect(row.endsAt!.getTime()).toBe(ends.getTime() + (30 + 182) * DAY);
    expect(row.keptBy).toBe("keep");
    expect(row.keptUntil!.getTime()).toBe(row.endsAt!.getTime());
    for (const r of refs) expect(await flagged(r)).toEqual([]);
    const job = await db.job.findFirst({ where: { subjectId: w, type: "rest_wish" as never } });
    expect(job?.runAt.getTime()).toBe(row.endsAt!.getTime());

    const rest = await wish(a, { ticket: "signature", status: "resting", openedAt: NOW, endsAt: NOW, restingSince: NOW, eraseAfter: new Date(NOW.getTime() + 300 * DAY) });
    await pay(a, "keep.year", { subjectId: rest });
    const woke = await wishRow(rest);
    expect(woke.status).toBe("live");
    expect(woke.endsAt!.getTime()).toBe(NOW.getTime() + 365 * DAY);
    expect(woke.restingSince).toBeNull();
    expect(woke.eraseAfter).toBeNull();
    expect(await db.wishTransition.count({ where: { wishId: rest, to: "live" } })).toBe(1);

    const moment = await wish(a, { ticket: "moment", status: "live", openedAt: NOW, endsAt: ends });
    expect(await flagged(await pay(a, "keep.month", { subjectId: moment }))).toContain("refund_due:ticket_not_keepable");
    const sealed = await wish(a, { ticket: "keepsake", status: "sealed" });
    expect(await flagged(await pay(a, "keep.month", { subjectId: sealed }))).toContain("refund_due:wish_not_live");
  });

  it("4. the Pass: a year from the clock, counters from the entitlements, a second Pass extends, 20 at once with 1 left gives one", async () => {
    const a = await account();
    const ref = await pay(a, "pass.year");
    const p = await paymentRow(ref);
    const m = await db.passMembership.findUniqueOrThrow({ where: { paymentId: p.id } });
    expect(m.since!.getTime()).toBe(NOW.getTime());
    expect(m.validUntil).toBe(new Date(NOW.getTime() + 365 * DAY).toISOString());
    expect(m.wishesUsed).toBe(0);
    const [g] = await grants(p.id);
    expect(g.detail).toMatchObject({ wishes: 20, upgrades: 4 });

    // fill the counter to 19, then 20 at once for the last place
    await db.passMembership.update({ where: { id: m.id }, data: { wishesUsed: 19 } });
    const results = await Promise.all(Array.from({ length: 20 }, () => db.$transaction((tx) => pass.draw(tx, a, "wishes"))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(20);
    expect(await db.$transaction((tx) => pass.draw(tx, a, "wishes"))).toBe(false);
    expect(await db.$transaction((tx) => pass.draw(tx, a, "upgrades"))).toBe(true);

    // a second Pass while one is live starts where the first ends; its places open when its time comes
    t.clock.set(new Date(NOW.getTime() + 10 * DAY));
    const ref2 = await pay(a, "pass.year");
    const m2 = await db.passMembership.findUniqueOrThrow({ where: { paymentId: (await paymentRow(ref2)).id } });
    expect(m2.since!.toISOString()).toBe(m.validUntil);
    expect(m2.validUntil).toBe(new Date(NOW.getTime() + 730 * DAY).toISOString());
    expect(await db.$transaction((tx) => pass.draw(tx, a, "wishes"))).toBe(false);
    t.clock.set(new Date(NOW.getTime() + 366 * DAY));
    expect(await db.$transaction((tx) => pass.draw(tx, a, "wishes"))).toBe(true);
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m2.id } })).wishesUsed).toBe(1);
  });

  it("5. Pro plan, rollover, wish pack, Vault space", async () => {
    const a = await account();
    const b = await business(a);
    await pay(a, "pro.starter", {}, { businessId: b });
    let row = await db.business.findUniqueOrThrow({ where: { id: b } });
    expect(row).toMatchObject({ plan: "starter", allowance: 10, used: 0, rolled: 0, month: "2026-12" });
    expect(row.renews!.toISOString()).toBe("2027-01-01T09:00:00.000Z");
    await db.business.update({ where: { id: b }, data: { used: 4 } });
    // next month's payment: 6 of 10 unused roll over once (pro-data roll())
    t.clock.set(new Date("2027-01-02T09:00:00.000Z"));
    await pay(a, "pro.studio", {}, { businessId: b });
    row = await db.business.findUniqueOrThrow({ where: { id: b } });
    expect(row).toMatchObject({ plan: "studio", allowance: 35, used: 0, rolled: 6, month: "2027-01" });
    // a gap of two months rolls nothing
    t.clock.set(new Date("2027-03-02T09:00:00.000Z"));
    await pay(a, "pro.studio", {}, { businessId: b });
    expect((await db.business.findUniqueOrThrow({ where: { id: b } })).rolled).toBe(0);

    const a2 = await account();
    const b2 = await business(a2);
    const ref = await pay(a2, "pro.pack", {}, { businessId: b2, qty: 2 });
    const pk = await db.business.findUniqueOrThrow({ where: { id: b2 } });
    expect(pk).toMatchObject({ pack: 10, plan: "pack" });
    expect(pk.packEnds!.toISOString()).toBe(new Date(t.clock.now().getTime() + 90 * DAY).toISOString());
    const [pg] = await grants((await paymentRow(ref)).id);
    expect(pg.detail).toMatchObject({ wishes: 10, vaultGb: 40, days: 90 });
    // draw: the month first, the pack after
    expect(await db.$transaction((tx) => biz.draw(tx, b2))).toBe("pack");
    expect((await db.business.findUniqueOrThrow({ where: { id: b2 } })).pack).toBe(9);

    await pay(a2, "vault.block", {}, { businessId: b2, qty: 3 });
    expect(await db.$transaction((tx) => biz.extraGb(tx, b2))).toBe(300);
    t.clock.advance(31 * DAY);
    expect(await db.$transaction((tx) => biz.extraGb(tx, b2))).toBe(0);

    const noBiz = await pay(a2, "pro.starter");
    expect(await flagged(noBiz)).toContain("refund_due:no_business");
  });

  it("5. creator plan, Signed, credits and extra reviews are counters on the CreatorState", async () => {
    const a = await account();
    await pay(a, "creator.plan");
    let s = await db.creatorState.findUniqueOrThrow({ where: { accountId: a } });
    // XX3: the row starts with Open's 3 credits whichever code makes it first
    expect(s).toMatchObject({ plan: "creator", credits: 13, reviewsLeft: 2 });
    await pay(a, "creator.credit-pack", {}, { qty: 2 });
    await pay(a, "creator.extra-review");
    await pay(a, "creator.signed");
    s = await db.creatorState.findUniqueOrThrow({ where: { accountId: a } });
    expect(s).toMatchObject({ credits: 23, packs: 2, extraReviews: 1, signed: true });
  });

  it("5. Concierge records the paid order only", async () => {
    const a = await account();
    const order = ids.next();
    const ref = await pay(a, "concierge.single", { subjectId: order });
    const [g] = await grants((await paymentRow(ref)).id);
    expect(g).toMatchObject({ kind: "concierge" });
    expect(g.detail).toMatchObject({ orderId: order });
  });

  it("1. the same good answer arriving twice at once grants once", async () => {
    const a = await account();
    const b = await business(a);
    const ref = await pay(a, "pro.pack", {}, { businessId: b });
    const p = await paymentRow(ref);
    const answer = { reference: ref, status: "success" as const, amountKobo: p.amountKobo, currency: "NGN", paidAt: NOW };
    const again = await Promise.all([settle.settle(answer), settle.settle(answer), settle.settle(answer)]);
    expect(again.every((r) => r.outcome === "already")).toBe(true);
    expect((await db.business.findUniqueOrThrow({ where: { id: b } })).pack).toBe(5);
  });

  it("6. revoke takes back what each line granted, once", async () => {
    const a = await account();
    const w = await wish(a);
    const r1 = await pay(a, "ticket.keepsake", { subjectId: w });
    const r2 = await pay(a, "extra.five-photos", { subjectId: w });
    const live = await wish(a, { ticket: "keepsake", status: "live", openedAt: NOW, endsAt: new Date(NOW.getTime() + 5 * DAY) });
    const r3 = await pay(a, "keep.month", { subjectId: live });
    const b = await business(a);
    const r4 = await pay(a, "pro.pack", {}, { businessId: b });
    const r5 = await pay(a, "creator.credit-pack", {}, { qty: 2 });
    const r6 = await pay(a, "pass.year");
    const out = [];
    for (const r of [r2, r1, r3, r4, r5, r6]) {
      const p = await paymentRow(r);
      out.push(await db.$transaction((tx) => purchases.revoke(tx, p)));
    }
    expect(out.flat().map((x) => x.result)).toEqual(Array(6).fill("revoked"));
    const row = await wishRow(w);
    expect(row.ticket).toBeNull();
    expect(row.adds).toEqual([]);
    expect((await wishRow(live)).endsAt!.getTime()).toBe(NOW.getTime() + 5 * DAY);
    expect(await db.business.findUniqueOrThrow({ where: { id: b } })).toMatchObject({ pack: 0, plan: null });
    expect((await db.creatorState.findUniqueOrThrow({ where: { accountId: a } })).credits).toBe(3);
    expect((await db.passMembership.findFirstOrThrow({ where: { accountId: a } })).state).toBe("refunded");
    const again = await db.$transaction((tx) => purchases.revoke(tx, { id: out.length ? "00000000-0000-7000-8000-000000000000" : "" }));
    expect(again).toEqual([]);
    const second = await db.$transaction(async (tx) => purchases.revoke(tx, await paymentRow(r1)));
    expect(second.map((x) => x.result)).toEqual(["already_revoked"]);
    // a ticket on a sealed wish cannot be taken back
    const w2 = await wish(a);
    const r7 = await pay(a, "ticket.moment", { subjectId: w2 });
    await db.wish.update({ where: { id: w2 }, data: { status: "sealed" } });
    const kept = await db.$transaction(async (tx) => purchases.revoke(tx, await paymentRow(r7)));
    expect(kept[0].result).toBe("kept_wish_is_sealed");
  });
});
