import { randomBytes, scryptSync } from "node:crypto";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { ensureEntitlements } from "../../stored-files/tests/files-kit";
import { LinkLimits } from "../link-limits";
import { ReceiverActivityService } from "../receiver-activity.service";
import { testWishNo } from "../../../../test/kit/unique";

const NOW = new Date("2027-03-10T09:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const ids = new UuidV7Maker();
const VIEW_KEYS = ["content", "endsAt", "files", "keepOffer", "kind", "occasion", "openable", "opening", "openedAt", "opensAt", "prompt", "receiverName", "serverTime", "slug", "state", "styleSlug", "timeZone", "wishNo"];

describe("public wishes E-129 E-130 E-131 E-132 E-134 and the feed's E-122 E-142 E-143 E-166 (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let owner: string;
  let seq = 0;
  const address = uniqueAddress();
  const linkIds: string[] = [];
  /** Removes only this spec's address's hits (reads, and the passcode tries of the links it made): other specs share link_hit. */
  const clearHits = async (bucket?: string) => {
    const lim = t.app.get(LinkLimits);
    const keys = [lim.keyOf(address), ...linkIds.map((l) => lim.keyOf(l, address))];
    if (bucket) await db.$executeRaw`DELETE FROM link_hit WHERE bucket = ${bucket} AND key = ANY(${keys})`;
    else await db.$executeRaw`DELETE FROM link_hit WHERE key = ANY(${keys})`;
  };
  const run = `${process.pid}${Date.now() % 100000}`;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    // Reads are counted per address and link_hit is shared by every spec: this spec asks from an address of its own and clears only that address's rows.
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
    await ensureEntitlements(db);
    owner = ids.next();
    await db.account.create({ data: { id: owner, sides: ["person"], lastSide: "person" } });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await clearHits();
    t.clock.set(NOW);
  });

  const hash = (p: string): string => {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${scryptSync(p, salt, 32).toString("hex")}`;
  };

  async function wish(over: Record<string, unknown> = {}, linkOver: { active?: boolean } = {}) {
    const id = ids.next();
    const n = ++seq;
    const slug = `wish-${run}-${n}`.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "x");
    await db.wish.create({
      data: {
        id, accountId: owner, status: "sealed", ticket: "moment", kind: "love", occasion: "birthday", styleSlug: "noir", timeZone: "Africa/Lagos",
        opensAt: new Date(NOW.getTime() - 60000), sealedAt: NOW, name: "Chidi", no: testWishNo("FW"),
        content: { opening: { id: "op-1", scene: "curtain", values: { to: "Chidi" } }, letter: { paras: ["Happy birthday."] } },
        ...over,
      } as never,
    });
    const linkId = ids.next();
    linkIds.push(linkId);
    await db.wishLink.create({ data: { id: linkId, slug, wishId: id, active: linkOver.active ?? true } });
    return { id, slug, linkId };
  }
  const get = (slug: string, h: Record<string, string> = {}) => t.http().get(`/v1/w/${slug}`).set(h);
  const open = (slug: string, h: Record<string, string> = {}) => t.http().post(`/v1/w/${slug}/opens`).set(h).send({});

  it("a sealed link shows only the opening scene, the open time and the server's clock", async () => {
    const w = await wish({ opensAt: new Date(NOW.getTime() + DAY), passcodeHash: hash("1234") });
    const r = await get(w.slug);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ state: "countdown", openable: false, slug: w.slug, receiverName: "Chidi", styleSlug: "noir", serverTime: NOW.toISOString() });
    expect(r.body.opensAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
    expect(r.body.content).toEqual({ opening: { id: "op-1", scene: "curtain" } });
    expect(r.body.prompt ?? null).toBeNull();
    expect(JSON.stringify(r.body)).not.toMatch(/Happy birthday|url/);
    expect(Object.keys(r.body).every((k) => VIEW_KEYS.includes(k))).toBe(true);
    expect(r.headers["cache-control"]).toBe("no-store");
    const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    expect(row.status).toBe("sealed");
    expect(row.openedAt).toBeNull();
  });

  it("at the open time: the opening gesture gives the full content, a signed link per wish_file row only, and starts the term", async () => {
    const w = await wish();
    const fileId = ids.next();
    const strayId = ids.next();
    for (const id of [fileId, strayId]) {
      await db.storedFile.create({ data: { id, ownerAccountId: owner, purpose: "wish_photo", objectKey: `k/${id}`, contentType: "image/jpeg", bytes: 10n, status: "ready", variants: [], driver: "r2" } });
    }
    await db.wishFile.create({ data: { id: ids.next(), wishId: w.id, fileId, role: "photo" } });
    await db.wish.update({ where: { id: w.id }, data: { content: { story: { photos: [{ photoId: strayId }] }, letter: { paras: ["Happy birthday."] } } } });
    const r = await open(w.slug);
    expect(r.status).toBe(200);
    expect(r.body.state).toBe("open");
    expect(r.body.content.letter.paras[0]).toBe("Happy birthday.");
    expect(r.body.content.files).toHaveLength(1);
    expect(r.body.content.files[0]).toMatchObject({ fileId, role: "photo" });
    expect(Date.parse(r.body.content.files[0].expiresAt) - NOW.getTime()).toBe(10 * 60 * 1000);
    expect(r.body.openedAt).toBe(NOW.toISOString());
    expect(r.body.endsAt).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
    const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    expect(row.status).toBe("live");
    expect(row.openedAt?.toISOString()).toBe(NOW.toISOString());
    // a later read adds a row and does not move the term
    t.clock.advance(3600 * 1000);
    const again = await get(w.slug);
    expect(again.body.openedAt).toBe(NOW.toISOString());
    const rows = await db.$queryRaw<{ first: boolean }[]>`SELECT first FROM wish_open WHERE "wishId" = ${w.id}::uuid ORDER BY first DESC`;
    expect(rows.map((x) => x.first)).toEqual([true, false]);
  });

  it("20 first openings at once: one WishOpen with first = true and one transition", async () => {
    const w = await wish();
    const rs = await Promise.all(Array.from({ length: 20 }, () => open(w.slug)));
    const opened = rs.map((r) => (r.body as { openedAt: string }).openedAt);
    expect(rs.filter((r) => r.status !== 200 || r.body.state !== "open").map((r) => `${r.status} ${JSON.stringify(r.body).slice(0, 150)}`)).toEqual([]);
    const rows = await db.$queryRaw<{ first: boolean; n: bigint }[]>`SELECT first, count(*)::bigint AS n FROM wish_open WHERE "wishId" = ${w.id}::uuid GROUP BY first`;
    expect(Object.fromEntries(rows.map((x) => [String(x.first), Number(x.n)])) as Record<string, number>).toEqual({ true: 1, false: 19 });
    expect(await db.wishTransition.count({ where: { wishId: w.id, to: "live" } })).toBe(1);
    expect(new Set(opened).size).toBe(1);
  });

  it("a wedding wish counts its term from the wedding date (EE8) through markOpened", async () => {
    const w = await wish({ weddingDate: new Date("2027-06-01T00:00:00Z"), timeZone: "UTC" });
    const r = await open(w.slug);
    expect(r.body.endsAt).toBe(new Date(Date.parse("2027-06-01T00:00:00Z") + 7 * DAY).toISOString());
  });

  it("a passcode: nothing until unlock; wrong tries are counted; the token is bound to its link; ten tries an hour", async () => {
    const w = await wish({ passcodeHash: hash("open-sesame") });
    const other = await wish({ passcodeHash: hash("open-sesame") });
    const r = await get(w.slug);
    expect(r.body).toMatchObject({ state: "passcode", openable: true });
    expect(r.body.content).toEqual({ opening: { id: "op-1", scene: "curtain" } });
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).openedAt).toBeNull();
    const bad = await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "nope" });
    expect(bad.status).toBe(200);
    expect(bad.body).toMatchObject({ ok: false });
    expect((await db.wishLink.findUniqueOrThrow({ where: { id: w.linkId } })).tries).toBe(1);
    const ok = await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "open-sesame" });
    expect(ok.body.ok).toBe(true);
    expect(typeof ok.body.token).toBe("string");
    expect((await get(w.slug, { "x-unlock-token": ok.body.token })).body).toMatchObject({ state: "sealed", openable: true });
    expect((await open(w.slug, { "x-unlock-token": ok.body.token })).body.state).toBe("open");
    expect((await get(other.slug, { "x-unlock-token": ok.body.token })).body.state).toBe("passcode");
    expect((await get(w.slug, { "x-unlock-token": `${ok.body.token}x` })).body.state).toBe("passcode");
    t.clock.advance(16 * 60 * 1000);
    expect((await get(w.slug, { "x-unlock-token": ok.body.token })).body.state).toBe("passcode");
    // 10 per hour per link and address: 2 used, 8 more pass, the next is 429 with a time to come back
    await clearHits("read");
    for (let i = 0; i < 8; i++) expect((await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "x" })).status).toBe(200);
    const limited = await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "open-sesame" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("too_many_requests");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    // another link is not held back by this one
    expect((await t.http().post(`/v1/w/${other.slug}/unlock`).send({ passcode: "x" })).status).toBe(200);
  });

  it("a link whose wrong tries reach the lock says when to come back", async () => {
    const w = await wish({ passcodeHash: hash("abcd") });
    await db.wishLink.update({ where: { id: w.linkId }, data: { tries: 29 } });
    expect((await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "bad" })).body.ok).toBe(false);
    const locked = await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "abcd" });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBe(3600);
    t.clock.advance(3601 * 1000);
    await clearHits();
    expect((await t.http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "abcd" })).body.ok).toBe(true);
  });

  it("a question opening gives its question and takes the answer", async () => {
    const w = await wish({ passcodeHash: hash("Lagos"), content: { opening: { id: "op", scene: "ask", values: { question: "Where did we meet?" } } } });
    const r = await get(w.slug);
    expect(r.body).toMatchObject({ state: "question", prompt: "Where did we meet?" });
    expect((await t.http().post(`/v1/w/${w.slug}/unlock`).send({ opening: { answer: "Lagos" } })).body.ok).toBe(true);
  });

  // API-BASE-6 (HS2): a resting wish (and a live one past its term) no longer answers 410 on the read: its link says "resting" (see api-base-6-hold.spec.ts)
  it("taken down, removed, erased and an erased owner answer gone; an unknown or inexact slug is 404", async () => {
    const cases: [string, Record<string, unknown>, { active?: boolean }][] = [
      ["taken down", { status: "removed", removedAt: NOW }, { active: false }],
      ["erased", { status: "removed", removedAt: NOW, erasedAt: NOW, content: null }, { active: false }],
    ];
    for (const [, over, link] of cases) {
      const w = await wish(over, link);
      const r = await get(w.slug);
      expect(r.status).toBe(410);
      expect(r.body.error.code).toBe("gone");
      expect(JSON.stringify(r.body)).not.toMatch(/Chidi|Happy/);
    }
    const gone = ids.next();
    await db.account.create({ data: { id: gone, sides: ["person"], lastSide: "person", erasedAt: NOW } });
    const w = await wish({ accountId: gone });
    expect((await get(w.slug)).status).toBe(410);
    const live = await wish();
    expect((await get("nothing-here-at-all")).status).toBe(404);
    expect((await get(live.slug.toUpperCase())).status).toBe(404);
    expect((await get(live.slug + "x")).status).toBe(404);
    expect((await get("a%20b")).status).toBe(404);
  });

  it("a draft has no link to read", async () => {
    const w = await wish({ status: "draft", opensAt: null });
    expect((await get(w.slug)).status).toBe(404);
  });

  it("one reaction per opening session, changeable, counted from rows; favourites and plays", async () => {
    const w = await wish();
    await open(w.slug);
    const s1 = { "x-wish-session": "session-one-aaaa" };
    const s2 = { "x-wish-session": "session-two-bbbb" };
    const post = (path: string, body: object, h = s1) => t.http().post(`/v1/w/${w.slug}/${path}`).set(h).send(body);
    expect((await post("reaction", { reaction: "Yes.", wishId: w.id })).body).toEqual({ reaction: "Yes.", counts: { "Yes.": 1 } });
    expect((await post("reaction", { reaction: "no", wishId: w.id })).body.counts).toEqual({ no: 1 });
    expect((await post("reaction", { reaction: "Yes.", wishId: w.id }, s2)).body.counts).toEqual({ "Yes.": 1, no: 1 });
    expect((await post("reaction", { reaction: "Yes.", wishId: ids.next() })).status).toBe(422);
    expect((await post("reaction", { reaction: "", wishId: w.id })).status).toBe(422);
    const wr = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    expect((await post("favourites", { hearts: [2, 0, 2], no: wr.no })).status).toBe(204);
    expect((await post("favourites", { hearts: [1], no: wr.no })).status).toBe(204);
    expect((await post("favourites", { hearts: [1], no: "other" })).status).toBe(422);
    expect((await post("opens", {})).status).toBe(200);
    const sum = (await t.app.get(ReceiverActivityService).summary([w.id])).get(w.id);
    expect(sum).toMatchObject({ opens: 1, plays: 1, reactions: { "Yes.": 1, no: 1 }, favourites: 1, shares: 0 });
    const fav = await db.$queryRaw<{ hearts: number[] }[]>`SELECT hearts FROM wish_favourite WHERE "wishId" = ${w.id}::uuid AND session = 's:session-one-aaaa'`;
    expect(fav[0].hearts).toEqual([1]);
  });

  it("a sealed or locked link takes no reaction", async () => {
    const sealed = await wish({ opensAt: new Date(NOW.getTime() + DAY) });
    expect((await t.http().post(`/v1/w/${sealed.slug}/reaction`).send({ reaction: "Yes.", wishId: sealed.id })).status).toBe(409);
    const locked = await wish({ passcodeHash: hash("abcd") });
    expect((await t.http().post(`/v1/w/${locked.slug}/opens`).send({})).status).toBe(409);
  });

  it("60 reads a minute per address answer 429, and 100 wrong slugs are 404 then 429", async () => {
    const w = await wish({ opensAt: new Date(NOW.getTime() + DAY) });
    for (let i = 0; i < 60; i++) expect((await get(w.slug)).status).toBe(200);
    const r = await get(w.slug);
    expect(r.status).toBe(429);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
    t.clock.advance(61 * 1000);
    const codes: number[] = [];
    for (let i = 0; i < 100; i++) codes.push((await get(`guess-${run}-${i}`)).status);
    expect(codes.slice(0, 60).every((c) => c === 404)).toBe(true);
    expect(codes.slice(60).every((c) => c === 429)).toBe(true);
  });

  it("the public answer never carries the sender's account or a staff field", async () => {
    const w = await wish();
    const body = JSON.stringify((await get(w.slug)).body);
    expect(body).not.toContain(owner);
    expect(body).not.toMatch(/accountId|email|contact|phone|passcode|scrypt|makerNote|staff/i);
  });

  describe("the signed-in side of a published wish", () => {
    async function published(over: Record<string, unknown> = {}) {
      const w = await wish({ status: "live", openedAt: new Date(NOW.getTime() - 3600000), endsAt: new Date(NOW.getTime() + 7 * DAY), ...over });
      const id = ids.next();
      await db.$executeRaw`INSERT INTO published_wish (id, wish, "wishId", title) VALUES (${id}::uuid, ${w.id}, ${w.id}::uuid, 'For Chidi')`;
      return { ...w, feedId: id };
    }
    const bearer = async () => {
      const id = ids.next();
      await db.account.create({ data: { id, sides: ["person"], lastSide: "person" } });
      const token = `b10-${id}`;
      t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
      return { id, h: { authorization: `Bearer ${token}` } };
    };

    it("react, change, unreact; share; play", async () => {
      const p = await published();
      const me = await bearer();
      const put = (reaction: string, wishId = p.feedId) => t.http().put(`/v1/feed/wishes/${p.feedId}/reaction`).set(me.h).send({ reaction, wish: wishId });
      expect((await put("love")).body).toEqual({ reaction: { reaction: "love", wish: p.feedId }, counts: { reactions: 1, saves: 0 } });
      expect((await put("joy")).body.counts.reactions).toBe(1);
      expect((await put("zzz")).status).toBe(422);
      expect((await put("love", ids.next())).status).toBe(422);
      expect((await t.http().put(`/v1/feed/wishes/${p.feedId}/reaction`).send({ reaction: "love", wish: p.feedId })).status).toBe(401);
      const del = await t.http().delete(`/v1/feed/wishes/${p.feedId}/reaction`).set(me.h).send({ wish: p.feedId });
      expect(del.body).toEqual({ reaction: null, counts: { reactions: 0, saves: 0 } });
      const sh = await t.http().post(`/v1/feed/wishes/${p.feedId}/shares`).set(me.h).send({ style: "noir", wish: p.feedId });
      expect(sh.status).toBe(201);
      expect(sh.body.url).toMatch(new RegExp(`/w/${p.slug}$`));
      const shareRows = await db.$queryRaw<{ accountId: string | null }[]>`SELECT "accountId" FROM share WHERE wish = ${p.feedId}`;
      expect(shareRows).toEqual([{ accountId: null }]);
      const play = await t.http().get(`/v1/play-wishes/${p.feedId}`).set(me.h);
      expect(play.status).toBe(200);
      expect(play.body.data.letter.paras[0]).toBe("Happy birthday.");
      expect((await t.app.get(ReceiverActivityService).summary([p.id])).get(p.id)?.shares).toBe(1);
    });

    it("a resting, removed or passcoded wish is not in the feed", async () => {
      const me = await bearer();
      for (const over of [{ status: "resting" }, { status: "removed", removedAt: NOW }, { passcodeHash: hash("abcd") }]) {
        const p = await published(over);
        expect((await t.http().get(`/v1/play-wishes/${p.feedId}`).set(me.h)).status).toBe(404);
        expect((await t.http().post(`/v1/feed/wishes/${p.feedId}/shares`).set(me.h).send({ style: "x", wish: p.feedId })).status).toBe(404);
      }
      expect((await t.http().get(`/v1/play-wishes/not-an-id`).set(me.h)).status).toBe(404);
    });
  });
});
