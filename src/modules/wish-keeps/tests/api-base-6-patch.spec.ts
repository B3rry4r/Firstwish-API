import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { SettlementService } from "../../payments/settlement.service";
import { KeepProofs } from "../../purchases/keep-proof";
import { LinkLimits } from "../../public-wishes/link-limits";
import { NumbersService } from "../../staff-reads/numbers.service";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2032-06-14T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;

/** P-API-BASE-6 patch: HU1 no guest account, HU2 house wishes, HU3 payers do not block each other. */
describe("P-API-BASE-6 HU1 to HU3", () => {
  let t: TestApp;
  let db: PrismaService;
  let settle: SettlementService;
  let life: WishLifecycleService;
  const address = uniqueAddress();
  const linkIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    settle = t.app.get(SettlementService);
    life = t.app.get(WishLifecycleService);
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
    await db.account.create({ data: { id: accountId, contact: `ab6p-${run}-${++seq}@example.com`, sides: ["person"], lastSide: "person" } });
    return accountId;
  }
  async function wish(over: Record<string, unknown> = {}, linkOver: Record<string, unknown> = {}) {
    const id = ids.next();
    const accountId = (over.accountId as string | undefined) ?? (await owner());
    await db.wish.create({
      data: { id, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "keepsake", no: `66${seq}${id.slice(-4)}`, opensAt: new Date(NOW.getTime() - 9 * DAY), openedAt: new Date(NOW.getTime() - 9 * DAY), endsAt: new Date(NOW.getTime() + 5 * DAY), ...over, accountId } as never,
    });
    const slug = `ab6p-${run}-${++seq}`.slice(0, 30);
    const linkId = ids.next();
    await db.wishLink.create({ data: { id: linkId, slug, wishId: id, active: true, ...linkOver } });
    linkIds.push(linkId);
    return { id, slug, linkId, accountId };
  }
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
  async function pay(reference: string) {
    const p = await db.payment.findUniqueOrThrow({ where: { providerReference: reference } });
    expect((await settle.settle({ reference, status: "success", amountKobo: p.amountKobo, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
  }
  const email = () => `rcv-${run}-${++seq}@example.com`;

  it("F1 an email that has an account gets the same answer as one that has none; no Account is made or read by email", async () => {
    const w = await wish();
    const h = { "x-wish-proof": await proofOf(w.slug) };
    const known = email();
    await db.account.create({ data: { id: ids.next(), contact: known, sides: ["person"], lastSide: "person" } });
    const fresh = email();
    const accountsBefore = await db.account.count();
    const a = await start(w.slug, { keepKey: "month", email: known }, h, `ab6p-${run}-1`);
    const b = await start(w.slug, { keepKey: "month", email: fresh }, h, `ab6p-${run}-2`);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
    expect(Object.keys(a.body.payment).sort()).toEqual(Object.keys(b.body.payment).sort());
    expect(await db.account.count()).toBe(accountsBefore);
    for (const [r, e] of [[a, known], [b, fresh]] as const) {
      const row = await db.payment.findUniqueOrThrow({ where: { providerReference: r.body.payment.reference } });
      expect(row.accountId).toBeNull();
      expect(row.payerContact).toBe(e);
    }
    // the result read works with the proof alone, and says the same for both
    await pay(a.body.payment.reference);
    expect((await result(w.slug, a.body.payment.reference, h)).body.payment.state).toBe("succeeded");
    expect((await result(w.slug, b.body.payment.reference, h)).body.payment.state).toBe("pending");
  });

  it("F1 several starts at once for one payer make one payment each time (repeated)", async () => {
    for (let round = 0; round < 6; round++) {
      const w = await wish();
      const h = { "x-wish-proof": await proofOf(w.slug) };
      const e = email();
      const rs = await Promise.all([1, 2, 3, 4].map((i) => start(w.slug, { keepKey: "month", email: e }, h, `ab6p-${run}-r${round}-${i}`)));
      for (const r of rs) expect([200, 201]).toContain(r.status);
      expect(new Set(rs.map((r) => r.body.payment.reference)).size).toBe(1);
      expect(await db.payment.count({ where: { subjectId: w.id, purpose: "keep" } })).toBe(1);
    }
  });

  it("F1 erasing the wish removes the payer's email from the payment, the money record stays", async () => {
    const w = await wish();
    const h = { "x-wish-proof": await proofOf(w.slug) };
    const a = await start(w.slug, { keepKey: "month", email: email() }, h, `ab6p-${run}-e1`);
    await pay(a.body.payment.reference);
    expect((await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } })).payerContact).not.toBeNull();
    await life.eraseNow(w.id, "test");
    const row = await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } });
    expect(row.payerContact).toBeNull();
    expect(Number(row.amountKobo)).toBeGreaterThan(0);
  });

  it("F2 a house wish: no keep offer, keep, wake and report are refused with words, and it is left out of staff Numbers", async () => {
    const v = await view("house-golden");
    expect(v.status).toBe(200);
    expect(v.body.keepOffer ?? null).toBeNull();
    const house = await db.wishLink.findUniqueOrThrow({ where: { slug: "house-golden" } });
    const proof = t.app.get(KeepProofs).issueHold(house.id, house.wishId).proof;
    const calls = t.payments.started.length;
    const k = await start("house-golden", { keepKey: "month", email: email() }, { "x-wish-proof": proof }, `ab6p-${run}-h1`);
    expect(k.status).toBe(409);
    expect(k.body.error?.message ?? k.body.message ?? JSON.stringify(k.body)).toMatch(/Firstwish sample/);
    expect((await wake("house-golden", { "x-wish-proof": proof })).status).toBe(409);
    expect(t.payments.started.length).toBe(calls);
    const rep = await t.http().post("/v1/reports").send({ slug: "house-golden", reason: "other", note: "x" });
    expect(rep.status).toBe(409);
    // Numbers: a house wish made and sealed today does not count
    const nums = t.app.get(NumbersService);
    const before = await nums.read("month");
    const hid = ids.next();
    const houseAccount = await db.account.findFirstOrThrow({ where: { handle: "firstwish" } });
    await db.wish.create({ data: { id: hid, accountId: houseAccount.id, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos", ticket: "premiere", no: `H${run}`.slice(0, 20), sealedAt: NOW, openedAt: NOW, createdAt: NOW, endsAt: new Date(NOW.getTime() + 5 * DAY) } as never });
    const after = await nums.read("month");
    expect([after.previews, after.paid]).toEqual([before.previews, before.paid]);
    const own = await wish({ createdAt: NOW });
    expect((await nums.read("month")).previews).toBe(before.previews + 1);
    void own;
  });

  it("F3 a holder's unfinished payment does not block the owner or another holder; the second to settle is refund due and says so", async () => {
    const w = await wish();
    const h = { "x-wish-proof": await proofOf(w.slug) };
    const end0 = (await db.wish.findUniqueOrThrow({ where: { id: w.id } })).endsAt as Date;
    const a = await start(w.slug, { keepKey: "month", email: email() }, h, `ab6p-${run}-f1`);
    const b = await start(w.slug, { keepKey: "month", email: email() }, h, `ab6p-${run}-f2`);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.payment.reference).not.toBe(b.body.payment.reference);
    // the owner pays too: not blocked
    const token = `ab6p-${w.accountId}`;
    t.tokens.set(token, { kind: "user", accountId: w.accountId, sides: ["person"] });
    const o = await t.http().post(`/v1/wishes/${w.id}/keep`).set({ authorization: `Bearer ${token}`, "idempotency-key": `ab6p-${run}-f3` }).send({ keepKey: "month" });
    expect(o.status).toBe(201);
    await pay(a.body.payment.reference);
    await pay(b.body.payment.reference);
    await pay(o.body.payment.reference);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).endsAt?.getTime()).toBe(end0.getTime() + 30 * DAY);
    for (const r of [b, o]) {
      const row = await db.payment.findUniqueOrThrow({ where: { providerReference: r.body.payment.reference } });
      expect(row.flags).toEqual(expect.arrayContaining(["refund_due", "refund_due:keep_already_paid"]));
    }
    expect((await db.payment.findUniqueOrThrow({ where: { providerReference: a.body.payment.reference } })).flags).not.toContain("refund_due");
    const read = await result(w.slug, b.body.payment.reference, h);
    expect(read.body.payment.reason).toMatch(/refunded/);
    expect((await result(w.slug, a.body.payment.reference, h)).body.payment.reason).toBe("");
  });
});
