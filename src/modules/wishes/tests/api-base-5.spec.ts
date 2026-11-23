import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { testWishNo, RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-02-09T09:00:00.000Z");
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** API-BASE-5 (HQ1 the maker's fields, HQ4 the gather link, HQ5 styles by ticket), through the real routes. */
describe("API-BASE-5 wishes (through the real routes)", () => {
  let t: TestApp;
  let db: PrismaService;
  let nid: () => string;
  let seq = 0;
  const run = RUN;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    nid = () => t.app.get(IdGenerator).id();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  async function user() {
    const accountId = nid();
    await db.account.create({ data: { id: accountId, contact: `ab5-${run}-${++seq}@example.com`, sides: ["person"] as never, lastSide: "person" } });
    const token = `tok-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person"] as never });
    return { accountId, token };
  }
  type U = { accountId: string; token: string };
  type W = { id: string; version: number; content: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const start = async (u: U, over: Record<string, unknown> = {}) =>
    (await t.http().post("/v1/wishes").set(bearer(u.token)).send({ from: "Ada", name: "Chidi", studio: "", kind: "love", occasion: "birthday", style: "noir", ...over })).body as W;
  const save = (u: U, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send(body);
  const read = (u: U, id: string) => t.http().get(`/v1/wishes/${id}`).set(bearer(u.token));

  describe("case 2, HQ1: the fields the maker's screens collect", () => {
    const fields = {
      cover: { school: "BSc Architecture", years: "Five years", born: "07 November 2026" },
      letter: { paras: ["Dear you."], line: "Look how far you have come." },
      reasons: [{ title: "Your laugh", note: "It fills a room." }],
      memory: { title: "The shoot", text: "We laughed.", quote: "You were amazing." },
      blessing: { verse: "Peace.", cite: "Ps 1", note: "Said at the table." },
      links: { download: { count: 2, size: "14 MB", files: ["a.jpg", "b.jpg"] } },
    };

    it("saves each field, reads it back as sent, and a save that changes one keeps the rest", async () => {
      const u = await user();
      const w = await start(u);
      const saved = await save(u, w.id, { version: w.version, content: fields });
      expect(saved.status).toBe(200);
      const got = (await read(u, w.id)).body as W;
      expect(got.content).toEqual(fields);
      const again = await save(u, w.id, { version: got.version, content: { ...fields, letter: { paras: ["Dear you."], line: "Changed." } } });
      expect(again.status).toBe(200);
      expect(((await read(u, w.id)).body as W).content.letter.line).toBe("Changed.");
      expect(((await read(u, w.id)).body as W).content.cover).toEqual(fields.cover);
    });

    it("bounds each: too long, not text and an unknown key beside it are 422 naming the field", async () => {
      const u = await user();
      const w = await start(u);
      const bad: [string, Record<string, unknown>][] = [
        ["cover.school", { cover: { school: "x".repeat(121) } }],
        ["cover.years", { cover: { years: "y".repeat(61) } }],
        ["cover.born", { cover: { born: 5 } }],
        ["letter.line", { letter: { paras: ["a"], line: "z".repeat(301) } }],
        ["reasons[0].note", { reasons: [{ title: "t", note: "n".repeat(501) }] }],
        ["memory.quote", { memory: { title: "t", text: "t", quote: "q".repeat(501) } }],
        ["blessing.note", { blessing: { verse: "v", note: "n".repeat(501) } }],
        ["links.download.count", { links: { download: { count: -1, size: "1 MB" } } }],
        ["links.download.size", { links: { download: { count: 1, size: "s".repeat(41) } } }],
        ["links.download.nope", { links: { download: { count: 1, size: "1", nope: 1 } } }],
      ];
      for (const [name, content] of bad) {
        const r = await save(u, w.id, { version: w.version, content });
        expect([name, r.status]).toEqual([name, 422]);
        expect(JSON.stringify(r.body)).toContain(name.replace(/\[0\]/, "[0]"));
      }
      expect(((await read(u, w.id)).body as W).content).toEqual({ cover: { from: "Ada" } }); // nothing of the refused saves was kept
    });

    it("erase blanks them with the rest of the content (the AA2 rule); another person never reads them", async () => {
      const u = await user();
      const other = await user();
      const w = await start(u);
      await save(u, w.id, { version: w.version, content: fields });
      expect((await read(other, w.id)).status).toBe(404);
      expect((await t.http().delete(`/v1/wishes/${w.id}`).set(bearer(u.token)).send({})).status).toBe(200);
      expect((await t.http().post(`/v1/wishes/${w.id}/erase`).set(bearer(u.token))).status).toBe(204);
      const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
      expect(JSON.stringify(row.content ?? null)).not.toMatch(/BSc Architecture|Look how far|It fills a room|You were amazing|Said at the table|14 MB/);
    });

    it("the receiver gets them once the wish is open and not before (the sealed view carries the opening only)", async () => {
      const u = await user();
      const w = await start(u);
      await save(u, w.id, { version: w.version, content: { ...fields, opening: { id: "op-1", scene: "curtain", values: { to: "Chidi" } } } });
      const slug = `ab5-${run}-${seq}`.slice(0, 32);
      await db.wish.update({ where: { id: w.id }, data: { status: "sealed", ticket: "moment", sealedAt: NOW, opensAt: new Date(NOW.getTime() + 3600000), no: testWishNo() } as never });
      await db.wishLink.create({ data: { id: nid(), slug, wishId: w.id, active: true } });
      const sealed = await t.http().get(`/v1/w/${slug}`).set({ "x-forwarded-for": "10.55.1.1" });
      expect(sealed.status).toBe(200);
      expect(JSON.stringify(sealed.body)).not.toMatch(/BSc Architecture|Look how far|You were amazing/);
      await db.wish.update({ where: { id: w.id }, data: { status: "live", openedAt: new Date(NOW.getTime() - 60000), opensAt: new Date(NOW.getTime() - 3600000), endsAt: new Date(NOW.getTime() + 86400000) } });
      const open = await t.http().get(`/v1/w/${slug}`).set({ "x-forwarded-for": "10.55.1.2" });
      expect(open.status).toBe(200);
      expect(open.body.content).toMatchObject({ ...fields });
    });
  });
  describe("case 3, HQ4: the owner (a person, not only a business) reads the link friends use", () => {
    it("the owner of a sealed wish reads {link, slug}; another person gets 404; a draft has no link yet (404); a friend's visit reads the wish's state and cannot add anything", async () => {
      const u = await user();
      const other = await user();
      const w = await start(u);
      const draft = await t.http().get(`/v1/wishes/${w.id}/link`).set(bearer(u.token));
      expect(draft.status).toBe(404);
      const slug = `ab5g-${run}-${seq}`.slice(0, 32);
      await db.wish.update({ where: { id: w.id }, data: { status: "sealed", ticket: "moment", sealedAt: NOW, opensAt: new Date(NOW.getTime() + 3600000), no: testWishNo() } as never });
      await db.wishLink.create({ data: { id: nid(), slug, wishId: w.id, active: true } });
      const mine = await t.http().get(`/v1/wishes/${w.id}/link`).set(bearer(u.token));
      expect(mine.status).toBe(200);
      expect(mine.body).toEqual({ link: `/w/${slug}`, slug });
      expect((await t.http().get(`/v1/wishes/${w.id}/link`).set(bearer(other.token))).status).toBe(404);
      expect((await t.http().get(`/v1/wishes/${w.id}/link`)).status).toBe(401);
      // a friend with the link and no account: reads the state of the wish (no content before it opens); no route lets them write into it
      const friend = await t.http().get(`/v1/w/${slug}`).set({ "x-forwarded-for": "10.56.1.1" });
      expect(friend.status).toBe(200);
      expect(friend.body.state).toBe("countdown");
      for (const [m, path] of [["post", "voices"], ["put", ""], ["patch", ""], ["delete", ""]] as const) {
        const r = await t.http()[m](`/v1/w/${slug}${path ? `/${path}` : ""}`).set({ "x-forwarded-for": "10.56.1.2" }).send({ name: "Ada", text: "Hi" });
        expect([m, r.status]).toEqual([m, 404]);
      }
    });
  });
  describe("case 4, HQ5: styles by ticket", () => {
    const letter = { letter: { paras: ["Happy birthday."] } };
    const ticketed = async (u: U, ticket: string | null, adds: string[] = []) => {
      const w = await start(u);
      if (ticket) await db.wish.update({ where: { id: w.id }, data: { ticket, adds } as never });
      const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
      return { id: w.id, version: row.version };
    };

    it("a draft with no ticket takes any style; with a ticket the PATCH refuses a style above it, with words, and the draft keeps its style", async () => {
      const u = await user();
      const none = await ticketed(u, null);
      expect((await save(u, none.id, { version: none.version, style: "reel" })).status).toBe(200);
      const moment = await ticketed(u, "moment");
      const ok = await save(u, moment.id, { version: moment.version, style: "letter" });
      expect(ok.status).toBe(200);
      const v1 = (await read(u, moment.id)).body as W & { style: string };
      const standard = await save(u, moment.id, { version: v1.version, style: "status" });
      expect(standard.status).toBe(422);
      expect(standard.body.error.fields.style).toMatch(/Standard style\. A Moment ticket takes Starter styles and below/);
      const premium = await save(u, moment.id, { version: v1.version, style: "reel" });
      expect(premium.status).toBe(422);
      expect(premium.body.error.message).toMatch(/Premium style/);
      expect(((await read(u, moment.id)).body as W & { style: string }).style).toBe("letter");
      const keep = await ticketed(u, "keepsake");
      expect((await save(u, keep.id, { version: keep.version, style: "status" })).status).toBe(200);
      const k1 = (await read(u, keep.id)).body as W;
      expect((await save(u, keep.id, { version: k1.version, style: "reel" })).status).toBe(422);
      const extra = await ticketed(u, "keepsake", ["extra.premium-style"]);
      expect((await save(u, extra.id, { version: extra.version, style: "reel" })).status).toBe(200);
      for (const ticket of ["signature", "premiere"]) {
        const w = await ticketed(u, ticket);
        expect((await save(u, w.id, { version: w.version, style: "reel" })).status).toBe(200);
      }
    });

    it("the wish read tells the maker the level the ticket allows and the styles that are on within it", async () => {
      const u = await user();
      const none = (await read(u, (await ticketed(u, null)).id)).body as W & { styleLevel: string | null; allowedStyles: string[] };
      expect(none.styleLevel).toBeNull();
      expect(none.allowedStyles).toEqual(expect.arrayContaining(["noir", "status", "owambe"]));
      const m = await ticketed(u, "moment");
      const moment = (await read(u, m.id)).body as W & { styleLevel: string | null; allowedStyles: string[] };
      expect(moment.styleLevel).toBe("starter");
      expect(moment.allowedStyles).toEqual(expect.arrayContaining(["noir", "letter"]));
      expect(moment.allowedStyles).not.toContain("status");
      expect(moment.allowedStyles).not.toContain("owambe");
      const k = (await read(u, (await ticketed(u, "keepsake")).id)).body as { styleLevel: string; allowedStyles: string[] };
      expect(k.styleLevel).toBe("standard");
      expect(k.allowedStyles).toContain("status");
      expect(k.allowedStyles).not.toContain("owambe");
      const listed = (await t.http().get("/v1/wishes").set(bearer(u.token))).body.items as { id: string; styleLevel: string | null }[];
      expect(listed.find((x) => x.id === m.id)?.styleLevel).toBe("starter");
    });

    it("the seal refuses a style the ticket does not allow, with words, and the draft stays a draft", async () => {
      const u = await user();
      const w = await ticketed(u, null);
      await save(u, w.id, { version: w.version, style: "reel", content: letter });
      await db.wish.update({ where: { id: w.id }, data: { ticket: "moment" } }); // the ticket is chosen after the style (a payment settles later)
      const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
      const sealed = await t.http().post(`/v1/wishes/${w.id}/seal`).set(bearer(u.token)).send({ version: row.version, openNow: true });
      expect(sealed.status).toBe(422);
      expect(sealed.body.error.fields.style).toMatch(/Premium style\. A Moment ticket takes Starter styles/);
      expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("draft");
      const fixed = await save(u, w.id, { version: row.version, style: "noir" });
      expect(fixed.status).toBe(200);
      const again = await t.http().post(`/v1/wishes/${w.id}/seal`).set(bearer(u.token)).send({ version: row.version + 1, openNow: true });
      expect(again.status).toBe(200);
    });
  });
});
