import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { InvoicesService } from "../invoices.service";
import { NoticesService } from "../../notices/notices.service";
import { JobsService } from "../../jobs/jobs.service";

const ROOT = join(__dirname, "../../../..");
// a month no other spec invoices in: the invoice numbers asserted gap-free below belong to this spec alone
const NOW = new Date("2029-09-03T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("B17 business: plan, usage, client wishes, invoices, logins, staff", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let invoices: InvoicesService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    invoices = t.app.get(InvoicesService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const who = async (sides: ("business" | "creator")[] = ["business"]) => {
    const accountId = ids.next();
    const email = `b17-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, sides: ["person", ...sides], lastSide: "person" } });
    const token = `b17-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, email, token };
  };
  const owner = async (over: Record<string, unknown> = {}) => {
    const w = await who();
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Studio", since: NOW, ...over } });
    return { ...w, businessId };
  };
  const live = (over: Record<string, unknown> = {}) =>
    owner({ plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2029-09", renews: new Date("2029-10-01T09:00:00.000Z"), ...over });
  const staffToken = (roles: ("owner" | "ops" | "finance" | "moderator")[]) => {
    const token = `b17-staff-${++seq}-${run}`;
    t.tokens.set(token, { kind: "staff", staffId: ids.next(), roles });
    return token;
  };
  const get = (path: string, token?: string) => (token ? t.http().get(path).set(bearer(token)) : t.http().get(path));
  const wishBody = { client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2029-12-04" };

  async function pay(o: { accountId: string; businessId: string }, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, payerContact: "x@example.com", purpose: "ticket", subjectId: null,
        lines: [{ sku, name: sku === "pro.pack" ? "Wish pack" : "Pro plan", qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${o.accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } },
      },
    });
    const out = await settle.settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return { id, total: Number(total) };
  }

  it("1. usage: the plan, wishes left, what rolled over, pack, logins, Vault, renews; the month is rolled first", async () => {
    const o = await owner({ plan: "starter", allowance: 10, used: 4, rolled: 0, month: "2029-08", renews: new Date("2029-09-20T09:00:00.000Z"), pack: 2 });
    await db.login.create({ data: { id: ids.next(), businessId: o.businessId, contact: "x@example.com", status: "invited" } });
    const res = await get("/v1/business/usage", o.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ allowance: 10, rolled: 6, used: 0, total: 16, left: 16, pack: 2, canMake: true, plan: "starter", live: true, month: "2029-09" });
    expect(res.body.renews).toBe("2029-09-20T09:00:00.000Z");
    expect(res.body.resets).toBe("2029-10-01T00:00:00.000Z");
    expect(res.body.logins).toEqual({ used: 2, allowed: 1 });
    expect(res.body.vault).toMatchObject({ usedGb: 0, allowedGb: 100 });
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).month).toBe("2029-08"); // OO6: a read writes no roll
    const plan = await get("/v1/business/plan", o.token);
    expect(plan.status).toBe(200);
    expect(plan.body.plan).toBe("starter");
    const biz = await get("/v1/business", o.token);
    expect(biz.status).toBe(200);
    expect(biz.body).toMatchObject({ id: o.businessId, plan: "starter", pack: 2, rolled: 6, vault: 0, vaultUsedGb: 0 });
    expect(biz.body.logins).toHaveLength(1);
  });

  it("1. usage and the business: 401 without a token, 403 for a plain user and for a person with no business", async () => {
    for (const path of ["/v1/business", "/v1/business/plan", "/v1/business/usage", "/v1/business/client-wishes", "/v1/business/invoices", "/v1/business/logins"]) {
      expect((await get(path)).status).toBe(401);
    }
    const plain = await who([]);
    expect((await get("/v1/business/usage", plain.token)).status).toBe(403);
    const nobody = await who();
    expect((await get("/v1/business/usage", nobody.token)).status).toBe(403);
    expect((await get("/v1/business/client-wishes", nobody.token)).status).toBe(403);
  });

  it("2. a client wish draws one wish in the same transaction: allowance first, then pack; none left is 402", async () => {
    const o = await owner({ plan: "starter", allowance: 10, used: 9, rolled: 0, month: "2029-09", renews: new Date("2029-10-01T09:00:00.000Z"), pack: 1 });
    const post = () => t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ ...wishBody, client: "  Ada   Obi ", kind: "Birthday" });
    const a = await post();
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2029-12-04", from: "month", no: "0901" });
    const b = await post();
    expect(b.body).toMatchObject({ from: "pack", no: "0902" });
    const c = await post();
    expect(c.status).toBe(402);
    expect(c.body.error.code).toBe("no_wishes");
    expect(c.body.error.message).toMatch(/wish pack/i);
    const row = await db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    expect([row.used, row.pack]).toEqual([10, 0]);
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(2);
    const list = await get("/v1/business/client-wishes", o.token);
    expect((list.body as { items: { no: string }[] }).items.map((x) => x.no)).toEqual(["0902", "0901"]);
    expect((await get(`/v1/business/client-wishes/${a.body.id}`, o.token)).body.id).toBe(a.body.id);
  });

  it("2. 20 at once with 3 left: three are made, the rest are 402, and the counts match", async () => {
    const o = await owner({ plan: "starter", allowance: 10, used: 7, rolled: 0, month: "2029-09", renews: new Date("2029-10-01T09:00:00.000Z") });
    const res = await Promise.all(Array.from({ length: 20 }, () => t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(3);
    expect(res.filter((r) => r.status === 402)).toHaveLength(17);
    expect(res.every((r) => r.status === 201 || r.status === 402)).toBe(true);
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).used).toBe(10);
    const nos = (await db.clientWish.findMany({ where: { businessId: o.businessId } })).map((w) => w.no);
    expect(new Set(nos).size).toBe(3);
  });

  it("2. a bad body is 422 with fields; a reveal is not made here; another business never sees the wish", async () => {
    const o = await live();
    const bad = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ client: " ", kind: "Bad kind!", occasion: "", day: "2029-12-04" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["client", "kind", "occasion"]);
    const badDay = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ ...wishBody, day: "2029-11-31" });
    expect(badDay.status).toBe(422);
    expect(Object.keys(badDay.body.error.fields)).toEqual(["day"]);
    const rev = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send({ ...wishBody, reveal: [{}] });
    expect(rev.status).toBe(422);
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(0);
    const made = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody);
    const other = await live();
    expect((await get(`/v1/business/client-wishes/${made.body.id}`, other.token)).status).toBe(404);
    expect((await get("/v1/business/client-wishes", other.token)).body.items).toEqual([]);
    expect((await get("/v1/business/client-wishes/not-a-uuid", o.token)).status).toBe(404);
  });

  it("2. approve-date makes one wish for a person's date, once", async () => {
    const o = await live();
    const personId = ids.next();
    await db.person.create({ data: { id: personId, businessId: o.businessId, name: "Kemi" } });
    const body = { client: "Kemi", day: "2029-12-04", key: `${personId}:b:2027`, kind: "teams", occasion: "Staff birthday" };
    const a = await t.http().post(`/v1/business/client-wishes/${personId}/approve-date`).set(bearer(o.token)).send(body);
    expect(a.status).toBe(201);
    const b = await t.http().post(`/v1/business/client-wishes/${personId}/approve-date`).set(bearer(o.token)).send(body);
    expect(b.body.id).toBe(a.body.id);
    expect((await db.business.findUniqueOrThrow({ where: { id: o.businessId } })).used).toBe(1);
    expect(await db.approvedDate.count({ where: { businessId: o.businessId } })).toBe(1);
    const other = await live();
    expect((await t.http().post(`/v1/business/client-wishes/${personId}/approve-date`).set(bearer(other.token)).send(body)).status).toBe(404);
  });

  it("3. logins: the plan's number (Starter 1, Studio 3) is the owner's seat plus extras; over it is 409; a repeat answers the same login", async () => {
    const s = await owner({ plan: "starter", allowance: 10, month: "2029-09", renews: new Date("2029-10-01T09:00:00.000Z") });
    const full = await t.http().post("/v1/business/logins").set(bearer(s.token)).send({ contact: "one@example.com" });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("logins_full");
    const o = await live();
    const invite = (contact: string) => t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact });
    const a = await invite(" Nkechi@Studio.NG ");
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ contact: "nkechi@studio.ng", status: "invited" });
    expect((await invite("nkechi@studio.ng")).body.id).toBe(a.body.id);
    expect((await invite("two@studio.ng")).status).toBe(201);
    const third = await invite("three@studio.ng");
    expect(third.status).toBe(409);
    expect((await invite("not an email")).status).toBe(422);
    expect((await invite(o.email)).status).toBe(409);
    const list = await get("/v1/business/logins", o.token);
    expect(list.body.items).toHaveLength(2);
    expect(await db.login.count({ where: { businessId: o.businessId } })).toBe(2);
  });

  it("3. 5 invites at once on a plan with 2 free seats take two", async () => {
    const o = await live();
    const res = await Promise.all(Array.from({ length: 5 }, (_, i) => t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: `p${i}-${run}@studio.ng` })));
    expect(res.filter((r) => r.status === 201)).toHaveLength(2);
    expect(res.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it("3. a login accepts by signing in, works in the business, never sees billing or manages logins, and loses access at once when removed", async () => {
    const o = await live();
    const m = await who();
    const inv = await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: m.email.toUpperCase() });
    expect(inv.status).toBe(201);
    const made = await t.http().post("/v1/business/client-wishes").set(bearer(m.token)).send(wishBody);
    expect(made.status).toBe(201);
    expect((await db.clientWish.findUniqueOrThrow({ where: { id: made.body.id } })).businessId).toBe(o.businessId);
    expect((await db.login.findUniqueOrThrow({ where: { id: inv.body.id } })).status).toBe("active");
    expect((await get("/v1/business/usage", m.token)).status).toBe(200);
    const view = await get("/v1/business", m.token);
    expect(view.body).toMatchObject({ invoices: 0, logins: [] });
    for (const path of ["/v1/business/invoices", "/v1/business/logins"]) expect((await get(path, m.token)).status).toBe(403);
    expect((await t.http().post("/v1/business/logins").set(bearer(m.token)).send({ contact: "z@studio.ng" })).status).toBe(403);
    expect((await t.http().delete(`/v1/business/logins/${inv.body.id}`).set(bearer(m.token))).status).toBe(403);
    // another business's owner cannot remove it
    const stranger = await live();
    expect((await t.http().delete(`/v1/business/logins/${inv.body.id}`).set(bearer(stranger.token))).status).toBe(404);
    const del = await t.http().delete(`/v1/business/logins/${inv.body.id}`).set(bearer(o.token));
    expect(del.status).toBe(204);
    expect((await get("/v1/business/usage", m.token)).status).toBe(403);
    expect((await t.http().post("/v1/business/client-wishes").set(bearer(m.token)).send(wishBody)).status).toBe(403);
    expect((await get(`/v1/business/client-wishes/${made.body.id}`, m.token)).status).toBe(403);
    expect((await get("/v1/business/logins", o.token)).body.items).toEqual([]);
    expect((await t.http().delete(`/v1/business/logins/${inv.body.id}`).set(bearer(o.token))).status).toBe(404);
    expect((await t.http().delete("/v1/business/logins/nope").set(bearer(o.token))).status).toBe(404);
    // the seat is free again
    expect((await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: "next@studio.ng" })).status).toBe(201);
  });

  /** How many invoices of the whole database carry a number from lo to hi, whatever month their prefix names (the counter is one for all). */
  const numbered = async (lo: number, hi: number) =>
    Number((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM invoice WHERE no LIKE 'FW-%' AND split_part(no, '-', 3)::int BETWEEN ${lo} AND ${hi}`)[0].n);

  it("4. every plan and pack payment leaves one invoice: in order, no gaps, the VAT part, the period; the list and the file are the owner's", async () => {
    const o = await owner();
    const a = await pay(o, "pro.starter");
    const b = await pay(o, "pro.pack");
    const rows = await db.$queryRaw<{ no: string; amount: bigint; vat: bigint }[]>`SELECT no, amount, vat FROM invoice WHERE "businessId" = ${o.businessId}::uuid ORDER BY id`;
    expect(rows).toHaveLength(2);
    const n = (no: string) => Number(no.slice(-4));
    // one counter numbers every invoice of the database, so another spec's invoice may fall between the two; none of the numbers between them may be missing
    expect(n(rows[1].no) - n(rows[0].no)).toBeGreaterThanOrEqual(1);
    expect(await numbered(n(rows[0].no), n(rows[1].no))).toBe(n(rows[1].no) - n(rows[0].no) + 1);
    expect(rows[0].no).toMatch(/^FW-2909-\d{4}$/);
    expect(Number(rows[0].amount)).toBe(a.total);
    expect(Number(rows[0].vat)).toBe(Math.round((a.total * 0.075) / 1.075));
    expect(Number(rows[1].vat)).toBe(Math.round((b.total * 0.075) / 1.075));
    const list = await get("/v1/business/invoices?limit=1", o.token);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].no).toBe(rows[1].no);
    expect(list.body.items[0].lines.period.from).toBeDefined();
    const page2 = await get(`/v1/business/invoices?limit=1&cursor=${list.body.nextCursor}`, o.token);
    expect(page2.body.items[0].no).toBe(rows[0].no);
    expect(page2.body.nextCursor).toBeNull();
    const file = await get(`/v1/business/invoices/${list.body.items[0].id}/file`, o.token);
    expect(file.body).toMatchObject({ name: `firstwish-invoice-${rows[1].no}.html`, type: "text/html" });
    expect(file.body.text).toContain("Paid");
    expect(file.body.text).toContain("VAT included");
    const other = await owner();
    expect((await get(`/v1/business/invoices/${list.body.items[0].id}/file`, other.token)).status).toBe(404);
    expect((await get("/v1/business/invoices", other.token)).body.items).toEqual([]);
    expect((await get("/v1/business/invoices/nope/file", o.token)).status).toBe(404);
  });

  it("4. the same payment's handler run twice keeps one invoice; a rolled-back payment gives its number back; a refund voids and never deletes", async () => {
    const o = await owner();
    const a = await pay(o, "pro.starter");
    const p = await db.payment.findUniqueOrThrow({ where: { id: a.id } });
    await db.$transaction((tx) => invoices.issue(tx, p));
    expect(await db.invoice.count({ where: { businessId: o.businessId } })).toBe(1);
    // Other specs issue invoices in the same database, so the counter is held (row lock) while the settle is rolled back to a savepoint.
    await db.$transaction(async (tx) => {
      const seen = (await tx.$queryRaw<{ last: number }[]>`SELECT last FROM invoice_counter WHERE id = 1 FOR UPDATE`)[0].last;
      await tx.$executeRaw`SAVEPOINT settle`;
      const fake = await tx.payment.findUniqueOrThrow({ where: { id: a.id } });
      await tx.$executeRaw`DELETE FROM invoice_link WHERE "paymentId" = ${a.id}::uuid`;
      await invoices.issue(tx, fake);
      expect((await tx.$queryRaw<{ last: number }[]>`SELECT last FROM invoice_counter WHERE id = 1`)[0].last).toBe(seen + 1);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT settle`;
      expect((await tx.$queryRaw<{ last: number }[]>`SELECT last FROM invoice_counter WHERE id = 1`)[0].last).toBe(seen);
    });
    expect(await db.invoice.count({ where: { businessId: o.businessId } })).toBe(1);
    await db.$transaction((tx) => invoices.voidFor(tx, a.id));
    await db.$transaction((tx) => invoices.voidFor(tx, a.id));
    const list = await get("/v1/business/invoices", o.token);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].lines.voidedAt).toBeDefined();
    const file = await get(`/v1/business/invoices/${list.body.items[0].id}/file`, o.token);
    expect(file.body.text).toContain("Void");
    expect((await get("/v1/business", o.token)).body.invoices).toBe(0);
  });

  it("4. 10 payments at once leave 10 invoices numbered one after another with no gap", async () => {
    const os = await Promise.all(Array.from({ length: 10 }, () => owner()));
    await Promise.all(os.map((o) => pay(o, "pro.pack")));
    const all = await db.invoice.findMany({ where: { businessId: { in: os.map((o) => o.businessId) } } });
    expect(all).toHaveLength(10);
    const nums = all.map((i) => Number((i.no ?? "").slice(-4))).sort((x, y) => x - y);
    expect(new Set(nums).size).toBe(10);
    expect(nums[9] - nums[0]).toBeGreaterThanOrEqual(9);
    expect(await numbered(nums[0], nums[9])).toBe(nums[9] - nums[0] + 1);
  });

  it("5. a lapsed plan keeps its client wishes; new ones come only from pack wishes", async () => {
    const o = await live();
    const made = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody);
    expect(made.status).toBe(201);
    t.clock.set(new Date("2029-11-10T09:00:00.000Z"));
    expect((await get(`/v1/business/client-wishes/${made.body.id}`, o.token)).status).toBe(200);
    expect((await get("/v1/business/client-wishes", o.token)).body.items).toHaveLength(1);
    const usage = await get("/v1/business/usage", o.token);
    expect(usage.body).toMatchObject({ live: false, left: 0, pack: 0, canMake: false });
    const none = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody);
    expect(none.status).toBe(402);
    expect(none.body.error.message).toMatch(/pack or a Pro plan/);
    await db.business.update({ where: { id: o.businessId }, data: { pack: 1 } });
    const fromPack = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody);
    expect(fromPack.status).toBe(201);
    expect(fromPack.body.from).toBe("pack");
    expect((await db.clientWish.count({ where: { businessId: o.businessId } }))).toBe(2);
  });

  it("6. staff businesses: finance, ops and owner read the list and detail; others are 403; no one else; nothing is written by staff", async () => {
    const o = await live({ vault: 300000n });
    await db.payment.create({
      data: {
        id: ids.next(), accountId: o.accountId, businessId: o.businessId, purpose: "ticket", lines: [], amountKobo: 105000n, currency: "NGN", priceBookVersion: 1,
        status: "failed", provider: "paystack", providerReference: `fw-f-${run}-${seq}`, idempotencyKey: `f-${run}-${seq}`,
      },
    });
    await pay(o, "pro.pack");
    for (const role of ["finance", "ops", "owner"] as const) {
      const token = staffToken([role]);
      const one = await get(`/v1/admin/businesses/${o.businessId}`, token);
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ id: o.businessId, plan: "studio", vault: 300000 });
      expect(one.body.state.logins).toEqual({ used: 1, allowed: 3 });
      expect(one.body.latestFailedPayment).toMatchObject({ amount: 105000 });
      const list = await get("/v1/admin/businesses?limit=50", token);
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body.items)).toBe(true);
    }
    expect((await get(`/v1/admin/businesses/${o.businessId}`, staffToken(["moderator"]))).status).toBe(403);
    expect((await get("/v1/admin/businesses", staffToken(["moderator"]))).status).toBe(403);
    expect((await get("/v1/admin/businesses", o.token)).status).toBe(403);
    expect((await get("/v1/admin/businesses")).status).toBe(401);
    expect((await get("/v1/admin/businesses/not-a-uuid", staffToken(["ops"]))).status).toBe(404);
    expect((await t.http().post(`/v1/admin/businesses/${o.businessId}`).set(bearer(staffToken(["owner"]))).send({})).status).toBe(404);
  });

  it("7. a removed login, another business and a plain user see nothing of a business", async () => {
    const o = await live();
    await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody);
    const other = await live();
    const plain = await who([]);
    expect((await get("/v1/business/client-wishes", other.token)).body.items).toEqual([]);
    expect((await get("/v1/business/client-wishes", plain.token)).status).toBe(403);
    const removed = await who();
    await db.login.create({ data: { id: ids.next(), businessId: o.businessId, contact: removed.email, status: "removed" } });
    expect((await get("/v1/business/client-wishes", removed.token)).status).toBe(403);
    expect((await get("/v1/business", other.token)).body.id).toBe(other.businessId);
  });
  it("RR1 staff answers (E-23, E-24) show every login's email masked in the raw answer", async () => {
    const o = await live();
    const addr = `rr1-${run}@studio.ng`;
    await db.login.create({ data: { id: ids.next(), businessId: o.businessId, contact: addr, status: "invited" } });
    const token = staffToken(["finance"]);
    const one = await get(`/v1/admin/businesses/${o.businessId}`, token);
    const list = await get("/v1/admin/businesses?limit=50", token);
    for (const res of [one, list]) {
      expect(res.status).toBe(200);
      expect(res.text).not.toContain(addr);
      expect(res.text).not.toContain(`rr1-${run}`);
    }
    expect(one.body.loginList[0].contact).toBe(`r***@studio.ng`);
    // the owner still sees the full address of their own logins
    expect((await get("/v1/business", o.token)).body.logins[0].contact).toBe(addr);
  });

  it("RR2 a login of A and B reads each through x-business-id and never the other; a forged header is 403; no header is the oldest login", async () => {
    const a = await live({ name: "Alpha" });
    const b = await live({ name: "Beta" });
    const m = await who([]);
    for (const o of [a, b]) {
      expect((await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: m.email })).status).toBe(201);
    }
    const wishA = await t.http().post("/v1/business/client-wishes").set(bearer(a.token)).send({ ...wishBody, client: "OnlyA" });
    const wishB = await t.http().post("/v1/business/client-wishes").set(bearer(b.token)).send({ ...wishBody, client: "OnlyB" });
    const read = (id?: string) => (id ? t.http().get("/v1/business").set(bearer(m.token)).set("x-business-id", id) : get("/v1/business", m.token));
    const ra = await read(a.businessId);
    const rb = await read(b.businessId);
    expect(ra.body.id).toBe(a.businessId);
    expect(rb.body.id).toBe(b.businessId);
    expect(ra.text).toContain("OnlyA");
    expect(ra.text).not.toContain("OnlyB");
    expect(rb.text).toContain("OnlyB");
    expect(rb.text).not.toContain("OnlyA");
    const lw = await t.http().get("/v1/business/client-wishes").set(bearer(m.token)).set("x-business-id", b.businessId);
    expect((lw.body as { items: { id: string }[] }).items.map((w) => w.id)).toEqual([wishB.body.id as string]);
    expect((await t.http().get(`/v1/business/client-wishes/${wishA.body.id}`).set(bearer(m.token)).set("x-business-id", b.businessId)).status).toBe(404);
    expect((await read()).body.id).toBe(a.businessId);
    const stranger = await live();
    expect((await read(stranger.businessId)).status).toBe(403);
    expect((await read("not-a-uuid")).status).toBe(403);
    expect((await t.http().get("/v1/business").set(bearer(stranger.token)).set("x-business-id", a.businessId)).status).toBe(403);
    expect((await t.http().post("/v1/business/client-wishes").set(bearer(m.token)).set("x-business-id", stranger.businessId).send(wishBody)).status).toBe(403);
  });

  it("RR2 an owner of B invited to A uses A through the header, and own business with no header; a login needs no business side (OO1)", async () => {
    const a = await live({ name: "Alpha" });
    const b = await live({ name: "Beta" });
    expect((await t.http().post("/v1/business/logins").set(bearer(a.token)).send({ contact: b.email })).status).toBe(201);
    const viaHeader = await t.http().get("/v1/business").set(bearer(b.token)).set("x-business-id", a.businessId);
    expect(viaHeader.body.id).toBe(a.businessId);
    expect(viaHeader.body.logins).toEqual([]);
    expect((await get("/v1/business", b.token)).body.id).toBe(b.businessId);
    expect((await t.http().get("/v1/business").set(bearer(b.token)).set("x-business-id", b.businessId)).body.id).toBe(b.businessId);
    const bare = await who([]);
    t.tokens.set(bare.token, { kind: "user", accountId: bare.accountId, sides: ["person"] });
    await t.http().post("/v1/business/logins").set(bearer(a.token)).send({ contact: bare.email });
    expect((await get("/v1/business/usage", bare.token)).status).toBe(200);
  });

  it("OO2 the invite sends one login-invite email through the notices path; a repeat of the same invite sends none", async () => {
    const o = await live();
    const to = `oo2-${run}@studio.ng`;
    const jobs = t.app.get(JobsService);
    const before = t.email.sent.filter((e) => e.to === to).length;
    const first = await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: to });
    const again = await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: to.toUpperCase() });
    expect(again.body.id).toBe(first.body.id);
    const d = await db.messageDelivery.findMany({ where: { idempotencyKey: `login-invite:${first.body.id}` } });
    expect(d).toHaveLength(1);
    expect(d[0].templateKey).toBe("login-invite");
    await jobs.runDue(100, [d[0].id]);
    await t.app.get(NoticesService).deliverNow(d[0].id);
    const sent = t.email.sent.filter((e) => e.to === to);
    expect(sent.length - before).toBe(1);
    expect(JSON.stringify(sent[sent.length - 1])).toContain("Studio");
    expect(await db.messageDelivery.count({ where: { templateKey: "login-invite", to } })).toBe(1);
  });

  it("OO6 two reads in a new month leave the row unchanged; a draw writes the roll", async () => {
    const o = await live({ used: 10, rolled: 0, renews: new Date("2029-11-01T09:00:00.000Z") });
    t.clock.set(new Date("2029-10-05T09:00:00.000Z"));
    const snap = () => db.business.findUniqueOrThrow({ where: { id: o.businessId } });
    const before = await snap();
    const r1 = await get("/v1/business", o.token);
    const r2 = await get("/v1/business/usage", o.token);
    const staff = await get(`/v1/admin/businesses/${o.businessId}`, staffToken(["ops"]));
    expect(r1.body).toMatchObject({ month: "2029-10", used: 0, rolled: 25 });
    expect(r2.body).toMatchObject({ month: "2029-10", used: 0, rolled: 25 });
    expect(staff.body.state).toMatchObject({ month: "2029-10", used: 0, rolled: 25 });
    const after = await snap();
    expect(after).toEqual(before);
    expect(after.month).toBe("2029-09");
    const made = await t.http().post("/v1/business/client-wishes").set(bearer(o.token)).send(wishBody);
    expect(made.status).toBe(201);
    const drawn = await snap();
    expect(drawn.month).toBe("2029-10");
    expect(drawn.used).toBe(1);
    expect(drawn.rolled).toBe(25);
  });
});
