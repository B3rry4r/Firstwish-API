import { PrismaService } from "../../../common/db/prisma.service";
import { SettlementService } from "../../payments/settlement.service";
import { uniqueAddress } from "../../../../test/kit/app";
import { boot, ids } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-03-08T09:00:00.000Z");
const letter = { letter: { paras: ["Happy birthday."] } };
const PASSCODE = { id: "passcode", values: { hint: "Our street" } };
const QUESTION = { id: "question", values: { question: "Where did we meet?" } };
let n = 0;

/** API-BASE-19 task 1 (IK1, IK2): a secret opening is never sealed without its secret; the secret lives only as the hash; an answer ignores case. */
describe("API-BASE-19 IK1, IK2: the receiver's secret", () => {
  let k: Awaited<ReturnType<typeof boot>>;
  let db: PrismaService;
  const address = uniqueAddress();
  beforeAll(async () => {
    k = await boot("ab19", NOW);
    db = k.db;
  });
  afterAll(() => k.t.close());
  beforeEach(() => k.t.clock.set(NOW));
  const http = () => k.t.http();
  const save = (auth: string, id: string, body: Record<string, unknown>) => http().patch(`/v1/wishes/${id}`).set("Authorization", auth).send(body);
  const version = async (id: string) => (await db.wish.findUniqueOrThrow({ where: { id } })).version;
  const patch = async (auth: string, id: string, body: Record<string, unknown>) => save(auth, id, { version: await version(id), ...body });
  const seal = async (auth: string, id: string, extra: Record<string, unknown> = {}) => http().post(`/v1/wishes/${id}/seal`).set("Authorization", auth).send({ version: await version(id), openNow: true, ...extra });
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const draft = (accountId: string, over: Record<string, unknown> = {}) =>
    k.wish(accountId, { status: "draft", name: "Ada", styleSlug: "noir", content: { ...letter, opening: PASSCODE }, ...over });
  const WORDS = { passcode: "Set the passcode before you seal it.", question: "Set the answer before you seal it." };

  async function payTicket(accountId: string, sku: string) {
    const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
    const unit = book.promoKobo ?? book.listKobo;
    const id = ids.next();
    await db.payment.create({
      data: { id, accountId, payerContact: "x@example.com", purpose: "ticket", subjectId: null, lines: [{ sku, name: sku, qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN", priceBookVersion: book.version,
        status: "pending", provider: "paystack", providerReference: `fw-${id}`, idempotencyKey: `${accountId}:${id}`, channel: "card", options: { request: { purpose: "x" }, server: { fingerprint: id, flags: [] } } },
    });
    await k.t.app.get(SettlementService).settle({ reference: `fw-${id}`, status: "success", amountKobo: unit, currency: "NGN", paidAt: NOW });
  }

  /** Each way a wish is sealed: the maker's own ticket, the Pass, a business plan, and a Concierge maker on an order (a business's order and a group wish end in these same calls). */
  type Way = { name: string; prepare: (kind: "passcode" | "question") => Promise<{ auth: string; id: string; extra: Record<string, unknown>; untouched: () => Promise<unknown> }> };
  const opening = { passcode: PASSCODE, question: QUESTION };
  const ways: Way[] = [
    { name: "ticket", prepare: async (kind) => {
      const u = await k.account();
      const id = await draft(u.id, { ticket: "keepsake", content: { ...letter, opening: opening[kind] } });
      return { auth: u.auth, id, extra: {}, untouched: () => Promise.resolve() };
    } },
    { name: "pass", prepare: async (kind) => {
      const u = await k.account();
      await payTicket(u.id, "pass.year");
      const id = await draft(u.id, { content: { ...letter, opening: opening[kind] } });
      return { auth: u.auth, id, extra: { usePass: true }, untouched: async () => expect((await db.passMembership.findFirstOrThrow({ where: { accountId: u.id } })).wishesUsed).toBe(0) };
    } },
    { name: "plan", prepare: async (kind) => {
      const u = await k.account(["person", "business"]);
      const businessId = ids.next();
      await db.business.create({ data: { id: businessId, accountId: u.id, name: "Studio", business: "Studio", since: NOW, plan: "studio", allowance: 35, used: 0, rolled: 0, month: "2027-03", renews: new Date("2027-04-01T09:00:00.000Z") } });
      const id = await draft(u.id, { businessId, content: { ...letter, opening: opening[kind] } });
      return { auth: u.auth, id, extra: { usePlan: true }, untouched: async () => expect((await db.business.findUniqueOrThrow({ where: { id: businessId } })).used).toBe(0) };
    } },
    { name: "concierge maker", prepare: async (kind) => {
      const maker = await k.staff(["maker"]);
      const ops = await k.staff(["ops"]);
      const buyer = await k.account();
      const orderId = (await http().post("/v1/concierge-orders").set("Authorization", buyer.auth).send({ brief: `ab19 ${RUN}-${++n}`, count: 1, kind: "single", rush: false })).body.id as string;
      const amt = (await db.$queryRaw<{ a: bigint }[]>`SELECT "amountKobo" AS a FROM concierge_order_ext WHERE "orderId" = ${orderId}::uuid`)[0].a;
      const pid = ids.next();
      await db.payment.create({ data: { id: pid, accountId: buyer.id, purpose: "concierge", subjectId: orderId, lines: [{ sku: "concierge.single", name: "c", qty: 1, unitKobo: Number(amt), totalKobo: Number(amt) }], amountKobo: amt, currency: "NGN", priceBookVersion: 1,
        status: "pending", provider: "paystack", providerReference: `fw-${pid}`, idempotencyKey: `${buyer.id}:${pid}`, channel: "card", options: { request: { purpose: "concierge", subjectId: orderId }, server: { fingerprint: pid, flags: [] } } } });
      await k.t.app.get(SettlementService).settle({ reference: `fw-${pid}`, status: "success", amountKobo: amt, currency: "NGN", paidAt: NOW });
      await http().post(`/v1/admin/concierge/orders/${orderId}/maker`).set("Authorization", ops.auth).send({ makerId: maker.id, reason: "to maker", expectedMaker: "" }).expect(200);
      const made = await http().post(`/v1/admin/concierge/orders/${orderId}/wishes`).set("Authorization", maker.auth).send({ reason: "making it", kind: "birthday", occasion: "birthday", name: "Ada Obi" });
      const id = made.body.id as string;
      await db.wish.update({ where: { id }, data: { styleSlug: "noir", content: { ...letter, opening: opening[kind] } } });
      return { auth: maker.auth, id, extra: {}, untouched: () => Promise.resolve() };
    } },
  ];

  for (const way of ways) {
    it(`1a (${way.name}): a passcode or a question opening with no secret is refused with words; once the secret is set it seals`, async () => {
      for (const kind of ["passcode", "question"] as const) {
        const w = await way.prepare(kind);
        const r = await seal(w.auth, w.id, w.extra);
        expect(r.status).toBe(422);
        expect(r.body.error.message).toBe(WORDS[kind]);
        expect(r.body.error.fields.passcode).toBe(WORDS[kind]);
        expect(await row(w.id)).toMatchObject({ status: "draft", no: null, passcodeHash: null });
        expect(await db.wishLink.count({ where: { wishId: w.id } })).toBe(0);
        await w.untouched();
        expect((await patch(w.auth, w.id, { passcode: "baobab" })).status).toBe(200);
        expect((await seal(w.auth, w.id, w.extra)).status).toBe(200);
        expect((await row(w.id)).passcodeHash).toMatch(/^scrypt\$/);
      }
    });
  }

  it("1a: an opening with no secret still seals with no passcode", async () => {
    const u = await k.account();
    const id = await draft(u.id, { ticket: "keepsake", content: { ...letter, opening: { id: "open", values: {} } } });
    expect((await seal(u.auth, id)).status).toBe(200);
  });

  it("1b: a save that names an opening with no secret clears the hash; passcode to question needs a new passcode; passcode to passcode keeps it", async () => {
    const u = await k.account();
    const id = await draft(u.id, { ticket: "keepsake" });
    expect((await patch(u.auth, id, { passcode: "sesame7" })).status).toBe(200);
    const first = (await row(id)).passcodeHash;
    expect(first).toMatch(/^scrypt\$/);
    // a save that leaves the opening alone keeps it; the same opening again keeps it
    expect((await patch(u.auth, id, { name: "Ada Obi" })).status).toBe(200);
    expect((await patch(u.auth, id, { content: { opening: { ...PASSCODE, values: { hint: "New hint" } } } })).status).toBe(200);
    expect((await row(id)).passcodeHash).toBe(first);
    // passcode to question without a new passcode: the old secret must not answer the new question
    expect((await patch(u.auth, id, { content: { opening: QUESTION } })).status).toBe(200);
    expect((await row(id)).passcodeHash).toBeNull();
    expect((await (await http().get(`/v1/wishes/${id}`).set("Authorization", u.auth)).body.hasPasscode)).toBe(false);
    // with the answer in the same save it is kept (and a seal then goes through)
    expect((await patch(u.auth, id, { content: { opening: { id: "passcode", values: {} } } })).status).toBe(200);
    expect((await patch(u.auth, id, { content: { opening: QUESTION }, passcode: "Baobab" })).status).toBe(200);
    expect((await row(id)).passcodeHash).toMatch(/^scrypt\$/);
    // an opening with no secret clears it, and so does taking the opening away
    expect((await patch(u.auth, id, { content: { opening: { id: "open", values: {} } } })).status).toBe(200);
    expect((await row(id)).passcodeHash).toBeNull();
    expect((await patch(u.auth, id, { content: { opening: PASSCODE }, passcode: "sesame7" })).status).toBe(200);
    expect((await patch(u.auth, id, { content: { opening: null } })).status).toBe(200);
    expect((await row(id)).passcodeHash).toBeNull();
  });

  it("1c: the code and the answer are never stored or read back; the hint and the question stay", async () => {
    const u = await k.account();
    const id = await draft(u.id, { ticket: "keepsake" });
    const sent = await patch(u.auth, id, { content: { opening: { id: "passcode", values: { code: "sesame7", hint: "Our street" } } }, passcode: "sesame7" });
    expect(sent.status).toBe(200);
    expect((await row(id)).content).toMatchObject({ opening: { id: "passcode", values: { hint: "Our street" } } });
    expect(JSON.stringify((await row(id)).content)).not.toContain("sesame7");
    const q = await patch(u.auth, id, { content: { opening: { id: "question", values: { question: "Where did we meet?", answer: "Baobab" } } }, passcode: "Baobab" });
    expect(q.status).toBe(200);
    expect((await row(id)).content).toMatchObject({ opening: { id: "question", values: { question: "Where did we meet?" } } });
    const reads = [await http().get(`/v1/wishes/${id}`).set("Authorization", u.auth), await http().get("/v1/wishes").set("Authorization", u.auth), q];
    for (const r of reads) expect(JSON.stringify(r.body).toLowerCase()).not.toMatch(/baobab|sesame7|"answer"|"code"/);
    expect(JSON.stringify(reads[0].body)).toContain("Where did we meet?");
    // the table's own check (wish_content_no_secret, Q8) already refuses a row that holds them: no older row can
    await expect(db.$executeRaw`UPDATE wish SET content = ${JSON.stringify({ opening: { id: "passcode", values: { code: "x" } } })}::jsonb WHERE id = ${id}::uuid`).rejects.toThrow(/wish_content_no_secret/);
  });

  async function sealed(kind: "passcode" | "question", secret: string) {
    const u = await k.account();
    const id = await draft(u.id, { ticket: "keepsake", content: { ...letter, opening: kind === "passcode" ? PASSCODE : QUESTION } });
    expect((await patch(u.auth, id, { passcode: secret })).status).toBe(200);
    expect((await seal(u.auth, id)).status).toBe(200);
    const slug = (await db.wishLink.findFirstOrThrow({ where: { wishId: id } })).slug;
    const link = (await db.wishLink.findFirstOrThrow({ where: { wishId: id } })).id;
    return { slug, link, id };
  }
  const unlock = (slug: string, body: Record<string, unknown>) => http().post(`/v1/w/${slug}/unlock`).set("x-forwarded-for", address).send(body);

  it("1d: a question's answer opens without case or outer spaces; a passcode without outer spaces, with its case", async () => {
    const q = await sealed("question", "Baobab");
    for (const a of ["BAOBAB", " baobab ", "Baobab", "baobab"]) expect((await unlock(q.slug, { answer: a })).body.ok).toBe(true);
    expect((await unlock(q.slug, { opening: { answer: "  BaObAb" } })).body.ok).toBe(true);
    expect((await unlock(q.slug, { answer: "baobabs" })).body.ok).toBe(false);
    const p = await sealed("passcode", "Sesame7");
    expect((await unlock(p.slug, { passcode: "Sesame7" })).body.ok).toBe(true);
    // IK2a: outer spaces are cut from a passcode too; its case is kept
    expect((await unlock(p.slug, { passcode: " Sesame7 " })).body.ok).toBe(true);
    for (const a of ["sesame7", "SESAME7"]) expect((await unlock(p.slug, { passcode: a })).body).toMatchObject({ ok: false, error: "That is not the passcode." });
  });

  it("1d: the tries are counted as before: 10 an hour per address, 30 lock the link", async () => {
    const a = await sealed("question", "Baobab");
    const first = [];
    for (let i = 0; i < 10; i++) first.push((await unlock(a.slug, { answer: "nope" })).status);
    expect(first).toEqual(Array(10).fill(200));
    const limited = await unlock(a.slug, { answer: "baobab" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    const b = await sealed("passcode", "abcd");
    await db.wishLink.update({ where: { id: b.link }, data: { tries: 29 } });
    expect((await unlock(b.slug, { passcode: "bad" })).body.ok).toBe(false);
    const locked = await unlock(b.slug, { passcode: "abcd" });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBe(3600);
  });
});
