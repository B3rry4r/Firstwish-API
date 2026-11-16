import { PrismaService } from "../../common/db/prisma.service";
import type { TestApp } from "../../../test/kit/app";
import { filesApp, ids, makeAccount, WEBM } from "../stored-files/tests/files-kit";
import { MAX_VOICE_NOTES_PER_WISH } from "../stored-files/stored-files.service";

/** API-BASE-6b F3: the owner's own voice is counted apart from the 12 friends may send; a removed login is refused before any body is read. */
describe("owner's own voice and removed logins", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    ({ t, db } = await filesApp());
  });
  afterAll(() => t.close());
  let n = 0;
  const ip = () => `10.7.${(n >> 8) & 255}.${(++n & 255) || 1}`;

  it("the owner can add their own voice when friends' voices fill the 12; the 13th from a friend is still refused", async () => {
    const me = await makeAccount(db, t);
    await db.account.update({ where: { id: me.id }, data: { name: "Ada Obi" } });
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: me.id, status: "draft", ticket: "keepsake", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", name: "Chidi Eze", content: { letter: { paras: ["words"] } } } as never });
    const auth = { authorization: `Bearer ${me.token}` };
    const slug = (await t.http().get(`/v1/wishes/${id}/gather`).set(auth)).body.slug as string;
    const ask = () => t.http().post(`/v1/g/${slug}/voice`).set("x-forwarded-for", ip()).send({ name: "Kemi", contentType: "audio/webm", bytes: 4000, seconds: 12 });
    for (let i = 0; i < MAX_VOICE_NOTES_PER_WISH; i++) {
      const a = await ask();
      expect(a.status).toBe(201);
      const u = new URL(a.body.upload.url as string);
      await t.http().put(`/v1/standin-storage${u.pathname}${u.search}`).set("content-type", "audio/webm").send(WEBM(4000));
      expect((await t.http().post(`/v1/g/${slug}/voice/${a.body.id}/confirm`).set("x-forwarded-for", ip()).send({})).status).toBe(200);
    }
    expect((await ask()).body.error?.code).toBe("voice_notes_full");
    const own = await t.http().post("/v1/uploads").set(auth).send({ purpose: "voice", contentType: "audio/webm", bytes: 4000, seconds: 10, subjectId: id });
    expect(own.status).toBe(201);
  });

  it("a removed login gets login_removed on PATCH /v1/business and GET /v1/ticket-offers, with or without the business named", async () => {
    const owner = await makeAccount(db, t);
    const bid = ids.next();
    await db.business.create({ data: { id: bid, accountId: owner.id, name: "Alpha", business: "Alpha", since: new Date() } });
    const gone = await makeAccount(db, t);
    await db.account.update({ where: { id: gone.id }, data: { sides: ["person", "business"], contact: `gone-${gone.id}@example.com` } });
    t.tokens.set(gone.token, { kind: "user", accountId: gone.id, sides: ["person", "business"] });
    await db.login.create({ data: { id: ids.next(), businessId: bid, contact: `GONE-${gone.id}@EXAMPLE.COM`, status: "removed" } });
    const auth = { authorization: `Bearer ${gone.token}` };
    for (const hdr of [undefined, bid]) {
      const set = (r: ReturnType<ReturnType<TestApp["http"]>["get"]>) => (hdr ? r.set(auth).set("x-business-id", hdr) : r.set(auth));
      const p = await set(t.http().patch("/v1/business") as never).send({});
      const g = await set(t.http().get("/v1/ticket-offers"));
      expect([p.status, p.body.error?.code]).toEqual([403, "login_removed"]);
      expect([g.status, g.body.error?.code]).toEqual([403, "login_removed"]);
    }
  });
});
