import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { ensureEntitlements } from "../../stored-files/tests/files-kit";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { AccountErasureService } from "../account-erasure.service";
import { testWishNo } from "../../../../test/kit/unique";

const NOW = new Date("2028-03-10T09:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
const NAME = `zq${run}`;
let seq = 0;

describe("Wave 4 join: erasing a business owner (J5) and no name left in a link (J8)", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    await ensureEntitlements(db);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const erase = (accountId: string) => t.app.get(AccountErasureService).erase(accountId, { actor: { type: "system", id: null, requestId: "join4" }, reason: "test" });
  const jobs = (only: string[]) => t.app.get(JobsService).runDue(50, only);
  const get = (slug: string) => t.http().get(`/v1/w/${slug}`);

  async function owner(withBusiness: boolean) {
    const accountId = ids.next();
    await db.account.create({ data: { id: accountId, contact: `j4e-${run}-${++seq}@example.com`, name: "Ada Obi", sides: withBusiness ? ["person", "business"] : ["person"], lastSide: "person" } });
    let businessId: string | null = null;
    if (withBusiness) {
      businessId = ids.next();
      await db.business.create({ data: { id: businessId, accountId, name: "Studio", business: "Studio", ownerName: "Ada Obi", since: NOW } });
    }
    return { accountId, businessId };
  }
  /** A wish with a link named after the receiver (the issued shape: name, a dash, 10 random characters). */
  async function wish(o: { accountId: string; businessId: string | null }, over: Record<string, unknown> = {}) {
    const id = ids.next();
    const slug = `${NAME}-${String(++seq).padStart(3, "0")}abcdefg`.slice(0, 32);
    await db.wish.create({
      data: {
        id, accountId: o.accountId, businessId: o.businessId, status: "sealed", ticket: "moment", kind: "love", occasion: "birthday", styleSlug: "noir", timeZone: "Africa/Lagos",
        opensAt: new Date(NOW.getTime() - 60_000), sealedAt: NOW, name: NAME, no: testWishNo("J4"), content: { letter: { paras: [`Dear ${NAME}`] } }, ...over,
      } as never,
    });
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    return { id, slug };
  }
  const tail = (slug: string) => slug.slice(slug.indexOf("-") + 1);

  it("J5: the owner's data and the client record go at once; a sent client wish keeps playing to the end of its term and is erased then; an unsent one at once", async () => {
    const o = await owner(true);
    const sealed = await wish(o);
    const live = await wish(o, { status: "live", openedAt: new Date(NOW.getTime() - 3_600_000), endsAt: new Date(NOW.getTime() + 3 * DAY) });
    const draft = await wish(o, { status: "draft", opensAt: null, sealedAt: null });
    await db.login.create({ data: { id: ids.next(), businessId: o.businessId, contact: "staff@example.com", status: "active" } });
    const cw = async (over: Record<string, unknown>) => {
      const id = ids.next();
      await db.clientWish.create({ data: { id, businessId: o.businessId, client: "Chidi Okeke", from: "Ada Obi", wish: "words for the client", kind: "love", occasion: "birthday", key: `k-${id}`, ...over } });
      return id;
    };
    const sentCw = await cw({ sentAt: NOW, endsAt: new Date(NOW.getTime() + 2 * DAY) });
    const unsentCw = await cw({ sentAt: null, endsAt: null });
    expect((await get(sealed.slug)).status).toBe(200);

    await erase(o.accountId);

    const acct = await db.account.findUniqueOrThrow({ where: { id: o.accountId } });
    expect(acct).toMatchObject({ name: null, contact: null });
    expect(acct.erasedAt).not.toBeNull();
    const biz = await db.business.findUniqueOrThrow({ where: { id: o.businessId! } });
    expect(biz).toMatchObject({ ownerName: null, business: null, name: null });
    expect((await db.login.findMany({ where: { businessId: o.businessId } })).every((l) => l.contact === null && l.status === "removed")).toBe(true);
    // the client record (name, contact) goes at once; the words of an unsent client wish go at once; a sent one keeps its words for its term
    expect(await db.clientWish.findUniqueOrThrow({ where: { id: sentCw } })).toMatchObject({ client: null, from: null, wish: "words for the client" });
    expect(await db.clientWish.findUniqueOrThrow({ where: { id: unsentCw } })).toMatchObject({ client: null, from: null, wish: null });
    // an unsent wish (a draft) is erased at once
    const d = await db.wish.findUniqueOrThrow({ where: { id: draft.id } });
    expect(d.erasedAt).not.toBeNull();
    expect(d.content).toBeNull();
    expect((await get(draft.slug)).status).toBe(404);
    // the sent wishes are not erased and their links still play
    for (const w of [sealed, live]) {
      const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
      expect(row.erasedAt).toBeNull();
      expect(row.content).not.toBeNull();
    }
    expect((await get(live.slug)).status).toBe(200);
    const opened = await t.http().post(`/v1/w/${sealed.slug}/opens`).send({});
    expect(opened.status).toBe(200);
    expect(opened.body.state).toBe("open");
    const sealedEnds = (await db.wish.findUniqueOrThrow({ where: { id: sealed.id } })).endsAt!;
    expect(sealedEnds.getTime()).toBe(NOW.getTime() + 7 * DAY);
    // nothing rests them and nobody is told
    expect(await db.job.count({ where: { subjectId: { in: [sealed.id, live.id] }, type: { in: ["rest_wish", "send_notice"] } } })).toBe(0);

    // inside the term: still there; the client wish's words stay until its term ends
    t.clock.set(new Date(NOW.getTime() + 1 * DAY));
    await jobs([sealed.id, live.id, `client-wish:${sentCw}`]);
    expect((await get(live.slug)).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: live.id } })).erasedAt).toBeNull();
    // the 3-day wish ends: erased, its link is gone
    t.clock.set(new Date(NOW.getTime() + 3 * DAY + 60_000));
    await jobs([sealed.id, live.id, `client-wish:${sentCw}`]);
    const liveRow = await db.wish.findUniqueOrThrow({ where: { id: live.id } });
    expect(liveRow.erasedAt).not.toBeNull();
    expect(liveRow.content).toBeNull();
    expect((await get(tail(live.slug))).status).toBe(410);
    expect((await db.clientWish.findUniqueOrThrow({ where: { id: sentCw } })).wish).toBeNull();
    // the wish that opened lives its 7 days and is gone after
    expect((await get(sealed.slug)).status).toBe(200);
    t.clock.set(new Date(NOW.getTime() + 7 * DAY + 60_000));
    await jobs([sealed.id]);
    const sealedRow = await db.wish.findUniqueOrThrow({ where: { id: sealed.id } });
    expect(sealedRow.erasedAt).not.toBeNull();
    expect(sealedRow.status).toBe("removed");
    expect((await get(tail(sealed.slug))).status).toBe(410);
  });

  it("J5: a person (no business) who is erased keeps no wish playing: every wish is erased at once", async () => {
    const o = await owner(false);
    const w = await wish(o);
    await erase(o.accountId);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).erasedAt).not.toBeNull();
    expect((await get(tail(w.slug))).status).toBe(410);
    expect((await get(w.slug)).status).toBe(404);
  });

  async function rowsHolding(token: string): Promise<string[]> {
    const tables = await db.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const found: string[] = [];
    for (const { table_name } of tables) {
      const n = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table_name}" x WHERE x::text ILIKE $1`, `%${token}%`);
      if (Number(n[0].n) > 0) found.push(`${table_name}:${JSON.stringify(await db.$queryRawUnsafe(`SELECT x::text AS r FROM "${table_name}" x WHERE x::text ILIKE $1 LIMIT 1`, `%${token}%`)).slice(0, 300)}`);
    }
    return found;
  }

  it("J8: erasing a wish cuts the name off its link and deletes its openings; after an owner's erase no row of any table holds the name", async () => {
    // one wish erased on its own
    const solo = await owner(false);
    const a = await wish(solo, { name: `${NAME}` });
    expect((await t.http().post(`/v1/w/${a.slug}/opens`).send({})).status).toBe(200);
    expect(await db.wishOpen.count({ where: { wishId: a.id } })).toBeGreaterThan(0);
    await db.$transaction(async (tx) => {
      const l = t.app.get(WishLifecycleService);
      await l.move(tx, await l.lock(tx, a.id), "erased", { cause: "test.erase" });
    });
    const link = await db.wishLink.findFirstOrThrow({ where: { wishId: a.id } });
    expect(link.slug).toBe(tail(a.slug));
    expect(link.slug).not.toContain(NAME);
    expect(await db.wishOpen.count({ where: { wishId: a.id } })).toBe(0);
    expect((await get(link.slug)).status).toBe(410);
    expect((await get(a.slug)).status).toBe(404);
    expect(JSON.stringify((await get(link.slug)).body)).not.toContain(NAME);

    // an owner erased with a named wish and its openings
    const o = await owner(false);
    const b = await wish(o);
    await t.http().post(`/v1/w/${b.slug}/opens`).send({});
    await erase(o.accountId);
    expect((await db.wishLink.findFirstOrThrow({ where: { wishId: b.id } })).slug).toBe(tail(b.slug));
    expect(await db.wishOpen.count({ where: { wishId: b.id } })).toBe(0);
    expect(await rowsHolding(NAME)).toEqual([]);
  });
});
