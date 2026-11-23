import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { testSlug } from "../../../../test/kit/unique";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-04-12T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const TICKETS = ["moment", "keepsake", "signature", "premiere"] as const;
const LEVELS = ["starter", "standard", "premium"] as const;
/** The highest level each ticket takes (T-02 to T-06). */
const TAKES: Record<(typeof TICKETS)[number], number> = { moment: 0, keepsake: 1, signature: 2, premiere: 2 };
/** Seeded house styles made for the love kind, one per level. */
const HOUSE = { starter: "noir", standard: "status", premium: "reel" } as const;

/** API-BASE-15 case 1 (IJ2): when a wish takes a style, by any route, the style is on, offered for the wish's kind, and at a level the ticket allows. */
describe("API-BASE-15 IJ2: a wish takes a style only if it is on, made for its kind and at a level its ticket allows", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const person = async () => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab15-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab15-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  };
  type U = { id: string; token: string };
  /** A creator's Studio style: on, at the level staff placed it, made for the kinds named. */
  const creatorStyle = async (level: (typeof LEVELS)[number], kinds: string[], over: Record<string, unknown> = {}) => {
    const slug = testSlug("cs");
    await db.style.create({
      data: { id: ids.next(), slug, name: `Studio ${slug}`, on: true, level, kinds, house: false, creator: { handle: "ada", name: "Ada" }, by: "Ada", ...over } as never,
    });
    return slug;
  };
  const wish = async (u: U, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: u.id, status: "draft", kind: "love", occasion: "birthday", styleSlug: HOUSE.starter, timeZone: "Africa/Lagos", name: "Ada", content: { letter: { paras: ["Happy birthday."] } }, ...over } as never });
    return id;
  };
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const patch = async (u: U, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send({ version: (await row(id)).version, ...body });
  const seal = async (u: U, id: string) => t.http().post(`/v1/wishes/${id}/seal`).set(bearer(u.token)).send({ version: (await row(id)).version, openNow: true });
  const start = (u: U, wishId: string, ticket: string) => t.http().post("/v1/payments").set(bearer(u.token)).send({ purpose: "ticket", id: ticket, subjectId: wishId });
  let evSeq = 7_000_000;
  const hook = async (reference: string) => {
    const pr = await db.payment.findFirstOrThrow({ where: { providerReference: reference } });
    const body = JSON.stringify({ event: "charge.success", data: { id: ++evSeq, reference, amount: Number(pr.amountKobo), currency: "NGN", channel: "card", fees: 100, paid_at: t.clock.now().toISOString() } });
    return t.http().post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", t.payments.sign(body)).send(body);
  };

  it("PATCH: a style made for another kind is refused in words (house and creator), one made for the kind is taken", async () => {
    const u = await person();
    const groupWish = await wish(u, { kind: "group", occasion: "birthday" });
    const loveOnlyCreator = await creatorStyle("standard", ["love"]);
    const r = await patch(u, groupWish, { style: loveOnlyCreator });
    expect(r.status).toBe(422);
    expect(r.body.error.fields.style).toMatch(/not made for the group kind/);
    const houseLoveOnly = await patch(u, groupWish, { style: "letter" });
    expect(houseLoveOnly.status).toBe(422);
    expect(houseLoveOnly.body.error.fields.style).toMatch(/not made for the group kind/);
    expect((await row(groupWish)).styleSlug).toBe(HOUSE.starter);
    expect((await patch(u, groupWish, { style: await creatorStyle("standard", ["group", "celebration"]) })).status).toBe(200);
  });

  it("PATCH: a style that is off is refused; a style with no kinds named is offered to every kind", async () => {
    const u = await person();
    const w = await wish(u, { kind: "group" });
    const off = await creatorStyle("standard", ["group"], { on: false });
    expect((await patch(u, w, { style: off })).status).toBe(422);
    const open = await creatorStyle("standard", []);
    expect((await patch(u, w, { style: open })).status).toBe(200);
  });

  it("every ticket by every level, house and creator: a style after the ticket, and a ticket after the style", async () => {
    const u = await person();
    const creator = { starter: await creatorStyle("starter", ["love"]), standard: await creatorStyle("standard", ["love"]), premium: await creatorStyle("premium", ["love"]) };
    for (const ticket of TICKETS) {
      for (const [origin, slugs] of [["house", HOUSE], ["creator", creator]] as const) {
        for (const level of LEVELS) {
          const slug = slugs[level];
          const ok = LEVELS.indexOf(level) <= TAKES[ticket];
          // the ticket first, then the style
          const a = await wish(u, { ticket });
          const p = await patch(u, a, { style: slug });
          expect([ticket, origin, level, p.status]).toEqual([ticket, origin, level, ok ? 200 : 422]);
          if (!ok) expect(p.body.error.fields.style).toMatch(/ticket takes/);
          // the style first, then the ticket (the start of the payment)
          const b = await wish(u, { styleSlug: slug });
          const s = await start(u, b, ticket);
          expect([ticket, origin, level, "start", s.status]).toEqual([ticket, origin, level, "start", ok ? 201 : 422]);
          if (!ok) expect(s.body.error.fields.subjectId).toMatch(/ticket takes/);
        }
      }
    }
  });

  it("a style first then a cheaper ticket, paid before the check: the settle refuses the ticket and the payment is due back", async () => {
    const u = await person();
    const slug = await creatorStyle("standard", ["love"]);
    const w = await wish(u, { styleSlug: HOUSE.starter });
    const s = await start(u, w, "moment");
    expect(s.status).toBe(201);
    await db.wish.update({ where: { id: w }, data: { styleSlug: slug } }); // the style reached the wish another way before the payment settled
    expect((await hook(s.body.payment.reference)).status).toBeLessThan(300);
    expect(await row(w)).toMatchObject({ ticket: null });
    const grant = await db.purchaseGrant.findFirstOrThrow({ where: { wishId: w, kind: "ticket" } });
    expect(grant.refusedReason).toBe("style_above_ticket");
  });

  it("a style staff raise AFTER the wish took it: the wish keeps it, seals on the ticket it paid for, and nothing more is owed or refunded", async () => {
    const u = await person();
    const slug = await creatorStyle("standard", ["love"]);
    const w = await wish(u, { ticket: "keepsake" });
    expect((await patch(u, w, { style: slug })).status).toBe(200);
    expect(((await row(w)) as unknown as { styleTakenLevel: string }).styleTakenLevel).toBe("standard");
    const before = { payments: await db.payment.count({ where: { accountId: u.id } }), refunds: await db.refund.count({ where: { payment: { accountId: u.id } } }), grants: await db.purchaseGrant.count({ where: { wishId: w } }) };
    await db.style.update({ where: { slug }, data: { level: "premium" } }); // staff raise the level
    // the same style is not offered to a new Keepsake wish any more...
    const other = await wish(u, { ticket: "keepsake" });
    expect((await patch(u, other, { style: slug })).status).toBe(422);
    // ...but the wish that took it keeps it: it seals on its Keepsake, with no further charge and no refund
    expect((await seal(u, w)).status).toBe(200);
    expect(await row(w)).toMatchObject({ status: "sealed", ticket: "keepsake", styleSlug: slug });
    expect({ payments: await db.payment.count({ where: { accountId: u.id } }), refunds: await db.refund.count({ where: { payment: { accountId: u.id } } }), grants: await db.purchaseGrant.count({ where: { wishId: w } }) }).toEqual(before);
  });

  it("the premium-style extra on a Keepsake (T-30) lifts a creator's Premium style; without it the style is refused", async () => {
    const u = await person();
    const slug = await creatorStyle("premium", ["love"]);
    const plain = await wish(u, { ticket: "keepsake" });
    const no = await patch(u, plain, { style: slug });
    expect(no.status).toBe(422);
    expect(no.body.error.fields.style).toMatch(/Keepsake ticket takes Standard styles and below/);
    const extra = await wish(u, { ticket: "keepsake", adds: ["extra.premium-style"] });
    expect((await patch(u, extra, { style: slug })).status).toBe(200);
    expect((await seal(u, extra)).status).toBe(200);
  });

  it("a style switched off between the choice and the payment: the start is refused, and a payment already started is refused at the settle", async () => {
    const u = await person();
    const slug = await creatorStyle("standard", ["love"]);
    const w = await wish(u, { styleSlug: slug });
    const s = await start(u, w, "keepsake");
    expect(s.status).toBe(201);
    await db.style.update({ where: { slug }, data: { on: false } });
    const again = await start(u, await wish(u, { styleSlug: slug }), "keepsake");
    expect(again.status).toBe(422);
    expect(again.body.error.fields.subjectId).toMatch(/switched off/);
    expect((await hook(s.body.payment.reference)).status).toBeLessThan(300);
    expect(await row(w)).toMatchObject({ ticket: null });
    expect((await db.purchaseGrant.findFirstOrThrow({ where: { wishId: w, kind: "ticket" } })).refusedReason).toBe("style_not_offered");
    // a draft that keeps an off style is not changed by saving its other words (SA5)
    const kept = await wish(u, { styleSlug: slug });
    expect((await patch(u, kept, { name: "Bola" })).status).toBe(200);
  });

  it("30 parallel choices on one wish: one wins, the others are stale, and the wish holds a style its ticket allows; 30 wishes at once agree with the rule", async () => {
    const u = await person();
    const ok = await creatorStyle("standard", ["love"]);
    const bad = await creatorStyle("premium", ["love"]);
    const one = await wish(u, { ticket: "keepsake" });
    const version = (await row(one)).version;
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => t.http().patch(`/v1/wishes/${one}`).set(bearer(u.token)).send({ version, style: i % 2 ? bad : ok })));
    expect(res.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect([200, 409, 422]).toEqual(expect.arrayContaining([...new Set(res.map((r) => r.status))]));
    expect([HOUSE.starter, ok]).toContain((await row(one)).styleSlug);
    const many = await Promise.all(Array.from({ length: 30 }, async (_, i) => ({ i, w: await wish(u, { ticket: "keepsake" }) })));
    const out = await Promise.all(many.map(async ({ i, w }) => ({ i, r: await patch(u, w, { style: i % 2 ? bad : ok }) })));
    for (const { i, r } of out) expect([i % 2, r.status]).toEqual([i % 2, i % 2 ? 422 : 200]);
    for (const { i, w } of many) expect((await row(w)).styleSlug).toBe(i % 2 ? HOUSE.starter : ok);
  });
});
