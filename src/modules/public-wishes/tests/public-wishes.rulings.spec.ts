import { createHash, createHmac, randomBytes, scryptSync } from "node:crypto";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { LinkLimits } from "../link-limits";
import { ensureEntitlements } from "../../stored-files/tests/files-kit";
import { testWishNo } from "../../../../test/kit/unique";

const NOW = new Date("2027-03-10T09:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const SECRET = "test-access-secret-0123456789abcdef0123";
const ids = new UuidV7Maker();

describe("B10 rulings NN1 NN2 NN3 NN4 NN5 and the proofs that stay (real database, clock port)", () => {
  let t: TestApp;
  let db: PrismaService;
  let owner: string;
  let seq = 0;
  const run = `${process.pid}${Date.now() % 100000}`;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    await ensureEntitlements(db);
    owner = ids.next();
    await db.account.create({ data: { id: owner, sides: ["person"], lastSide: "person" } });
  });
  afterAll(() => t.close());
  // the contract spec runs in parallel on the same database: every case here asks from its own address and never clears link_hit
  let ipn = 0;
  let ip = "10.0.0.1";
  const nextIp = (): string => `10.${Math.floor(++ipn / 250) + 1}.${(process.pid % 200) + 1}.${(ipn % 250) + 1}`;
  beforeEach(() => {
    ip = nextIp();
    t.clock.set(NOW);
  });

  const hash = (p: string): string => {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${scryptSync(p, salt, 32).toString("hex")}`;
  };
  async function wish(over: Record<string, unknown> = {}) {
    const id = ids.next();
    const n = ++seq;
    const slug = `rl-${run}-${n}`.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "x");
    await db.wish.create({
      data: {
        id, accountId: owner, status: "sealed", ticket: "moment", kind: "love", occasion: "birthday", styleSlug: "noir", timeZone: "Africa/Lagos",
        opensAt: new Date(NOW.getTime() + 3600000), sealedAt: NOW, name: "Chidi", no: testWishNo("FW-R"),
        content: { opening: { id: "op-1", scene: "curtain", values: { to: "Chidi" } }, letter: { paras: ["Happy birthday."] } },
        ...over,
      } as never,
    });
    const linkId = ids.next();
    await db.wishLink.create({ data: { id: linkId, slug, wishId: id, active: true } });
    return { id, slug, linkId };
  }
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const open = (slug: string, h: Record<string, string> = {}) => http().post(`/v1/w/${slug}/opens`).set({ "x-forwarded-for": ip, ...h }).send({});
  const http = () => {
    const a = t.http();
    const wrap = (m: "get" | "post" | "head" | "options") => (url: string) => a[m](url).set({ "x-forwarded-for": ip });
    return { get: wrap("get"), post: wrap("post"), head: wrap("head"), options: wrap("options") };
  };
  const opens = async (id: string) => Number((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM wish_open WHERE "wishId" = ${id}::uuid`)[0].n);

  describe("NN1 a feed wish that is sealed or not yet open is 404 for play and share, for anyone", () => {
    it("NN1: sealed, a future open time, or live with a future open time: 404; live and open: 200", async () => {
      const me = ids.next();
      await db.account.create({ data: { id: me, sides: ["person"], lastSide: "person" } });
      t.tokens.set(`nn1-${me}`, { kind: "user", accountId: me, sides: ["person"] });
      const h = { authorization: `Bearer ${me ? `nn1-${me}` : ""}` };
      const live = { status: "live", openedAt: new Date(NOW.getTime() - 60000), endsAt: new Date(NOW.getTime() + DAY) };
      const cases: [string, Record<string, unknown>, number][] = [
        ["sealed, open time passed", { opensAt: new Date(NOW.getTime() - 60000) }, 404],
        ["sealed, open time ahead", { opensAt: new Date(NOW.getTime() + DAY) }, 404],
        ["live, open time ahead", { ...live, opensAt: new Date(NOW.getTime() + DAY) }, 404],
        ["live, open time passed", { ...live, opensAt: new Date(NOW.getTime() - 3600000) }, 200],
      ];
      for (const [label, over, want] of cases) {
        const w = await wish(over);
        const feedId = ids.next();
        await db.$executeRaw`INSERT INTO published_wish (id, wish, "wishId", title) VALUES (${feedId}::uuid, ${w.id}, ${w.id}::uuid, 'For Chidi')`;
        const play = await http().get(`/v1/play-wishes/${feedId}`).set(h);
        const share = await http().post(`/v1/feed/wishes/${feedId}/shares`).set(h).send({ style: "noir", wish: feedId });
        expect([label, play.status]).toEqual([label, want]);
        expect([label, share.status]).toEqual([label, want === 200 ? 201 : 404]);
        if (want === 404) expect(JSON.stringify([play.body, share.body])).not.toMatch(/Happy birthday|\/w\//);
        const anon = await http().get(`/v1/play-wishes/${feedId}`);
        expect(anon.status).toBe(401);
      }
    });
  });

  describe("NN2 reading a link never starts the term", () => {
    it("NN2: 50 GETs, a HEAD and an OPTIONS at and after the open time write no opening and keep the wish sealed", async () => {
      const w = await wish({ opensAt: NOW });
      const sweep = async () => {
        ip = nextIp();
        const gets = await Promise.all(Array.from({ length: 50 }, () => http().get(`/v1/w/${w.slug}`)));
        for (const r of gets) {
          expect(r.status).toBe(200);
          expect(r.body).toMatchObject({ state: "sealed", openable: true });
          expect(r.body.content).toEqual({ opening: { id: "op-1", scene: "curtain" } });
          expect(JSON.stringify(r.body)).not.toMatch(/Happy birthday|url/);
        }
        expect((await http().head(`/v1/w/${w.slug}`)).status).toBeLessThan(400);
        await http().options(`/v1/w/${w.slug}`);
        const r = await row(w.id);
        expect(r.openedAt).toBeNull();
        expect(r.status).toBe("sealed");
        expect(await opens(w.id)).toBe(0);
        expect(await db.wishTransition.count({ where: { wishId: w.id, to: "live" } })).toBe(0);
      };
      await sweep();
      t.clock.advance(2 * 3600 * 1000);
      await sweep();
    });

    it("NN2: openable is false before the time, true once it has passed; a POST before the time is refused and starts nothing", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() + 60000) });
      expect((await http().get(`/v1/w/${w.slug}`)).body).toMatchObject({ state: "countdown", openable: false });
      const early = await open(w.slug);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe("not_open_yet");
      expect(JSON.stringify(early.body)).not.toMatch(/Happy birthday/);
      expect((await row(w.id)).openedAt).toBeNull();
      expect(await opens(w.id)).toBe(0);
      t.clock.advance(60000);
      expect((await http().get(`/v1/w/${w.slug}`)).body).toMatchObject({ openable: true });
    });

    it("NN2: 20 POSTs at once: one first opening, one transition, endsAt is openedAt plus the term; a GET after it is the full view", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000) });
      const rs = await Promise.all(Array.from({ length: 20 }, () => open(w.slug)));
      expect(rs.filter((r) => r.status !== 200 || r.body.state !== "open").map((r) => `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)).toEqual([]);
      expect(rs.every((r) => r.body.content.letter.paras[0] === "Happy birthday.")).toBe(true);
      const firsts = Number((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM wish_open WHERE "wishId" = ${w.id}::uuid AND first`)[0].n);
      expect(firsts).toBe(1);
      expect(await opens(w.id)).toBe(20);
      expect(await db.wishTransition.count({ where: { wishId: w.id, to: "live" } })).toBe(1);
      const r = await row(w.id);
      expect(r.status).toBe("live");
      expect(r.openedAt?.toISOString()).toBe(NOW.toISOString());
      expect(r.endsAt?.toISOString()).toBe(new Date(NOW.getTime() + 7 * DAY).toISOString());
      expect(new Set(rs.map((x) => (x.body as { openedAt: string }).openedAt)).size).toBe(1);
      const g = await http().get(`/v1/w/${w.slug}`);
      expect(g.body).toMatchObject({ state: "open", openedAt: NOW.toISOString() });
      expect(g.body.content.letter.paras[0]).toBe("Happy birthday.");
    });

    it("NN2: with a passcode the POST answers the full view only with a good unlock token", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000), passcodeHash: hash("open-sesame") });
      for (const h of [{} as Record<string, string>, { "x-unlock-token": "1.nope" }]) {
        const r = await open(w.slug, h);
        expect(r.status).toBe(409);
        expect(JSON.stringify(r.body)).not.toMatch(/Happy birthday/);
      }
      expect((await row(w.id)).openedAt).toBeNull();
      const tok = (await http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "open-sesame" })).body.token as string;
      const g = await http().get(`/v1/w/${w.slug}`).set({ "x-unlock-token": tok });
      expect(g.body).toMatchObject({ state: "sealed", openable: true });
      expect((await row(w.id)).openedAt).toBeNull();
      const ok = await open(w.slug, { "x-unlock-token": tok });
      expect(ok.status).toBe(200);
      expect(ok.body.content.letter.paras[0]).toBe("Happy birthday.");
      expect((await row(w.id)).openedAt?.toISOString()).toBe(NOW.toISOString());
    });
  });

  describe("NN3 a slug with %00 or a bad escape is 404", () => {
    it("NN3: %00, %, %ZZ, an overlong escape and a control escape are 404 in the envelope on every route", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000) });
      for (const bad of [`${w.slug}%00`, "%00", "%", "%ZZ", "a%2", "%E0%A4%A", `${w.slug}%0A`, `%1F${w.slug}`]) {
        for (const [method, suffix] of [["get", ""], ["post", "/opens"], ["post", "/unlock"]] as const) {
          const r = await http()[method](`/v1/w/${bad}${suffix}`).send({});
          expect([bad, suffix, r.status]).toEqual([bad, suffix, 404]);
          expect(r.body.error.code).toBeDefined();
        }
      }
      expect((await row(w.id)).openedAt).toBeNull();
    });
  });

  describe("NN4 limit keys and the fallback session are HMACs with a server secret", () => {
    it("NN4: no stored key is a bare hash of the address, and each is the HMAC of it", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000) });
      const addr = "203.0.113.77";
      const xff = { "x-forwarded-for": addr, "user-agent": "nn4-agent" };
      expect((await open(w.slug, xff)).status).toBe(200);
      expect((await http().post(`/v1/w/${w.slug}/reaction`).set(xff).send({ reaction: "Yes.", wishId: w.id })).status).toBe(200);
      const key = (...parts: string[]) => {
        const k = createHmac("sha256", SECRET).update("link-key").digest();
        return createHmac("sha256", k).update(parts.join("|")).digest("hex").slice(0, 32);
      };
      const bare = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
      expect(t.app.get(LinkLimits).keyOf(addr)).toBe(key(addr));
      expect(key(addr)).not.toBe(bare(addr));
      // the other spec clears link_hit now and then, so what is there is only ever checked for the absence of a bare hash
      const keys = (await db.$queryRaw<{ key: string }[]>`SELECT DISTINCT key FROM link_hit`).map((r) => r.key);
      expect(keys).not.toContain(bare(addr));
      const sessions = (await db.$queryRaw<{ session: string }[]>`SELECT session FROM wish_reaction WHERE "wishId" = ${w.id}::uuid`).map((r) => r.session);
      expect(sessions).toEqual([`h:${key(w.id, addr, "nn4-agent")}`]);
      expect(sessions[0]).not.toBe(`h:${bare(w.id, addr, "nn4-agent")}`);
      const opens2 = await db.$queryRaw<{ session: string }[]>`SELECT session FROM wish_open WHERE "wishId" = ${w.id}::uuid`;
      expect(JSON.stringify(opens2)).not.toContain(addr);
    });
  });

  describe("NN5 a reaction with a hidden character is 422", () => {
    it("NN5: direction override, zero-width, joiner, BOM and separators are refused; plain text and an accent pass", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000) });
      await open(w.slug);
      const post = (reaction: string) => http().post(`/v1/w/${w.slug}/reaction`).send({ reaction, wishId: w.id });
      for (const bad of ["Yes‮.", "a​b", "a‍b", "﻿hi", "x⁦y", "x‎y", "a b", "a­b", "‪hi"]) {
        const r = await post(bad);
        expect([JSON.stringify(bad), r.status]).toEqual([JSON.stringify(bad), 422]);
      }
      expect(Number((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM wish_reaction WHERE "wishId" = ${w.id}::uuid`)[0].n)).toBe(0);
      expect((await post("Café, merci.")).status).toBe(200);
    });

    it("NN7: a joiner inside an emoji sequence passes; a joiner with no emoji, an override and a zero-width space stay 422", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000) });
      await open(w.slug);
      const post = (reaction: string) => http().post(`/v1/w/${w.slug}/reaction`).send({ reaction, wishId: w.id });
      const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
      expect((await post(family)).status).toBe(200);
      expect((await post("\u{1F3F3}\uFE0F\u200D\u{1F308}")).status).toBe(200);
      expect((await post("\u{1F469}\u{1F3FD}\u200D\u{1F4BB}")).status).toBe(200);
      for (const bad of ["a\u200Db", "\u200D\u{1F600}", "\u{1F600}\u200D", `${family}\u200B`, `${family}\u202E`, "\u{1F600}\u200D\u200D\u{1F600}"]) {
        expect([JSON.stringify(bad), (await post(bad)).status]).toEqual([JSON.stringify(bad), 422]);
      }
    });
  });

  describe("proofs that stay", () => {
    it("nothing of the wish before its time by any header, query, token or route", async () => {
      const w = await wish({ passcodeHash: hash("abcd"), opensAt: new Date(NOW.getTime() + DAY) });
      const tok = (await http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "abcd" }));
      expect(tok.status).toBe(409);
      const forged = "9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const rs = [
        await http().get(`/v1/w/${w.slug}`).set({ "x-unlock-token": forged, "x-forwarded-for": "198.51.100.9", "x-wish-session": "session-aaaaaaaa", date: "2099-01-01", "x-now": "2099-01-01" }),
        await http().get(`/v1/w/${w.slug}?now=2099-01-01T00:00:00Z&openedAt=1&token=${forged}&opensAt=2000-01-01`),
        await open(w.slug, { "x-unlock-token": forged }),
        await http().post(`/v1/w/${w.slug}/reaction`).send({ reaction: "Yes.", wishId: w.id }),
        await http().post(`/v1/w/${w.slug}/favourites`).send({ hearts: [1], no: "x" }),
      ];
      for (const r of rs) expect(JSON.stringify(r.body)).not.toMatch(/Happy birthday|url|letter/);
      expect(rs[0].body).toMatchObject({ state: "countdown", openable: false });
      expect(rs.slice(2).map((r) => r.status)).toEqual([409, 409, 409]);
      expect((await row(w.id)).openedAt).toBeNull();
      expect(await opens(w.id)).toBe(0);
    });

    // API-BASE-6 (HS2): after the end the read and the unlock answer "resting" (200, no content) so the link holder can wake it; opens and reaction stay 410
    it("after the end: the read says resting with no content; opens and reaction are 410", async () => {
      const w = await wish({ status: "live", opensAt: new Date(NOW.getTime() - 9 * DAY), openedAt: new Date(NOW.getTime() - 8 * DAY), endsAt: new Date(NOW.getTime() - 1000) });
      const rs = [
        await http().get(`/v1/w/${w.slug}`),
        await open(w.slug),
        await http().post(`/v1/w/${w.slug}/unlock`).send({ passcode: "x" }),
        await http().post(`/v1/w/${w.slug}/reaction`).send({ reaction: "Yes.", wishId: w.id }),
      ];
      expect(rs.map((r) => r.status)).toEqual([200, 410, 200, 410]);
      expect(rs[0].body.state).toBe("resting");
      // the resting view carries the link's public facts (kind, style, the receiver's name) like the counting view, and no content
      expect(rs[0].body.content ?? null).toBeNull();
      expect(JSON.stringify(rs[0].body)).not.toMatch(/Happy|birthday\.$/);
      for (const r of rs.slice(1)) expect(JSON.stringify(r.body)).not.toMatch(/Chidi|Happy|noir|love|birthday\./);
    });

    it("the passcode lock: 40 addresses at once with the right code inside: at most 30 checked, the rest locked", async () => {
      const w = await wish({ opensAt: new Date(NOW.getTime() - 1000), passcodeHash: hash("right-code") });
      const rs = await Promise.all(
        Array.from({ length: 40 }, (_, i) => http().post(`/v1/w/${w.slug}/unlock`).set({ "x-forwarded-for": `192.0.2.${i + 1}` }).send({ passcode: i === 20 ? "right-code" : `wrong-${i}` })),
      );
      const checked = rs.filter((r) => r.status === 200).length;
      const locked = rs.filter((r) => r.status === 429);
      expect(checked).toBeLessThanOrEqual(30);
      expect(checked + locked.length).toBe(40);
      expect(locked.length).toBeGreaterThanOrEqual(10);
      expect(locked.every((r) => Number(r.headers["retry-after"]) > 0)).toBe(true);
      const link = await db.wishLink.findUniqueOrThrow({ where: { id: w.linkId } });
      expect(link.lockedUntil).not.toBeNull();
    });

    it("no sender data in any response, in any state", async () => {
      const email = "sender-secret@example.test";
      await db.account.update({ where: { id: owner }, data: { email } as never }).catch(() => undefined);
      const states = [{ opensAt: new Date(NOW.getTime() + DAY) }, { opensAt: new Date(NOW.getTime() - 1000) }, { opensAt: new Date(NOW.getTime() - 1000), passcodeHash: hash("abcd") }];
      for (const over of states) {
        const w = await wish(over);
        const bodies = JSON.stringify([(await http().get(`/v1/w/${w.slug}`)).body, (await open(w.slug)).body, (await http().get(`/v1/w/${w.slug}`)).body]);
        expect(bodies).not.toContain(owner);
        expect(bodies).not.toContain(email);
        expect(bodies).not.toMatch(/accountId|"email"|phone|scrypt|passcodeHash|erasedAt/i);
      }
    });
  });
});
