import { PrismaService } from "../../common/db/prisma.service";
import type { TestApp } from "../../../test/kit/app";
import { filesApp, makeAccount, WEBM } from "../stored-files/tests/files-kit";
import { MAX_VOICE_NOTES_PER_WISH } from "../stored-files/stored-files.service";
import { GATHER_ASKS_PER_ADDRESS_PER_HOUR, GATHER_ASKS_PER_LINK_PER_DAY } from "../public-wishes/link-limits";
import { uniqueAddress } from "../../../test/kit/app";
import { testWishNo } from "../../../test/kit/unique";
import { ownDatabase } from "../../../test/kit/own-db";

/** API-BASE-6 case 4 (HS1): the gather link, the friend's side with no account and the owner's side. */
describe("HS1 the gather link", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: Awaited<ReturnType<typeof filesApp>>["scored"];
  // The per-address look and ask counts (link_hit) are rows of the whole database, read at each spec's own clock: the spec has its own database.
  const own = ownDatabase("hs1");
  beforeAll(async () => {
    own.use();
    ({ t, db, scored } = await filesApp());
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });

  async function setup(status: "draft" | "sealed" | "live" = "draft", over: Record<string, unknown> = {}) {
    const me = await makeAccount(db, t);
    await db.account.update({ where: { id: me.id }, data: { name: "Ada Obi" } });
    const id = (await import("../stored-files/tests/files-kit")).ids.next();
    await db.wish.create({ data: { id, accountId: me.id, status, ticket: "keepsake", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", name: "Chidi Eze", content: { letter: { paras: ["private words"] } }, ...(status !== "draft" ? { no: testWishNo(), sealedAt: new Date("2026-01-01T00:00:00.000Z"), opensAt: new Date("2099-01-01T00:00:00.000Z") } : {}), ...over } as never });
    const auth = { authorization: `Bearer ${me.token}` };
    const link = await t.http().get(`/v1/wishes/${id}/gather`).set(auth);
    expect(link.status).toBe(200);
    return { me, id, auth, slug: link.body.slug as string, link };
  }
  // Looks and confirms are counted per address too (link_hit, shared by every spec's database rows and read at each spec's own clock), so each call comes from an address of its own.
  const friend = (slug: string) => t.http().get(`/v1/g/${slug}`).set("x-forwarded-for", uniqueAddress());
  const confirm = (slug: string, id: string) => t.http().post(`/v1/g/${slug}/voice/${id}/confirm`).set("x-forwarded-for", uniqueAddress()).send({});
  // HU4: asks are limited per address, so each call is a friend at an address of their own unless a test says otherwise
  const ask = (slug: string, body: Record<string, unknown> = {}, from: string = uniqueAddress()) => t.http().post(`/v1/g/${slug}/voice`).set("x-forwarded-for", from).send({ name: "Kemi", contentType: "audio/webm", bytes: 4000, seconds: 12, ...body });
  async function add(slug: string, body: Record<string, unknown> = {}) {
    const a = await ask(slug, body);
    expect(a.status).toBe(201);
    const u = new URL(a.body.upload.url as string);
    expect((await t.http().put(`/v1/standin-storage${u.pathname}${u.search}`).set("content-type", "audio/webm").send(WEBM(4000))).status).toBe(200);
    const c = await confirm(slug, a.body.id as string);
    return { id: a.body.id as string, confirm: c };
  }

  it("1. a draft's gather link reads (made at the first read) and is the same link each time; it is not the wish's link", async () => {
    const w = await setup("draft");
    expect(w.link.body).toMatchObject({ active: true, open: true, count: 0, limit: MAX_VOICE_NOTES_PER_WISH, voices: [] });
    expect(w.link.body.link).toBe(`/g/${w.slug}`);
    const again = await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth);
    expect(again.body.slug).toBe(w.slug);
    expect(await db.wishLink.count({ where: { wishId: w.id } })).toBe(0);
    expect((await t.http().get(`/v1/w/${w.slug}`)).status).toBe(404);
    // another person: 404
    const other = await makeAccount(db, t);
    expect((await t.http().get(`/v1/wishes/${w.id}/gather`).set({ authorization: `Bearer ${other.token}` })).status).toBe(404);
    expect((await t.http().get(`/v1/wishes/${w.id}/gather`)).status).toBe(401);
  });

  it("2. the friend sees who is asking and for whom (first names) and nothing else of the wish", async () => {
    const w = await setup("draft");
    const r = await friend(w.slug);
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toMatchObject({ from: "Ada", forName: "Chidi", kind: "birthday", occasion: "birthday", open: true, reason: null, count: 0, limit: 12, full: false, maxSeconds: 180 });
    expect(Object.keys(r.body).sort()).toEqual(["count", "forName", "from", "full", "kind", "limit", "maxBytes", "maxSeconds", "occasion", "open", "reason"]);
    expect(JSON.stringify(r.body)).not.toMatch(/private words|Obi|Eze|FW-/);
    expect((await friend("gnotalink12345")).status).toBe(404);
    expect((await friend("not-a-gather-link")).status).toBe(404);
  });

  it("3. a friend adds one voice by the signed put with their name; it is screened; the owner sees it arrive and can remove it", async () => {
    const w = await setup("draft");
    const before = scored.screened.length;
    const v = await add(w.slug, { name: "  Kemi  Ade " });
    expect(v.confirm.status).toBe(200);
    expect(v.confirm.body).toMatchObject({ id: v.id, state: "ready" });
    expect(scored.screened.length).toBe(before + 1);
    const mine = await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth);
    expect(mine.body.count).toBe(1);
    expect(mine.body.voices).toHaveLength(1);
    expect(mine.body.voices[0]).toMatchObject({ id: v.id, from: "Kemi", seconds: 12, state: "ready" });
    expect(mine.body.voices[0].url).toMatch(/^http/);
    expect((await friend(w.slug)).body.count).toBe(1);
    const gone = await t.http().delete(`/v1/wishes/${w.id}/gather/voices/${v.id}`).set(w.auth);
    expect(gone.status).toBe(204);
    const after = await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth);
    expect(after.body).toMatchObject({ count: 0, voices: [] });
    expect(await db.storedFile.count({ where: { id: v.id } })).toBe(0);
    expect((await t.http().delete(`/v1/wishes/${w.id}/gather/voices/${v.id}`).set(w.auth)).status).toBe(404);
  });

  it("4. a screened-out voice is refused with words and not listed; a bad name, type, size or length is 422", async () => {
    const w = await setup("draft");
    scored.next.push(0.9);
    const bad = await add(w.slug);
    expect(bad.confirm.body.state).toBe("refused");
    expect((await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth)).body.voices).toEqual([]);
    expect((await ask(w.slug, { name: "" })).status).toBe(422);
    expect((await ask(w.slug, { name: "x".repeat(41) })).status).toBe(422);
    expect((await ask(w.slug, { contentType: "image/png" })).status).toBe(422);
    expect((await ask(w.slug, { bytes: 11 * 1024 * 1024 })).status).toBe(422);
    expect((await ask(w.slug, { seconds: 181 })).status).toBe(422);
  });

  it("5. the 13th voice that arrives is 409 with words: the friends count against the wish's 12 (HU4: only voices that arrived count)", async () => {
    const w = await setup("draft");
    for (let i = 0; i < MAX_VOICE_NOTES_PER_WISH; i++) expect((await add(w.slug, { name: `F${i}` })).confirm.status).toBe(200);
    const over = await ask(w.slug);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("voice_notes_full");
    const v = await friend(w.slug);
    expect(v.body).toMatchObject({ count: 12, full: true });
    // the owner clears a friend's voice at any count and the room comes back
    const mine = await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth);
    expect(mine.body.count).toBe(12);
    expect((await t.http().delete(`/v1/wishes/${w.id}/gather/voices/${mine.body.voices[0].id}`).set(w.auth)).status).toBe(204);
    expect((await ask(w.slug)).status).toBe(201);
  });

  it("5b. HU4: 12 asks that never upload hold no place, and they lapse; the room is for voices that arrive", async () => {
    const w = await setup("draft");
    const asked: string[] = [];
    for (let i = 0; i < MAX_VOICE_NOTES_PER_WISH + 3; i++) {
      const r = await ask(w.slug, { name: `F${i}` });
      expect(r.status).toBe(201);
      asked.push(r.body.id as string);
    }
    const mine = await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth);
    expect(mine.body).toMatchObject({ count: 0, voices: [] });
    expect((await friend(w.slug)).body).toMatchObject({ count: 0, full: false });
    // a real voice still arrives, and the unconfirmed asks go once their put has lapsed
    expect((await add(w.slug)).confirm.status).toBe(200);
    t.clock.set(new Date(t.clock.now().getTime() + 20 * 60_000));
    await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth);
    expect(await db.wishGatherVoice.count({ where: { id: { in: asked } } })).toBe(0);
    expect(await db.storedFile.count({ where: { id: { in: asked } } })).toBe(0);
  });

  it("5c. HU4: asks are limited per address and per link, with words", async () => {
    const w = await setup("draft");
    const one = uniqueAddress();
    for (let i = 0; i < GATHER_ASKS_PER_ADDRESS_PER_HOUR; i++) expect((await ask(w.slug, {}, one)).status).toBe(201);
    const slow = await ask(w.slug, {}, one);
    expect(slow.status).toBe(429);
    expect(JSON.stringify(slow.body)).toMatch(/Try again in \d+ seconds/);
    // another link is its own: the address limit follows the address, the link limit follows the link
    const w2 = await setup("draft");
    expect((await ask(w2.slug, {}, one)).status).toBe(429);
    const w3 = await setup("draft");
    let made = 0;
    for (; made < GATHER_ASKS_PER_LINK_PER_DAY; made++) if ((await ask(w3.slug)).status !== 201) break;
    expect(made).toBe(GATHER_ASKS_PER_LINK_PER_DAY);
    expect((await ask(w3.slug)).status).toBe(429);
  });

  it("6. a sealed wish that is not open yet still takes voices; once it is open (or live, or removed) the link says so and takes none", async () => {
    const w = await setup("sealed");
    expect((await friend(w.slug)).body.open).toBe(true);
    expect((await add(w.slug)).confirm.status).toBe(200);
    await db.wish.update({ where: { id: w.id }, data: { status: "live", openedAt: new Date("2026-02-01T00:00:00.000Z") } });
    const v = await friend(w.slug);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ open: false, reason: "This wish is no longer taking voices." });
    const r = await ask(w.slug);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("gather_closed");
    await db.wish.update({ where: { id: w.id }, data: { status: "removed", removedAt: new Date("2026-02-02T00:00:00.000Z") } });
    expect((await friend(w.slug)).status).toBe(404);
  });

  it("7. the owner turns the link off: a friend's visit says so and adds nothing; turning it off again is 409; the voices already there stay", async () => {
    const w = await setup("draft");
    const first = await add(w.slug);
    const off = await t.http().post(`/v1/wishes/${w.id}/gather/off`).set(w.auth).send({});
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ active: false, open: false, count: 1 });
    expect((await friend(w.slug)).body).toMatchObject({ open: false, reason: "The person who asked has turned this link off." });
    const r = await ask(w.slug);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("gather_off");
    expect((await confirm(w.slug, first.id)).status).toBe(409);
    expect((await t.http().post(`/v1/wishes/${w.id}/gather/off`).set(w.auth).send({})).status).toBe(409);
    expect((await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth)).body.voices).toHaveLength(1);
  });

  it("8. another wish's voice cannot be confirmed or removed through the wrong link or by another person", async () => {
    const a = await setup("draft");
    const b = await setup("draft");
    const v = await ask(a.slug);
    expect((await confirm(b.slug, v.body.id as string)).status).toBe(404);
    expect((await t.http().delete(`/v1/wishes/${b.id}/gather/voices/${v.body.id}`).set(b.auth)).status).toBe(404);
    expect((await t.http().delete(`/v1/wishes/${a.id}/gather/voices/${v.body.id}`).set(b.auth)).status).toBe(404);
  });
});
