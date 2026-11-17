import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { SettlementService } from "../../payments/settlement.service";
import { PurchasesService } from "../../purchases/purchases.service";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { WishesService } from "../../wishes/wishes.service";

const ROOT = join(__dirname, "../../../..");
// A start no other spec uses.
const NOW = new Date("2027-02-05T09:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
// A style of this spec's own: the house style "noir" is switched off for a while by the house-style spec, which runs beside this one, and a draft naming it is then 422.
const STYLE = `zb3-${run}`;

describe("ZB3: a business's client wishes are wishes (no reveal) and the maker seals on the plan", () => {
  let t: TestApp;
  let db: PrismaService;
  let life: WishLifecycleService;
  let wishes: WishesService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    // J7: public reads are counted per address; this spec's requests come from an address of its own, so no other spec's reads count against them.
    const address = uniqueAddress();
    const plain = t.http;
    t.http = () => {
      const agent = plain();
      const verbs = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
      return new Proxy(agent, {
        get: (target, prop) => {
          const v = (target as unknown as Record<string | symbol, unknown>)[prop];
          return typeof prop === "string" && verbs.has(prop) ? (url: string) => (v as (u: string) => { set: (k: string, x: string) => unknown }).call(target, url).set("x-forwarded-for", address) : v;
        },
      });
    };
    db = t.app.get(PrismaService);
    life = t.app.get(WishLifecycleService);
    wishes = t.app.get(WishesService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await db.style.create({ data: { id: ids.next(), slug: STYLE, name: STYLE, level: "starter", tier: "starter", house: false, on: true } });
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const who = async (sides: ("business" | "creator")[] = []) => {
    const accountId = ids.next();
    const email = `zb3-${run}-${++seq}@example.com`;
    await db.account.create({ data: { id: accountId, contact: email, name: "Ada Obi", sides: ["person", ...sides], lastSide: "person" } });
    const token = `zb3-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides] });
    return { accountId, email, token };
  };
  const live = { plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2027-02", renews: new Date("2027-03-01T09:00:00.000Z") };
  const owner = async (over: Record<string, unknown> = {}) => {
    const w = await who(["business"]);
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: w.accountId, name: "Studio", business: "Studio", since: NOW, ...live, ...over } });
    return { ...w, businessId };
  };
  const threeLeft = { allowance: 10, used: 7 };
  const login = async (businessId: string, status = "active") => {
    const w = await who();
    await db.login.create({ data: { id: ids.next(), businessId, contact: w.email, status } });
    return w;
  };
  const business = (id: string) => db.business.findUniqueOrThrow({ where: { id } });
  const body = { client: "Ada Obi", kind: "birthday", occasion: "birthday", day: "2027-03-04" };
  const e30 = (token: string, over: Record<string, unknown> = {}) => t.http().post("/v1/business/client-wishes").set(bearer(token)).send({ ...body, ...over });
  const letter = { letter: { paras: ["Happy birthday."] } };
  /** A draft the person fills in at the maker, ready to seal. */
  async function draft(token: string) {
    const r = await t.http().post("/v1/wishes").set(bearer(token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: STYLE });
    expect(r.status).toBe(201);
    const s = await t.http().patch(`/v1/wishes/${r.body.id}`).set(bearer(token)).send({ version: r.body.version, content: letter });
    expect(s.status).toBe(200);
    return r.body.id as string;
  }
  const seal = async (token: string, id: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
    const row = await db.wish.findUniqueOrThrow({ where: { id }, select: { version: true } });
    return t.http().post(`/v1/wishes/${id}/seal`).set({ ...bearer(token), ...headers }).send({ version: row.version, openNow: true, ...extra });
  };
  async function pay(o: { accountId: string; businessId: string }, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku, version: 1 } });
    const total = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    const reference = `fw-${id}`;
    await db.payment.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, payerContact: "x@example.com", purpose: "ticket", subjectId: null,
        lines: [{ sku, name: "Pro plan", qty: 1, unitKobo: Number(total), totalKobo: Number(total) }], amountKobo: total, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `${o.accountId}:${id}`, channel: "card",
        options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } },
      },
    });
    const out = await t.app.get(SettlementService).settle({ reference, status: "success", amountKobo: total, currency: "NGN", paidAt: t.clock.now() });
    expect(out.outcome).toBe("fulfilled");
    return id;
  }
  const count = async (businessId: string) => ({
    wishes: await db.wish.count({ where: { businessId } }),
    records: await db.clientWish.count({ where: { businessId } }),
    linked: await db.clientWish.count({ where: { businessId, wishId: { not: null } } }),
  });

  it("1. E-30 with no reveal makes a draft that carries the business, with its Signature ticket from the same draw, sharing the number once sealed", async () => {
    const o = await owner();
    const a = await e30(o.token);
    expect(a.status).toBe(201);
    expect(a.body.wishId).toEqual(expect.any(String));
    const w = await db.wish.findUniqueOrThrow({ where: { id: a.body.wishId } });
    expect(w).toMatchObject({ accountId: o.accountId, businessId: o.businessId, status: "draft", ticket: "signature", name: "Ada Obi", kind: "birthday" });
    expect((await business(o.businessId)).used).toBe(1);
    // the draft has no words yet: the maker writes them; sealing needs them (422), and the list and detail then answer the wish's own times
    expect((await seal(o.token, w.id)).status).toBe(422);
    const w2 = await e30(o.token, { client: "Obi" });
    const s2 = await seal(o.token, w2.body.wishId);
    expect(s2.status).toBe(422);
    const mk = await db.wish.findUniqueOrThrow({ where: { id: w2.body.wishId } });
    await t.http().patch(`/v1/wishes/${mk.id}`).set(bearer(o.token)).send({ version: mk.version, content: letter });
    const s3 = await seal(o.token, mk.id);
    expect(s3.status).toBe(200);
    const sw = await db.wish.findUniqueOrThrow({ where: { id: mk.id } });
    const detail = await t.http().get(`/v1/business/client-wishes/${w2.body.id}`).set(bearer(o.token));
    expect(detail.body).toMatchObject({ wishId: mk.id, no: sw.no, sentAt: sw.sealedAt?.toISOString() });
    expect(detail.body.openedAt).toBeUndefined();
    await db.$transaction((tx) => life.markOpened(tx, mk.id, t.clock.now()));
    const opened = await db.wish.findUniqueOrThrow({ where: { id: mk.id } });
    const list = await t.http().get("/v1/business/client-wishes").set(bearer(o.token));
    const item = (list.body.items as { id: string; openedAt?: string; endsAt?: string }[]).find((x) => x.id === w2.body.id);
    expect(item).toMatchObject({ openedAt: opened.openedAt?.toISOString(), endsAt: opened.endsAt?.toISOString() });
    expect(opened.endsAt).not.toBeNull();
  });

  it("2. 20 at once with 3 left through E-30: exactly 3, each with its wish; no wish without a draw, no draw without a wish", async () => {
    const o = await owner(threeLeft);
    const res = await Promise.all(Array.from({ length: 20 }, () => e30(o.token)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(3);
    expect(res.filter((r) => r.status === 402)).toHaveLength(17);
    expect((await business(o.businessId)).used).toBe(10);
    expect(await count(o.businessId)).toEqual({ wishes: 3, records: 3, linked: 3 });
    expect(await db.wish.count({ where: { businessId: o.businessId, ticket: "signature", status: "draft" } })).toBe(3);
  });

  it("3. 20 at once with 3 left through the maker's seal on the plan: exactly 3 seal; the rest stay plain drafts with no business and no ticket", async () => {
    const o = await owner(threeLeft);
    const mine = await Promise.all(Array.from({ length: 20 }, () => draft(o.token)));
    const res = await Promise.all(mine.map((id) => seal(o.token, id, { usePlan: true })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(3);
    expect(res.filter((r) => r.status === 402)).toHaveLength(17);
    expect((await business(o.businessId)).used).toBe(10);
    expect(await count(o.businessId)).toEqual({ wishes: 3, records: 3, linked: 3 });
    const lost = mine.filter((_, i) => res[i].status === 402);
    const rows = await db.wish.findMany({ where: { id: { in: lost } } });
    expect(rows.every((w) => w.status === "draft" && w.ticket === null && w.businessId === null)).toBe(true);
    const sealed = res.find((r) => r.status === 200)!;
    const rec = await db.clientWish.findFirstOrThrow({ where: { wishId: sealed.body.item.id } });
    expect(rec).toMatchObject({ client: "Chidi", kind: "love", occasion: "birthday", no: sealed.body.item.no });
    expect(sealed.body.item).toMatchObject({ ticket: "signature", businessId: o.businessId, state: "sealed" });
  });

  it("4. the seal's rules: no business 403, a wish with a ticket 409 and nothing drawn, plan and Pass together 422, a pack after the month, a login may seal", async () => {
    const o = await owner({ plan: null, allowance: null, renews: null, month: null, used: null, rolled: null, pack: 1 });
    const plain = await who();
    const own = await draft(plain.token);
    expect((await seal(plain.token, own, { usePlan: true })).status).toBe(403);
    const mine = await draft(o.token);
    expect((await seal(o.token, mine, { usePlan: true, usePass: true })).status).toBe(422);
    await wishes.fulfilTicket(mine, "moment");
    const before = await business(o.businessId);
    expect((await seal(o.token, mine, { usePlan: true })).status).toBe(409);
    expect((await business(o.businessId)).pack).toBe(before.pack);
    expect(await count(o.businessId)).toEqual({ wishes: 0, records: 0, linked: 0 });
    // an ordinary wish of the owner's, paid by ticket, never carries the business
    expect((await seal(o.token, mine)).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: mine } })).businessId).toBeNull();
    // the pack pays when no month is live; a login seals on the plan too
    const l = await login(o.businessId);
    const viaLogin = await draft(l.token);
    const ok = await seal(l.token, viaLogin, { usePlan: true });
    expect(ok.status).toBe(200);
    expect((await business(o.businessId)).pack).toBe(0);
    expect(await db.wish.findUniqueOrThrow({ where: { id: viaLogin } })).toMatchObject({ accountId: l.accountId, businessId: o.businessId });
    const again = await draft(l.token);
    const none = await seal(l.token, again, { usePlan: true });
    expect(none.status).toBe(402);
    expect(none.body.error.code).toBe("no_wishes");
    // the body cannot set the business
    const bad = await t.http().post("/v1/wishes").set(bearer(o.token)).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: STYLE, businessId: o.businessId });
    expect(bad.status).toBe(422);
  });

  it("5. a failed step after the draw gives the wish back (both ways)", async () => {
    const o = await owner(threeLeft);
    const id = await draft(o.token);
    const spy = jest.spyOn(wishes, "issueNumber").mockRejectedValueOnce(new Error("boom"));
    expect((await seal(o.token, id, { usePlan: true })).status).toBe(500);
    spy.mockRestore();
    expect((await business(o.businessId)).used).toBe(7);
    expect(await db.wish.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "draft", ticket: null, businessId: null });
    expect(await count(o.businessId)).toEqual({ wishes: 0, records: 0, linked: 0 });
    const s2 = jest.spyOn(wishes, "createBusinessDraftIn").mockRejectedValueOnce(new Error("boom"));
    expect((await e30(o.token)).status).toBe(500);
    s2.mockRestore();
    expect((await business(o.businessId)).used).toBe(7);
    expect(await count(o.businessId)).toEqual({ wishes: 0, records: 0, linked: 0 });
    expect((await seal(o.token, id, { usePlan: true })).status).toBe(200);
    expect((await business(o.businessId)).used).toBe(8);
  });

  it("6. another business and a removed login see nothing", async () => {
    const a = await owner();
    const l = await login(a.businessId);
    const made = await e30(l.token);
    expect(made.status).toBe(201);
    expect((await t.http().get(`/v1/business/client-wishes/${made.body.id}`).set(bearer(a.token))).status).toBe(200);
    const b = await owner();
    expect((await t.http().get(`/v1/business/client-wishes/${made.body.id}`).set(bearer(b.token))).status).toBe(404);
    expect((await t.http().get("/v1/business/client-wishes").set(bearer(b.token))).body.items).toHaveLength(0);
    expect((await t.http().get(`/v1/wishes/${made.body.wishId}`).set(bearer(b.token))).status).toBe(404);
    expect((await t.http().get(`/v1/wishes/${made.body.wishId}`).set(bearer(a.token))).status).toBe(200);
    await db.login.updateMany({ where: { businessId: a.businessId }, data: { status: "removed" } });
    expect((await t.http().get(`/v1/business/client-wishes/${made.body.id}`).set(bearer(l.token))).status).toBe(403);
    expect((await t.http().get(`/v1/wishes/${made.body.wishId}`).set(bearer(l.token))).status).toBe(200); // the wish is the login's own (it made it)
    const mine = await draft(l.token);
    expect((await seal(l.token, mine, { usePlan: true })).status).toBe(403);
    expect((await e30(l.token)).status).toBe(403);
  });

  it("7. erasing the owner: sent client wishes keep playing to the end of the term and are then erased; drafts and a person's own wishes at once; a login's are covered", async () => {
    const o = await owner();
    const l = await login(o.businessId);
    const linkOf = async (id: string) => (await db.wishLink.findFirstOrThrow({ where: { wishId: id } })).slug;
    // the owner's: one sent from the sheet (E-30, written and sealed), one sealed in the maker on the plan, one draft from the sheet
    const sheet = (await e30(o.token, { client: "Sent Client" })).body;
    const sw = await db.wish.findUniqueOrThrow({ where: { id: sheet.wishId } });
    await t.http().patch(`/v1/wishes/${sw.id}`).set(bearer(o.token)).send({ version: sw.version, content: letter });
    expect((await seal(o.token, sw.id)).status).toBe(200);
    const maker = await draft(o.token);
    expect((await seal(o.token, maker, { usePlan: true })).status).toBe(200);
    const unsent = (await e30(o.token, { client: "Draft Client" })).body;
    // the login's: one sealed on the plan, one draft from the sheet
    const lSent = await draft(l.token);
    expect((await seal(l.token, lSent, { usePlan: true })).status).toBe(200);
    const lDraft = (await e30(l.token, { client: "Login Draft" })).body;
    // a photo on a kept wish and on the login's draft
    const fileIds: string[] = [];
    for (const [wishId, accountId] of [[sw.id, o.accountId], [lDraft.wishId, l.accountId]] as const) {
      const id = ids.next();
      await db.storedFile.create({ data: { id, ownerAccountId: accountId, purpose: "wish_photo", objectKey: `k/${id}`, contentType: "image/jpeg", bytes: 10n, status: "ready", variants: {}, driver: "r2" } });
      await db.wishFile.create({ data: { id: ids.next(), wishId, fileId: id, role: "photo" } });
      fileIds.push(id);
    }
    // the owner's own wish, paid by ticket, sealed
    const own = await draft(o.token);
    await wishes.fulfilTicket(own, "moment");
    expect((await seal(o.token, own)).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: own } })).businessId).toBeNull();
    const slugs = { sheet: await linkOf(sw.id), maker: await linkOf(maker), lSent: await linkOf(lSent), own: await linkOf(own) };
    // two are opened before the erase (the term is set), the maker one after it
    for (const id of [sw.id, lSent]) await db.$transaction((tx) => life.markOpened(tx, id, t.clock.now()));
    const term = (await db.wish.findUniqueOrThrow({ where: { id: sw.id } })).endsAt as Date;

    await t.app.get(AccountErasureService).erase(o.accountId, { actor: { type: "system", id: null, requestId: "zb3" }, reason: "test" });

    // at once: drafts, the person's own wish, the client's name and contact
    for (const id of [unsent.wishId, lDraft.wishId, own]) expect(await db.wish.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "removed", name: null });
    expect([404, 410]).toContain((await t.http().get(`/v1/w/${slugs.own}`)).status); // the name is cut off the link: the old address finds nothing
    expect(await db.clientWish.findMany({ where: { businessId: o.businessId, client: { not: null } } })).toEqual([]);
    expect(await db.wishFile.count({ where: { wishId: lDraft.wishId } })).toBe(0);
    expect(await db.wishFile.count({ where: { wishId: sw.id } })).toBe(1); // a kept wish keeps its photo until its term ends
    expect(await db.clientWish.findUniqueOrThrow({ where: { id: unsent.id } })).toMatchObject({ wish: null });
    // kept: the sent ones still play at their links
    for (const s of [slugs.sheet, slugs.maker, slugs.lSent]) expect((await t.http().get(`/v1/w/${s}`)).status).toBe(200);
    expect(await db.wish.count({ where: { id: { in: [sw.id, maker, lSent] }, status: { in: ["sealed", "live"] } } })).toBe(3);
    // the maker one is opened after the erase: it is still erased at the end of its term, not rested
    await db.$transaction((tx) => life.markOpened(tx, maker, t.clock.now()));
    const makerEnds = (await db.wish.findUniqueOrThrow({ where: { id: maker } })).endsAt as Date;
    expect(makerEnds.getTime()).toBeGreaterThanOrEqual(term.getTime());

    // before the end: nothing is erased
    t.clock.set(new Date(term.getTime() - DAY));
    const sentIds = [sw.id, maker, lSent];
    const recIds = (await db.clientWish.findMany({ where: { wishId: { in: sentIds } }, select: { id: true } })).map((r) => `client-wish:${r.id}`);
    const files = fileIds.map((f) => `erase-wish-file:${f}`);
    await t.app.get(JobsService).runDue(100, [...sentIds, ...recIds, ...files]);
    expect((await t.http().get(`/v1/w/${slugs.sheet}`)).status).toBe(200);
    // after the end: wish, link, files and the record's words are erased
    t.clock.set(new Date(Math.max(term.getTime(), makerEnds.getTime()) + 60_000));
    await t.app.get(JobsService).runDue(100, [...sentIds, ...recIds, ...files]);
    for (const [id, slug] of [[sw.id, slugs.sheet], [maker, slugs.maker], [lSent, slugs.lSent]] as const) {
      expect(await db.wish.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: null, erasedAt: expect.any(Date) });
      expect([404, 410]).toContain((await t.http().get(`/v1/w/${slug}`)).status);
      expect(await db.wishFile.count({ where: { wishId: id } })).toBe(0);
      expect((await db.wishLink.findFirstOrThrow({ where: { wishId: id } })).active).toBe(false);
    }
    expect(await db.storedFile.count({ where: { id: { in: fileIds } } })).toBe(0);
    const rows = await db.clientWish.findMany({ where: { businessId: o.businessId } });
    expect(rows.every((r) => r.wish === null && r.client === null && r.from === null)).toBe(true);
    // the owner's logins can no longer act
    expect((await e30(l.token)).status).toBe(403);
  });

  it("8. a refund of the plan payment that paid for a sealed client wish: the existing revoke takes the plan back and leaves the wish, its record and the count", async () => {
    const o = await owner({ plan: null, allowance: null, renews: null, month: null, used: null, rolled: null });
    const paid = await pay(o, "pro.studio");
    const id = await draft(o.token);
    expect((await seal(o.token, id, { usePlan: true })).status).toBe(200);
    const before = await business(o.businessId);
    expect(before.used).toBe(1);
    const out = await db.$transaction((tx) => t.app.get(PurchasesService).revoke(tx, { id: paid }));
    expect(out).toEqual([expect.objectContaining({ kind: "pro-plan", result: "revoked" })]);
    const after = await business(o.businessId);
    expect([after.plan, after.allowance, after.renews]).toEqual([null, null, null]);
    expect(after.used).toBe(1); // a wish already made is not given back
    expect(await db.wish.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "sealed", ticket: "signature", businessId: o.businessId });
    expect(await count(o.businessId)).toEqual({ wishes: 1, records: 1, linked: 1 });
    const next = await draft(o.token);
    expect((await seal(o.token, next, { usePlan: true })).status).toBe(402);
  });
});
