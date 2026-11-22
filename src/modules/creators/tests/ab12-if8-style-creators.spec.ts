import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { ownDatabase } from "../../../../test/kit/own-db";
import { testSlug } from "../../../../test/kit/unique";
import { uniqueHandle } from "../../accounts/tests/sides.kit";
import { account, B12App, b13App, bearer, staffOf } from "../../showing/tests/b13-kit";
import { RoyaltiesService } from "../../royalties/royalties.service";

const DAY = 86_400_000;

/** API-BASE-12 case 3 (IH1, IF4a): a style is tied to a creator's account only on proof; a handle proves nothing. */
describe("IH1 a creator's styles follow the account, on proof", () => {
  let t: B12App;
  let db: PrismaService;
  let roy: RoyaltiesService;
  const own = ownDatabase("if8");
  const sql = readFileSync(join(__dirname, "../../../../prisma/migrations/20261204090000_style_creator_ab12/migration.sql"), "utf8");
  beforeAll(async () => {
    own.use();
    t = await b13App();
    db = t.db;
    roy = t.app.get(RoyaltiesService);
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });
  const ago = (d: number) => new Date(Date.now() - d * DAY);

  async function acct(createdAt: Date, handle?: string | null) {
    const who = await account(t, ["creator"]);
    const h = handle === undefined ? uniqueHandle("c") : handle;
    await db.account.update({ where: { id: who.accountId }, data: { handle: h, name: "M", createdAt } });
    const creatorId = (await db.creator.create({ data: { id: t.id(), accountId: who.accountId, name: "M" } })).id;
    return { handle: h, creatorId, accountId: who.accountId };
  }
  async function style(handle: string | null, tag: string) {
    const slug = `${testSlug("st")}-${tag}`;
    const row = await db.style.create({ data: { id: t.id(), slug, name: slug, level: "premium", tier: "premium", house: false, on: true, by: "x", get: "", record: [], addedAt: ago(10), creator: (handle ? { handle, name: "M" } : null) as never } as never });
    return { slug, id: row.id };
  }
  const submit = (styleId: string, creatorId: string) => db.styleSubmission.create({ data: { id: t.id(), styleId, creatorId, version: 1, checks: [], status: "live" } as never });
  async function pay(slug: string) {
    const accountId = (await account(t, ["person"])).accountId;
    const wishId = t.id();
    const amount = 1_500_000n;
    return db.payment.create({
      data: { id: t.id(), accountId, businessId: null, purpose: "ticket", subjectId: wishId, lines: [{ sku: "ticket.keepsake", name: "k", qty: 1, unitKobo: Number(amount), totalKobo: Number(amount) }], amountKobo: amount, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `fw-${t.id()}`, idempotencyKey: `ab12-${testSlug("k")}`, verifiedAt: new Date(), createdAt: new Date(), options: { request: { purpose: "ticket", subjectId: wishId, options: { style: slug } }, server: { fingerprint: "x" } } } as never,
    });
  }
  const stored = async (id: string) => ((await db.style.findUniqueOrThrow({ where: { id } })).creator as { creatorId?: string } | null)?.creatorId ?? null;

  it("only a submission of the style by one creator ties it; S1, S3, S3b, S4b, S5, S6 and the rest stay untied or go to the maker; nobody is paid for an untied style; past royalties unchanged; twice the same", async () => {
    type Shape = { name: string; style: { slug: string; id: string }; tied: string | null };
    const shapes: Shape[] = [];
    // S1: the holder is older than the style and is the maker, but nothing proves it: untied
    const m1 = await acct(ago(30));
    shapes.push({ name: "S1", style: await style(m1.handle, "s1"), tied: null });
    // S3: the maker renamed; an older other account holds the handle; no submission: untied
    await acct(ago(30), "oldname3");
    const n3 = await acct(ago(20));
    shapes.push({ name: "S3", style: await style(n3.handle, "s3"), tied: null });
    // S3b: the same, with a submission by the real maker: tied to the maker, never to the holder
    const m3b = await acct(ago(30), "oldname3b");
    const n3b = await acct(ago(20));
    const s3b = await style(n3b.handle, "s3b");
    await submit(s3b.id, m3b.creatorId);
    shapes.push({ name: "S3b", style: s3b, tied: m3b.creatorId });
    // S4b: the maker's account was erased; an older unrelated account took the handle: untied
    await acct(ago(30), null).then((m) => db.account.update({ where: { id: m.accountId }, data: { erasedAt: new Date() } }));
    await acct(ago(20), "erasedhandle4b");
    shapes.push({ name: "S4b", style: await style("erasedhandle4b", "s4b"), tied: null });
    // S5: the handle was held in turn; the later holder is older than the style: untied
    await acct(ago(30), "turn5a");
    const m5b = await acct(ago(25));
    shapes.push({ name: "S5", style: await style(m5b.handle, "s5"), tied: null });
    // S6: the holder is older but a submission is by another creator: tied to that creator
    const m6 = await acct(ago(30));
    const o6 = await acct(ago(30));
    const s6 = await style(m6.handle, "s6");
    await submit(s6.id, o6.creatorId);
    shapes.push({ name: "S6", style: s6, tied: o6.creatorId });
    // S7: two creators submitted it: ambiguous, untied; S8: the only submitter's account is erased: untied
    const a7 = await acct(ago(30));
    const b7 = await acct(ago(30));
    const s7 = await style(a7.handle, "s7");
    await submit(s7.id, a7.creatorId);
    await submit(s7.id, b7.creatorId);
    shapes.push({ name: "S7", style: s7, tied: null });
    const e8 = await acct(ago(30));
    const s8 = await style(e8.handle, "s8");
    await submit(s8.id, e8.creatorId);
    await db.account.update({ where: { id: e8.accountId }, data: { erasedAt: new Date() } });
    shapes.push({ name: "S8", style: s8, tied: null });

    // a style tied before, with a past royalty; a past royalty in every shape
    const m0 = await acct(ago(30));
    const s0 = await style(null, "s0");
    await db.style.update({ where: { id: s0.id }, data: { creator: { creatorId: m0.creatorId, handle: m0.handle } as never } });
    await db.$transaction(async (tx) => roy.accrue(tx, await pay(s0.slug)));
    const old = new Map<string, Awaited<ReturnType<typeof pay>>>();
    for (const s of shapes) {
      const p = await pay(s.style.slug);
      old.set(s.style.id, p);
      await db.$transaction((tx) => roy.accrue(tx, p));
    }
    const rows = async () => (await db.royaltyAccrual.findMany({ orderBy: { id: "asc" } })).map((a) => [a.id, a.creatorId, String(a.amountKobo)]);
    const ledger = () => db.ledgerEntry.count();
    const before = await rows();
    const ledgerBefore = await ledger();

    await db.$executeRawUnsafe(sql);
    const first = await Promise.all(shapes.map((s) => stored(s.style.id)));
    await db.$executeRawUnsafe(sql);
    const second = await Promise.all(shapes.map((s) => stored(s.style.id)));
    expect(second).toEqual(first); // the migration twice changes nothing more
    shapes.forEach((s, i) => expect([s.name, second[i]]).toEqual([s.name, s.tied]));
    expect(await stored(s0.id)).toBe(m0.creatorId);
    expect(await rows()).toEqual(before); // past royalty rows unchanged
    expect(await ledger()).toBe(ledgerBefore);

    // a new wish: a tied style pays its creator, an untied one pays nobody; a replay of an old payment accrues nothing for an untied style
    for (const s of shapes) {
      const made = await db.$transaction(async (tx) => roy.accrue(tx, await pay(s.style.slug)));
      expect([s.name, made.map((m) => m.creatorId)]).toEqual([s.name, s.tied ? [s.tied] : []]);
      if (!s.tied) expect(await db.$transaction((tx) => roy.accrue(tx, old.get(s.style.id)!))).toEqual([]);
    }
    // E-285 follows the proof: the creator who proved it lists it, the holder of the handle does not
    expect(((await t.http().get(`/v1/creators/${m3b.handle}/styles`)).body.items as { slug: string }[]).map((i) => i.slug)).toEqual([s3b.slug]);
    expect((await t.http().get(`/v1/creators/${n3b.handle}/styles`)).body.items).toEqual([]);
    expect((await t.http().get(`/v1/creators/${n3.handle}/styles`)).body.items).toEqual([]);
  }, 120000);

  it("staff see the untied styles in the admin styles read (E-193): the slug and the handle it carries, no creatorId", async () => {
    const m = await acct(ago(30));
    const untied = await style(m.handle, "stf");
    await db.$executeRawUnsafe(sql);
    const reviewer = await staffOf(t, "reviewer");
    const seen: { slug: string; creator: { handle?: string; creatorId?: string } | null }[] = [];
    let cursor: string | undefined;
    do {
      const r = await t.http().get("/v1/admin/styles").query({ limit: 50, ...(cursor ? { cursor } : {}) }).set(bearer(reviewer.token));
      expect(r.status).toBe(200);
      seen.push(...r.body.items);
      cursor = r.body.nextCursor ?? undefined;
    } while (cursor);
    const row = seen.find((s) => s.slug === untied.slug);
    expect(row?.creator?.handle).toBe(m.handle);
    expect(row?.creator?.creatorId).toBeUndefined();
  });
});
