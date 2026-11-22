import { PrismaService } from "../../common/db/prisma.service";
import type { TestApp } from "../../../test/kit/app";
import { uniqueAddress } from "../../../test/kit/app";
import { ownDatabase } from "../../../test/kit/own-db";
import { testWishNo } from "../../../test/kit/unique";
import { filesApp, ids, makeAccount, WEBM } from "../stored-files/tests/files-kit";
import { MAX_VOICE_NOTES_PER_WISH } from "../stored-files/stored-files.service";

/** API-BASE-11B case 2 (IF5): the owner turns the friends' link back on: the same link, the voices kept, the limits as before. */
describe("IF5 POST /v1/wishes/:id/gather/on", () => {
  let t: TestApp;
  let db: PrismaService;
  // the per-address and per-link counts (link_hit) are rows of the whole database
  const own = ownDatabase("if5");
  beforeAll(async () => {
    own.use();
    ({ t, db } = await filesApp());
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });

  async function setup(status: "draft" | "sealed" | "live" = "draft", over: Record<string, unknown> = {}) {
    const me = await makeAccount(db, t);
    const id = ids.next();
    await db.wish.create({
      data: { id, accountId: me.id, status, ticket: "keepsake", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", name: "Chidi Eze", content: {}, ...(status !== "draft" ? { no: testWishNo(), sealedAt: new Date("2026-01-01T00:00:00.000Z"), opensAt: new Date("2099-01-01T00:00:00.000Z") } : {}), ...over } as never,
    });
    const auth = { authorization: `Bearer ${me.token}` };
    const link = await t.http().get(`/v1/wishes/${id}/gather`).set(auth);
    return { me, id, auth, slug: link.body.slug as string };
  }
  const on = (w: { id: string; auth: Record<string, string> }) => t.http().post(`/v1/wishes/${w.id}/gather/on`).set(w.auth).send({});
  const off = (w: { id: string; auth: Record<string, string> }) => t.http().post(`/v1/wishes/${w.id}/gather/off`).set(w.auth).send({});
  const friend = (slug: string) => t.http().get(`/v1/g/${slug}`).set("x-forwarded-for", uniqueAddress());
  const ask = (slug: string, body: Record<string, unknown> = {}) => t.http().post(`/v1/g/${slug}/voice`).set("x-forwarded-for", uniqueAddress()).send({ name: "Kemi", contentType: "audio/webm", bytes: 4000, seconds: 12, ...body });
  async function add(slug: string, body: Record<string, unknown> = {}) {
    const a = await ask(slug, body);
    expect(a.status).toBe(201);
    const u = new URL(a.body.upload.url as string);
    expect((await t.http().put(`/v1/standin-storage${u.pathname}${u.search}`).set("content-type", "audio/webm").send(WEBM(4000))).status).toBe(200);
    expect((await t.http().post(`/v1/g/${slug}/voice/${a.body.id}/confirm`).set("x-forwarded-for", uniqueAddress()).send({})).status).toBe(200);
    return a.body.id as string;
  }

  it("2a. off then on: the same link works again, the voices already given stay, and a friend can add one more", async () => {
    const w = await setup("draft");
    const first = await add(w.slug, { name: "Kemi" });
    expect((await off(w)).body).toMatchObject({ active: false, open: false, count: 1 });
    expect((await friend(w.slug)).body).toMatchObject({ open: false, reason: "The person who asked has turned this link off." });
    expect((await ask(w.slug)).status).toBe(409);
    const back = await on(w);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ slug: w.slug, link: `/g/${w.slug}`, active: true, open: true, count: 1, limit: MAX_VOICE_NOTES_PER_WISH });
    expect((back.body.voices as { id: string }[]).map((v) => v.id)).toEqual([first]);
    expect((await friend(w.slug)).body).toMatchObject({ open: true, reason: null, count: 1 });
    await add(w.slug, { name: "Tobi" });
    expect(((await t.http().get(`/v1/wishes/${w.id}/gather`).set(w.auth)).body as { count: number }).count).toBe(2);
    expect(await db.wishGather.count({ where: { wishId: w.id } })).toBe(1); // never a second link
  });

  it("2b. on twice changes nothing and answers the same; on for a link that was never off is the same; off after on works as before", async () => {
    const w = await setup("sealed");
    const never = await on(w);
    expect(never.status).toBe(200);
    expect(never.body.active).toBe(true);
    await off(w);
    const row = await db.wishGather.findUniqueOrThrow({ where: { wishId: w.id } });
    const a = await on(w);
    const b = await on(w);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    const after = await db.wishGather.findUniqueOrThrow({ where: { wishId: w.id } });
    expect(after).toMatchObject({ id: row.id, slug: row.slug, active: true });
    expect((await off(w)).status).toBe(200);
    expect((await off(w)).status).toBe(409); // off twice is refused as it always was
  });

  it("2c. the wish's 12 and the limits of asking are as before after a turn on", async () => {
    const w = await setup("draft");
    await off(w);
    await on(w);
    for (let i = 0; i < MAX_VOICE_NOTES_PER_WISH; i++) await add(w.slug, { name: `F${i}` });
    const over = await ask(w.slug);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("voice_notes_full");
    expect((await friend(w.slug)).body).toMatchObject({ count: 12, full: true });
  });

  it("2d. a wish that was opened: the link can be turned on (off's rules allow it) but takes no voice, and says so", async () => {
    const w = await setup("live", { openedAt: new Date("2026-01-02T00:00:00.000Z"), opensAt: new Date("2026-01-01T00:00:00.000Z"), endsAt: new Date("2099-01-01T00:00:00.000Z") });
    await off(w);
    const back = await on(w);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ active: true, open: false });
    expect((await friend(w.slug)).body).toMatchObject({ open: false, reason: "This wish is no longer taking voices." });
    expect((await ask(w.slug)).status).toBe(409);
  });

  it("2e. owner only: another person and a visitor cannot; a wish that is not a wish is 404; a removed wish has no link to turn on", async () => {
    const w = await setup("draft");
    await off(w);
    const other = await makeAccount(db, t);
    expect((await t.http().post(`/v1/wishes/${w.id}/gather/on`).set({ authorization: `Bearer ${other.token}` }).send({})).status).toBe(404);
    expect((await t.http().post(`/v1/wishes/${w.id}/gather/on`).send({})).status).toBe(401);
    expect((await t.http().post(`/v1/wishes/not-an-id/gather/on`).set(w.auth).send({})).status).toBe(404);
    expect((await t.http().get(`/v1/g/${w.slug}`).set("x-forwarded-for", uniqueAddress())).body.open).toBe(false); // still off after the refusals
    expect((await t.http().delete(`/v1/wishes/${w.id}`).set(w.auth).send({})).status).toBe(200);
    expect((await on(w)).status).toBe(404);
  });
});
