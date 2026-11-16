import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { lockAccount } from "../../../common/db/account-lock";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { UnlockTokens } from "../../public-wishes/unlock-token";
import { LinkLimits } from "../../public-wishes/link-limits";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-06-14T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** API-BASE-6 case 1 (HS1/HS2, HA1, HA2): keep and wake by the link with no account. */
describe("HS2 keep and wake by link, no account", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let life: WishLifecycleService;
  let unlock: UnlockTokens;
  const address = uniqueAddress();
  const linkIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    life = t.app.get(WishLifecycleService);
    unlock = t.app.get(UnlockTokens);
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
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.set(NOW);
    const lim = t.app.get(LinkLimits);
    const keys = [lim.keyOf(address), ...linkIds.map((l) => lim.keyOf(l, address))];
    await db.$executeRaw`DELETE FROM link_hit WHERE key = ANY(${keys})`;
  });

  async function owner() {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `ab6h-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    return accountId;
  }
  async function wish(over: Record<string, unknown> = {}, linkOver: Record<string, unknown> = {}) {
    const id = ids.next();
    const accountId = (over.accountId as string | undefined) ?? (await owner());
    await db.wish.create({
      data: { id, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: `66${seq}${id.slice(-4)}`, opensAt: new Date(NOW.getTime() - 9 * DAY), openedAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() + 5 * DAY), ...over, accountId } as never,
    });
    const slug = `ab6h-${run}-${++seq}`.slice(0, 30);
    const linkId = ids.next();
    await db.wishLink.create({ data: { id: linkId, slug, wishId: id, active: true, ...linkOver } });
    linkIds.push(linkId);
    return { id, slug, linkId, accountId };
  }
  const resting = { status: "resting", endsAt: new Date(NOW.getTime() - DAY), restingSince: new Date(NOW.getTime() - DAY), eraseAfter: new Date(NOW.getTime() + 300 * DAY) };
  const view = (slug: string, token?: string) => {
    const r = t.http().get(`/v1/w/${slug}`);
    return token ? r.set("x-unlock-token", token) : r;
  };
  const proofOf = async (slug: string, token?: string): Promise<string> => (await view(slug, token)).body.keepOffer.proof as string;
  const start = (slug: string, body: Record<string, unknown>, headers: Record<string, string>, key?: string) => {
    const r = t.http().post(`/v1/w/${slug}/keep`).set(headers);
    if (key) r.set("Idempotency-Key", key);
    return r.send(body);
  };
  const result = (slug: string, reference: string, headers: Record<string, string>) => t.http().get(`/v1/w/${slug}/keep/${reference}`).set(headers);
  const wake = (slug: string, headers: Record<string, string>) => t.http().post(`/v1/w/${slug}/wake`).set(headers).send({});
  const listKobo = async (sku: string) => Number((await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } })).listKobo);
  async function pay(reference: string) {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    expect((await settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
  }
  const email = () => `rcv-${run}-${++seq}@example.com`;

  it("1. the public view gives the wish id, a signed proof and the keeps on offer, and nothing of the owner", async () => {
    const w = await wish();
    const v = await view(w.slug);
    expect(v.status).toBe(200);
    expect(v.body.state).toBe("open");
    expect(v.body.keepOffer).toMatchObject({ wishId: w.id, resting: false, wake: false });
    expect(v.body.keepOffer.keeps.map((k: { key: string }) => k.key)).toEqual(["month", "half", "year"]);
    expect(v.body.keepOffer.keeps[0]).toMatchObject({ days: 30, priceKobo: await listKobo("keep.month") });
    expect(JSON.stringify(v.body)).not.toContain(w.accountId);
    const moment = await wish({ ticket: "moment" });
    expect((await view(moment.slug)).body.keepOffer).toBeNull();
  });

  it("2. a link holder with no account starts a keep, pays and reads the result back with the same proof", async () => {
    const w = await wish();
    const before = (await db.wish.findUniqueOrThrow({ where: { id: w.id } })).endsAt as Date;
    const h = { "x-wish-proof": await proofOf(w.slug) };
    const calls = t.payments.started.length;
    const a = await start(w.slug, { keepKey: "month", email: email() }, h, `ab6h-${run}-a`);
    expect(a.status).toBe(201);
    expect(a.body.payment).toMatchObject({ state: "pending", amountKobo: await listKobo("keep.month") });
    expect(a.body.item).toMatchObject({ slug: w.slug, state: "open" });
    expect(t.payments.started.length).toBe(calls + 1);
    const pay0 = await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference }, include: { account: true } });
    expect(pay0.account?.sides).toEqual([]);
    expect(pay0.accountId).not.toBe(w.accountId);
    const pending = await result(w.slug, a.body.payment.reference, h);
    expect(pending.status).toBe(200);
    expect(pending.body.payment.state).toBe("pending");
    await pay(a.body.payment.reference);
    const done = await result(w.slug, a.body.payment.reference, h);
    expect(done.body.payment.state).toBe("succeeded");
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).endsAt?.getTime()).toBe(before.getTime() + 30 * DAY);
    // a repeat of the same key answers the same payment
    const again = await start(w.slug, { keepKey: "month", email: pay0.payerContact }, h, `ab6h-${run}-a`);
    expect(again.body.payment.reference).toBe(a.body.payment.reference);
    // a payment of another wish is not readable through this link
    const other = await wish();
    expect((await result(other.slug, a.body.payment.reference, { "x-wish-proof": await proofOf(other.slug) })).status).toBe(404);
  });

  it("3. a resting wish's link says resting (no content) and offers the wake; paying a keep wakes it", async () => {
    const w = await wish({ ...resting, content: { letter: { paras: ["secret words"] } } });
    const v = await view(w.slug);
    expect(v.status).toBe(200);
    expect(v.body.state).toBe("resting");
    expect(v.body.content ?? null).toBeNull();
    expect(JSON.stringify(v.body)).not.toContain("secret words");
    expect(v.body.keepOffer).toMatchObject({ wishId: w.id, resting: true, wake: true });
    const h = { "x-wish-proof": v.body.keepOffer.proof as string };
    const noKeep = await wake(w.slug, h);
    expect(noKeep.status).toBe(402);
    const a = await start(w.slug, { keepKey: "half", email: email() }, h, `ab6h-${run}-b`);
    expect(a.status).toBe(201);
    expect(a.body.item).toMatchObject({ state: "resting" });
    await pay(a.body.payment.reference);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("live");
    expect((await view(w.slug)).body.state).toBe("open");
  });

  it("4. a resting wish a paid keep covers is woken by the link holder; a wish that is not resting is 409", async () => {
    const w = await wish();
    const h = { "x-wish-proof": await proofOf(w.slug) };
    expect((await wake(w.slug, h)).status).toBe(409);
    const a = await start(w.slug, { keepKey: "month", email: email() }, h, `ab6h-${run}-c`);
    await pay(a.body.payment.reference);
    await db.$transaction(async (tx) => {
      await lockAccount(tx, w.accountId);
      await life.move(tx, await life.lock(tx, w.id), "resting", { cause: "test", data: { restingSince: NOW, eraseAfter: new Date(NOW.getTime() + 300 * DAY) } });
    });
    expect((await view(w.slug)).body.state).toBe("resting");
    const woke = await wake(w.slug, { "x-wish-proof": await proofOf(w.slug) });
    expect(woke.status).toBe(204);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("live");
  });

  it("5. ended, removed, taken down and erased wishes still answer 410", async () => {
    const ended = await wish({ status: "removed" });
    expect((await view(ended.slug)).status).toBe(410);
    const removed = await wish({ removedAt: NOW });
    expect((await view(removed.slug)).status).toBe(410);
    const erased = await wish({ erasedAt: NOW });
    expect((await view(erased.slug)).status).toBe(410);
    const off = await wish({}, { active: false });
    expect((await view(off.slug)).status).toBe(410);
  });

  it("6. attacks: no proof, another wish's proof, a made-up proof and a passcode wish with no unlock are refused and nothing is charged", async () => {
    const a = await wish();
    const b = await wish();
    const calls = t.payments.started.length;
    const body = { keepKey: "month", email: email() };
    expect((await start(a.slug, body, {}, `ab6h-${run}-d1`)).status).toBe(403);
    expect((await start(a.slug, body, { "x-wish-proof": await proofOf(b.slug) }, `ab6h-${run}-d2`)).status).toBe(403);
    expect((await start(a.slug, body, { "x-wish-proof": `${Math.floor(NOW.getTime() / 1000) + 3600}.${"A".repeat(43)}` }, `ab6h-${run}-d3`)).status).toBe(403);
    expect((await wake(a.slug, {})).status).toBe(403);
    expect((await result(a.slug, "fw-nothing", {})).status).toBe(403);
    const salt = randomBytes(16);
    const hash = `scrypt$${salt.toString("hex")}$${scryptSync("pass1234", salt, 32).toString("hex")}`;
    const p = await wish({ passcodeHash: hash });
    const locked = await view(p.slug);
    expect(locked.body.state).toBe("passcode");
    expect(locked.body.keepOffer ?? null).toBeNull();
    const token = unlock.issue(p.linkId, hash).token;
    const proof = await proofOf(p.slug, token);
    expect((await start(p.slug, body, { "x-wish-proof": proof }, `ab6h-${run}-d4`)).status).toBe(409);
    expect((await start(p.slug, body, { "x-wish-proof": proof, "x-unlock-token": token }, `ab6h-${run}-d5`)).status).toBe(201);
    expect(t.payments.started.length).toBe(calls + 1);
    // no email, a bad length: words, no payment
    expect((await start(a.slug, { keepKey: "month" }, { "x-wish-proof": await proofOf(a.slug) }, `ab6h-${run}-d6`)).status).toBe(422);
    expect((await start(a.slug, { email: email() }, { "x-wish-proof": await proofOf(a.slug) }, `ab6h-${run}-d7`)).status).toBe(422);
  });

  it("7. two payments at once for one wish make one keep payment", async () => {
    const w = await wish();
    const h = { "x-wish-proof": await proofOf(w.slug) };
    const e = email();
    const both = await Promise.all([start(w.slug, { keepKey: "month", email: e }, h, `ab6h-${run}-e1`), start(w.slug, { keepKey: "month", email: e }, h, `ab6h-${run}-e2`)]);
    expect(both.map((r) => r.status).sort()).toEqual(expect.arrayContaining([201]));
    for (const r of both) expect([200, 201, 409]).toContain(r.status);
    expect(await db.payment.count({ where: { subjectId: w.id, purpose: "keep" } })).toBe(1);
  });

  it("8. a wish under its maker's Pass: the link holder still pays (HA2 covers only the Pass holder's own keep)", async () => {
    const owner0 = await owner();
    const book = await db.price.findFirstOrThrow({ where: { sku: "pass.year" }, orderBy: { id: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const pid = ids.next();
    await db.payment.create({
      data: {
        id: pid, accountId: owner0, payerContact: "x@example.com", purpose: "pass", lines: [{ sku: "pass.year", name: "Pass", qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN",
        priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: `fw-${pid}`, idempotencyKey: `${owner0}:${pid}`, channel: "card", options: { request: { purpose: "pass" }, server: { fingerprint: pid, flags: [] } },
      },
    });
    expect((await settle.settle({ reference: `fw-${pid}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
    const w = await wish({ accountId: owner0 });
    const a = await start(w.slug, { keepKey: "month", email: email() }, { "x-wish-proof": await proofOf(w.slug) }, `ab6h-${run}-f1`);
    expect(a.status).toBe(201);
    expect(a.body.payment).not.toBeNull();
    expect(a.body.payment.amountKobo).toBe(await listKobo("keep.month"));
  });
});
