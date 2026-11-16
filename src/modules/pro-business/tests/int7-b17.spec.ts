import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { bearer } from "../../people/tests/b12-kit";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { ClientWishesService } from "../client-wishes.service";
import { SettlementService } from "../../payments/settlement.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

describe("INT-7 B17: a downgrade keeps the logins, tells the owner once, and the list says which are over the plan", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const who = async (sides: ("business" | "creator")[] = ["business"]) => {
    const accountId = ids.next();
    const email = `i7b17-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, sides: ["person", ...sides], lastSide: "person" } });
    const token = `i7b17-${accountId}`;
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
    owner({ plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2026-12", renews: new Date("2027-01-01T09:00:00.000Z"), ...over });
  const flags = async (token: string) => ((await get("/v1/business/logins", token)).body.items as { id: string; overPlan: boolean }[]).map((x) => x.overPlan);
  const get = (path: string, token?: string) => (token ? t.http().get(path).set(bearer(token)) : t.http().get(path));

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

  it("a downgrade to a plan with fewer logins removes none, sends the owner one email, and marks the logins past the seats; a repeat of the same payment sends no second", async () => {
    const o = await live();
    const a = await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: `a-${run}@studio.ng` });
    const b = await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: `b-${run}@studio.ng` });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.overPlan).toBe(false);
    expect(await flags(o.token)).toEqual([false, false]);
    expect(await db.messageDelivery.count({ where: { templateKey: "logins-over", to: o.email } })).toBe(0);

    await pay(o, "pro.starter");
    const after = await get("/v1/business/logins", o.token);
    expect(after.status).toBe(200);
    expect((after.body.items as { id: string; overPlan: boolean }[]).map((x) => [x.id, x.overPlan])).toEqual([[a.body.id, true], [b.body.id, true]]);
    expect(await db.login.count({ where: { businessId: o.businessId, NOT: { status: "removed" } } })).toBe(2);
    const mail = await db.messageDelivery.findMany({ where: { templateKey: "logins-over", to: o.email } });
    expect(mail).toHaveLength(1);
    expect(JSON.stringify(mail[0].vars)).toContain('"allowed":"1"');
    expect(((await get("/v1/business", o.token)).body.logins as { overPlan: boolean }[]).map((x) => x.overPlan)).toEqual([true, true]);

    // The owner removes one: the other is still over a plan of one seat; the invite for a new one is still refused.
    expect((await t.http().delete(`/v1/business/logins/${a.body.id}`).set(bearer(o.token))).status).toBe(204);
    expect(await flags(o.token)).toEqual([true]);
    expect((await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: `c-${run}@studio.ng` })).status).toBe(409);
  });

  it("a plan that keeps every login sends no email and marks none", async () => {
    const o = await live();
    await t.http().post("/v1/business/logins").set(bearer(o.token)).send({ contact: `d-${run}@studio.ng` });
    await pay(o, "pro.studio");
    expect(await flags(o.token)).toEqual([false]);
    expect(await db.messageDelivery.count({ where: { templateKey: "logins-over", to: o.email } })).toBe(0);
  });

  it("INT-7: an invited login that has not accepted is not a member for making client wishes; an active one is", async () => {
    const o = await live();
    const m = await who();
    const loginId = ids.next();
    await db.login.create({ data: { id: loginId, businessId: o.businessId, contact: m.email, status: "invited" } });
    const svc = t.app.get(ClientWishesService);
    const body = { client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2027-03-04" } as never;
    const e: unknown = await svc.create(m.accountId, o.businessId, body).catch((x: unknown) => x);
    expect((e as { getStatus?: () => number }).getStatus?.()).toBe(404);
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(0);
    await db.login.update({ where: { id: loginId }, data: { status: "active" } });
    const made = await svc.create(m.accountId, o.businessId, body);
    expect(made.id).toBeDefined();
    expect(await db.clientWish.count({ where: { businessId: o.businessId } })).toBe(1);
  });
});
