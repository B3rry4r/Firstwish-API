import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { SettlementService } from "../../payments/settlement.service";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-02-09T09:00:00.000Z");
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const letter = { letter: { paras: ["Happy birthday."] } };
const LEVELS = { starter: "letter", standard: "status", premium: "owambe" } as const;

/** HQ5 at the seal: the style is checked against the ticket the seal really ends with (API-BASE-5 patch, finding H1), through the real routes. */
describe("API-BASE-5 patch: the seal checks the style against the ticket it ends with", () => {
  // This spec CHANGES a shared catalogue row (it changes the entitlements book's Signature style level), which other specs read in the shared database: it has a database of its own.
  const own = ownDatabase("sealstyle");
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;

  beforeAll(async () => {
    own.use();
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });
  beforeEach(() => t.clock.set(NOW));

  const person = async (sides: ("business")[] = []) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab5s-${run}-${++seq}@example.com`, name: "Ada Obi", sides: ["person", ...sides], lastSide: "person" } });
    const token = `ab5s-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person", ...sides] });
    return { id, token };
  };
  type U = { id: string; token: string };
  const wish = async (u: U, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: u.id, status: "draft", kind: "love", occasion: "birthday", styleSlug: "noir", timeZone: "Africa/Lagos", name: "Ada", content: letter, ...over } as never });
    return id;
  };
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const seal = async (u: U, id: string, extra: Record<string, unknown> = {}) =>
    t.http().post(`/v1/wishes/${id}/seal`).set(bearer(u.token)).send({ version: (await row(id)).version, openNow: true, ...extra });
  const patch = async (u: U, id: string, body: Record<string, unknown>) =>
    t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send({ version: (await row(id)).version, ...body });
  async function pay(u: U, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: u.id, payerContact: "x@example.com", purpose: "ticket", subjectId: null,
        lines: [{ sku, name: sku, qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${u.id}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } },
      },
    });
    const o = await settle.settle({ reference, status: "success", amountKobo: unit, currency: "NGN", paidAt: t.clock.now() });
    expect(o.outcome).toBe("fulfilled");
  }
  const withPass = async (u: U) => {
    await pay(u, "pass.year");
    return db.passMembership.findFirstOrThrow({ where: { accountId: u.id } });
  };
  const owner = async (over: Record<string, unknown> = {}) => {
    const u = await person(["business"]);
    const businessId = ids.next();
    await db.business.create({
      data: { id: businessId, accountId: u.id, name: "Studio", business: "Studio", since: NOW, plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2027-02", renews: new Date("2027-03-01T09:00:00.000Z"), ...over },
    });
    return { ...u, businessId };
  };
  const biz = (id: string) => db.business.findUniqueOrThrow({ where: { id } });
  const noWords = /Premium style\. A Keepsake ticket takes Standard styles and below/;

  it("H1: a Pass seal on a Premium style is 422 naming the style, the ticket it would get and what allows it; nothing is drawn, and it seals when the style is allowed", async () => {
    const u = await person();
    const m = await withPass(u);
    const w = await wish(u, { styleSlug: LEVELS.premium });
    const r = await seal(u, w, { usePass: true });
    expect(r.status).toBe(422);
    expect(r.body.error.fields.style).toMatch(noWords);
    expect(r.body.error.fields.style).toMatch(/Choose a style up to Standard, or a ticket that takes more/);
    const after = await row(w);
    expect(after).toMatchObject({ status: "draft", ticket: null, styleSlug: LEVELS.premium, no: null });
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(0);
    expect(await db.passDraw.count({ where: { wishId: w } })).toBe(0);
    expect(await db.wishLink.count({ where: { wishId: w } })).toBe(0);
    // a style the Keepsake allows seals, and draws the one Pass wish
    expect((await patch(u, w, { style: LEVELS.standard })).status).toBe(200);
    const ok = await seal(u, w, { usePass: true });
    expect(ok.status).toBe(200);
    expect(await row(w)).toMatchObject({ status: "sealed", ticket: "keepsake", styleSlug: LEVELS.standard });
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(1);
  });

  it("H1: a draft with no ticket takes a Premium style by PATCH (200), then its Pass seal is 422 and the Pass is untouched", async () => {
    const u = await person();
    const m = await withPass(u);
    const w = await wish(u);
    expect((await patch(u, w, { style: "reel" })).status).toBe(200);
    const r = await seal(u, w, { usePass: true });
    expect(r.status).toBe(422);
    expect(r.body.error.message).toMatch(/Premium style/);
    expect((await db.passMembership.findUniqueOrThrow({ where: { id: m.id } })).wishesUsed).toBe(0);
    expect(await row(w)).toMatchObject({ status: "draft", ticket: null });
  });

  it("H1: the premium-style extra lifts a Pass-drawn Keepsake, and a Pass wish upgraded to a Signature takes Premium", async () => {
    const u = await person();
    await withPass(u);
    const lifted = await wish(u, { styleSlug: LEVELS.premium, adds: ["extra.premium-style"] });
    expect((await seal(u, lifted, { usePass: true })).status).toBe(200);
    expect(await row(lifted)).toMatchObject({ status: "sealed", ticket: "keepsake" });
    const up = await wish(u, { styleSlug: LEVELS.premium });
    expect((await t.http().post(`/v1/wishes/${up}/pass-upgrade`).set(bearer(u.token))).status).toBe(200);
    expect((await seal(u, up, { usePass: true })).status).toBe(200);
    expect(await row(up)).toMatchObject({ status: "sealed", ticket: "signature" });
  });

  it("H1: a paid Moment refuses Standard and Premium at the seal (nothing sealed), and a paid Keepsake refuses Premium", async () => {
    const u = await person();
    for (const [ticket, level, ok] of [["moment", "standard", false], ["moment", "premium", false], ["moment", "starter", true], ["keepsake", "premium", false], ["keepsake", "standard", true]] as const) {
      const w = await wish(u, { ticket, styleSlug: LEVELS[level] });
      const r = await seal(u, w);
      expect(r.status).toBe(ok ? 200 : 422);
      if (!ok) {
        expect(r.body.error.fields.style).toMatch(new RegExp(`${level === "standard" ? "Standard" : "Premium"} style\\. A ${ticket === "moment" ? "Moment" : "Keepsake"} ticket`));
        expect(await row(w)).toMatchObject({ status: "draft", no: null });
      }
    }
  });

  it("H1: the plan seal takes each level on the Signature it draws, and one decision refuses when the Signature would not allow the style (month unchanged)", async () => {
    const o = await owner();
    for (const level of ["starter", "standard", "premium"] as const) {
      const w = await wish(o, { styleSlug: LEVELS[level] });
      expect((await seal(o, w, { usePlan: true })).status).toBe(200);
      expect(await row(w)).toMatchObject({ status: "sealed", ticket: "signature" });
    }
    expect((await biz(o.businessId)).used).toBe(3);
    const book = await db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const tickets = book.tickets as Record<string, Record<string, unknown>>;
    await db.entitlements.update({ where: { id: book.id }, data: { tickets: { ...tickets, signature: { ...tickets.signature, styleLevel: "starter" } } as never } });
    try {
      const w = await wish(o, { styleSlug: LEVELS.premium });
      const r = await seal(o, w, { usePlan: true });
      expect(r.status).toBe(422);
      expect(r.body.error.fields.style).toMatch(/Premium style\. A Signature ticket takes Starter styles and below/);
      expect((await biz(o.businessId)).used).toBe(3);
      expect(await row(w)).toMatchObject({ status: "draft", ticket: null, businessId: null });
      expect(await db.clientWish.count({ where: { wishId: w } })).toBe(0);
    } finally {
      await db.entitlements.update({ where: { id: book.id }, data: { tickets: book.tickets as never } });
    }
  });

  it("H1: a pack seal takes each level, and the pack is unchanged when the seal is refused", async () => {
    const o = await owner({ allowance: 10, used: 10, pack: 5 });
    for (const level of ["starter", "standard", "premium"] as const) {
      const w = await wish(o, { styleSlug: LEVELS[level] });
      expect((await seal(o, w, { usePlan: true })).status).toBe(200);
    }
    expect((await biz(o.businessId)).pack).toBe(2);
    const book = await db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const tickets = book.tickets as Record<string, Record<string, unknown>>;
    await db.entitlements.update({ where: { id: book.id }, data: { tickets: { ...tickets, signature: { ...tickets.signature, styleLevel: "standard" } } as never } });
    try {
      const w = await wish(o, { styleSlug: LEVELS.premium });
      expect((await seal(o, w, { usePlan: true })).status).toBe(422);
      expect((await biz(o.businessId)).pack).toBe(2);
      expect(await row(w)).toMatchObject({ status: "draft", ticket: null });
    } finally {
      await db.entitlements.update({ where: { id: book.id }, data: { tickets: book.tickets as never } });
    }
  });
});
