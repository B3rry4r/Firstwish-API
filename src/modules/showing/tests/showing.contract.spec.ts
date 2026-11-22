import { PrismaService } from "../../../common/db/prisma.service";
import { ShowingService } from "../showing.service";
import { WishLifecycleService } from "../../wishes/wish-lifecycle.service";
import { account, B12App, b13App, bearer, liveWish, staffOf } from "./b13-kit";

describe("Now showing: requests, the public list, unlist, wish of the day (B13)", () => {
  let t: B12App;
  let db: PrismaService;
  let mod: { id: string; token: string };
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
    mod = await staffOf(t, "moderator");
  });
  afterAll(() => t.close());

  const ask = (token: string, id: string, body: object = { consent: true }) => t.http().post(`/v1/wishes/${id}/publish-requests`).set(bearer(token)).send(body);
  const decide = (reqId: string, body: object, token = mod.token) => t.http().post(`/v1/admin/showing/requests/${reqId}/decide`).set(bearer(token)).send(body);
  const waiting = async (wishId: string) => (await db.publishRequest.findFirstOrThrow({ where: { wishId, status: "waiting" } })).id;
  const publicIds = async (): Promise<string[]> => {
    const out: string[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get(`/v1/showing?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
      expect(r.status).toBe(200);
      out.push(...(r.body.items as { wish: string }[]).map((i) => i.wish));
      cursor = r.body.nextCursor as string | null;
    } while (cursor);
    return out;
  };
  async function listed(over: Parameters<typeof liveWish>[2] = {}) {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner, over);
    expect((await ask(owner.token, w.id)).status).toBe(201);
    expect((await decide(await waiting(w.id), { decision: "approve", reason: "Looks lovely" })).status).toBe(200);
    return { owner, w };
  }

  it("case 1: an ask waits for review and nothing is public until a person approves; a second ask is 409", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    const r = await ask(owner.token, w.id, { consent: true, level: "now-showing", publicChapters: ["letter"], everyoneAgrees: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: w.id, publish: { status: "waiting", listed: false } });
    expect(await publicIds()).not.toContain(w.id);
    expect((await ask(owner.token, w.id)).status).toBe(409);
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id } });
    expect(req).toMatchObject({ status: "waiting", level: "now_showing", publicChapters: ["letter"], screening: "pass" });
    const staffList = await t.http().get("/v1/admin/showing").set(bearer(mod.token));
    expect((staffList.body.items as { id: string; scope: string }[]).find((i) => i.id === req.id)).toMatchObject({ scope: "waiting" });
  });

  it("the same ask sent at once makes one request", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    const all = await Promise.all(Array.from({ length: 5 }, () => ask(owner.token, w.id)));
    expect(all.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await db.publishRequest.count({ where: { wishId: w.id } })).toBe(1);
  });

  it("only a live wish of the owner's: another account's wish is 404, a draft or a resting wish 409, no consent 422, no token 401, staff 403", async () => {
    const owner = await account(t, ["creator"]);
    const other = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    expect((await ask(other.token, w.id)).status).toBe(404);
    expect((await ask(owner.token, (await liveWish(t, owner, { status: "draft" })).id)).status).toBe(409);
    expect((await ask(owner.token, (await liveWish(t, owner, { status: "resting" })).id)).status).toBe(409);
    expect((await ask(owner.token, (await liveWish(t, owner, { passcodeHash: "x" })).id)).status).toBe(409);
    const bad = await ask(owner.token, w.id, { consent: false });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toHaveProperty("consent");
    expect((await ask(owner.token, w.id, { consent: true, publicChapters: ["nonsense"] })).body.error.fields).toHaveProperty("publicChapters");
    expect((await ask(owner.token, "nope")).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await t.http().post(`/v1/wishes/${w.id}/publish-requests`).send({ consent: true })).status).toBe(401);
    expect((await ask(mod.token, w.id)).status).toBe(403);
    expect(await db.publishRequest.count({ where: { wishId: w.id } })).toBe(0);
  });

  it("an erased account's wish is refused (401), a banned account's ask is 403", async () => {
    const gone = await account(t, ["creator"]);
    const gw = await liveWish(t, gone);
    await db.account.update({ where: { id: gone.accountId }, data: { erasedAt: t.clock.now() } });
    expect((await ask(gone.token, gw.id)).status).toBe(401);
    const banned = await account(t, ["creator"]);
    const bw = await liveWish(t, banned);
    await db.ban.create({ data: { id: t.id(), accountId: banned.accountId, scope: "publishing", reason: "test", by: "system" } });
    expect((await ask(banned.token, bw.id)).status).toBe(403);
  });

  it("approve lists the wish: a row with nothing private, one audit row with the reason, public list shows it", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    await ask(owner.token, w.id);
    const reqId = await waiting(w.id);
    expect((await decide(reqId, { decision: "approve", reason: "no" })).status).toBe(422);
    const ok = await decide(reqId, { decision: "approve", reason: "  Looks lovely  " });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: reqId, status: "approved", decision: "approve", reason: "Looks lovely", wishId: w.id });
    const audit = await db.auditEntry.findMany({ where: { subjectId: reqId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "showing.approve", section: "/admin/showing", reason: "Looks lovely" });
    const rows = (await t.http().get("/v1/showing?limit=50")).body.items as { wish: string }[];
    const row = rows.find((i) => i.wish === w.id);
    expect(row).toMatchObject({ forName: "Ada", href: `/w/${w.slug}`, no: w.no, scope: "public", kind: "birthday" });
    const text = JSON.stringify(row);
    for (const secret of [owner.accountId, owner.email, "private words", "passcode"]) expect(text).not.toContain(secret);
    expect((await ask(owner.token, w.id)).status).toBe(409);
    expect((await decide(reqId, { decision: "decline", reason: "second thoughts" })).status).toBe(409);
  });

  it("two staff deciding at once: one decision, one audit row, one listing", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    await ask(owner.token, w.id);
    const reqId = await waiting(w.id);
    const other = await staffOf(t, "ops");
    const [a, b] = await Promise.all([decide(reqId, { decision: "approve", reason: "first one" }), decide(reqId, { decision: "decline", reason: "second one" }, other.token)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.auditEntry.count({ where: { subjectId: reqId } })).toBe(1);
    expect(await db.publishedWish.count({ where: { wishId: w.id } })).toBe(a.body.decision === "approve" || b.body.decision === "approve" ? 1 : 0);
  });

  it("decline leaves a reason the owner can read; the owner may ask again", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    await ask(owner.token, w.id);
    const d = await decide(await waiting(w.id), { decision: "decline", reason: "Photo is too dark" });
    expect(d.body).toMatchObject({ status: "refused", decision: "decline", reason: "Photo is too dark" });
    expect(await publicIds()).not.toContain(w.id);
    expect((await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id } })).status).toBe("refused");
    const del = await t.http().delete(`/v1/wishes/${w.id}/publish-requests`).set(bearer(owner.token)).send({ isPublic: false });
    expect(del.status).toBe(200);
    expect(del.body.publish).toBeNull();
    expect((await ask(owner.token, w.id)).status).toBe(201);
  });

  it("staff routes: owner, ops and moderator pass; support, a user and no token do not", async () => {
    const support = await staffOf(t, "support");
    const ops = await staffOf(t, "ops");
    const user = await account(t, ["creator"]);
    expect((await t.http().get("/v1/admin/showing").set(bearer(ops.token))).status).toBe(200);
    expect((await t.http().get("/v1/admin/showing").set(bearer(support.token))).status).toBe(403);
    expect((await t.http().get("/v1/admin/showing").set(bearer(user.token))).status).toBe(403);
    expect((await t.http().get("/v1/admin/showing")).status).toBe(401);
    expect((await t.http().post(`/v1/admin/showing/requests/${t.id()}/decide`).set(bearer(user.token)).send({ decision: "approve", reason: "fine fine" })).status).toBe(403);
    expect((await decide(t.id(), { decision: "approve", reason: "fine fine" })).status).toBe(404);
    expect((await decide("nope", { decision: "approve", reason: "fine fine" })).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await decide(t.id(), { decision: "maybe", reason: "fine fine" })).status).toBe(422);
  });

  it("case 2: a wish that rests, is taken down or removed, or whose owner is erased or banned, leaves the list at once", async () => {
    const a = await listed();
    const b = await listed();
    const c = await listed();
    const d = await listed();
    const e = await listed();
    const all = await publicIds();
    for (const x of [a, b, c, d, e]) expect(all).toContain(x.w.id);
    await db.wish.update({ where: { id: a.w.id }, data: { status: "resting" } });
    await t.app.get(WishLifecycleService).takeDown(b.w.id, "test");
    await db.wish.update({ where: { id: c.w.id }, data: { status: "removed", removedAt: t.clock.now() } });
    await db.account.update({ where: { id: d.owner.accountId }, data: { erasedAt: t.clock.now() } });
    await db.ban.create({ data: { id: t.id(), accountId: e.owner.accountId, scope: "account", reason: "test", by: "system" } });
    const after = await publicIds();
    for (const x of [a, b, c, d, e]) expect(after).not.toContain(x.w.id);
  });

  it("the public list is public, paged by cursor, newest first", async () => {
    await listed();
    await listed();
    const p1 = await t.http().get("/v1/showing?limit=1");
    expect(p1.status).toBe(200);
    expect(p1.body.items).toHaveLength(1);
    expect(p1.body.nextCursor).not.toBeNull();
    const p2 = await t.http().get(`/v1/showing?limit=1&cursor=${p1.body.nextCursor as string}`);
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
    expect((await t.http().get("/v1/showing?cursor=zzz")).status).toBe(422);
    expect((await t.http().get("/v1/showing?limit=500")).status).toBe(422);
  });

  it("case 3: staff unlist and the owner's own unpublish remove it at once and forget its saves", async () => {
    const x = await listed();
    const y = await listed();
    const saver = await account(t, ["creator"]);
    const feedX = (await db.publishedWish.findFirstOrThrow({ where: { wishId: x.w.id } })).id;
    const feedY = (await db.publishedWish.findFirstOrThrow({ where: { wishId: y.w.id } })).id;
    for (const f of [feedX, feedY]) await t.http().put(`/v1/feed/wishes/${f}/save`).set(bearer(saver.token)).send({ wish: f });
    expect(await db.savedWish.count({ where: { wish: { in: [feedX, feedY] } } })).toBe(2);
    const un = await t.http().post(`/v1/admin/showing/listed/${x.w.no}/unlist`).set(bearer(mod.token)).send({ reason: "Not suitable" });
    expect(un.status).toBe(200);
    expect((un.body.items as { no: string }[]).map((i) => i.no)).not.toContain(x.w.no);
    expect(await db.auditEntry.count({ where: { subjectType: "PublishedWish", action: "showing.unlist" } })).toBeGreaterThan(0);
    expect(await publicIds()).not.toContain(x.w.id);
    expect(await db.savedWish.count({ where: { wish: feedX } })).toBe(0);
    expect((await t.http().post(`/v1/admin/showing/listed/${x.w.no}/unlist`).set(bearer(mod.token)).send({ reason: "Not suitable" })).status).toBe(404);
    expect((await t.http().post(`/v1/admin/showing/listed/${y.w.no}/unlist`).set(bearer(mod.token)).send({ reason: "no" })).status).toBe(422);
    const own = await t.http().delete(`/v1/wishes/${y.w.id}/publish-requests`).set(bearer(y.owner.token)).send({ isPublic: false });
    expect(own.status).toBe(200);
    expect(await publicIds()).not.toContain(y.w.id);
    expect(await db.savedWish.count({ where: { wish: feedY } })).toBe(0);
    expect((await t.http().delete(`/v1/wishes/${y.w.id}/publish-requests`).set(bearer((await account(t, ["creator"])).token)).send({})).status).toBe(404);
  });

  it("case 4: one pick per Lagos date, a date picked twice is replaced, a wish that leaves the list loses its picks", async () => {
    const x = await listed();
    const y = await listed();
    const put = (date: string, wish: string, reason = "A lovely one") => t.http().put(`/v1/admin/showing/day/${date}`).set(bearer(mod.token)).send({ wish, reason });
    const first = await put("2027-01-10", x.w.no);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ date: "2027-01-10", wish: x.w.no, reason: "A lovely one" });
    expect((await put("2027-01-10", y.w.no)).status).toBe(200);
    expect(await db.dayPick.count({ where: { date: new Date("2027-01-10T00:00:00Z") } })).toBe(1);
    expect((await db.dayPick.findFirstOrThrow({ where: { date: new Date("2027-01-10T00:00:00Z") } })).wish).toBe(y.w.no);
    const today = (await t.http().get("/v1/showing?limit=50")).body.items as { no: string; featured: boolean }[];
    expect(today.find((i) => i.no === y.w.no)?.featured).toBe(true);
    expect(today.find((i) => i.no === x.w.no)?.featured).toBe(false);
    expect((await put("2027-01-12", y.w.no)).status).toBe(200);
    expect((await put("2027-01-09", y.w.no)).status).toBe(409);
    expect((await put("2027-01-16", y.w.no)).status).toBe(200);
    expect((await put("2027-01-17", y.w.no)).status).toBe(409);
    expect((await put("2027-02-30", y.w.no)).status).toBe(422);
    expect((await put("2027-01-11", "no-such-no")).status).toBe(409);
    expect((await put("2027-01-11", y.w.no, "no")).status).toBe(422);
    expect((await t.http().put("/v1/admin/showing/day/2027-01-11").set(bearer((await account(t)).token)).send({ wish: y.w.no, reason: "fine fine" })).status).toBe(403);
    await t.http().post(`/v1/admin/showing/listed/${y.w.no}/unlist`).set(bearer(mod.token)).send({ reason: "Taken off" });
    expect(await db.dayPick.count({ where: { wish: y.w.no } })).toBe(0);
    expect((await put("2027-01-11", y.w.no)).status).toBe(409);
  });

  it("SS1: dropForWishes and dropForAccount leave no row for those wishes; listing again needs a new ask and approval", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner, { name: "Zainab" });
    const w2 = await liveWish(t, owner, { name: "Tolu" });
    for (const x of [w, w2]) {
      await ask(owner.token, x.id);
      expect((await decide(await waiting(x.id), { decision: "approve", reason: "looks fine" })).status).toBe(200);
    }
    const svc = t.app.get(ShowingService);
    const left = async (ids: string[]) => (await db.publishedWish.count({ where: { wishId: { in: ids } } })) + (await db.publishRequest.count({ where: { wishId: { in: ids } } }));
    expect(await left([w.id, w2.id])).toBe(4);
    await db.$transaction((tx) => svc.dropForWishes(tx, [w.id]));
    expect(await left([w.id])).toBe(0);
    expect(await publicIds()).not.toContain(w.id);
    expect(await publicIds()).toContain(w2.id);
    expect((await ask(owner.token, w.id)).status).toBe(201);
    expect(await db.publishedWish.count({ where: { wishId: w.id } })).toBe(0);
    expect((await decide(await waiting(w.id), { decision: "approve", reason: "looks fine" })).status).toBe(200);
    expect(await publicIds()).toContain(w.id);
    await db.$transaction((tx) => svc.dropForAccount(tx, owner.accountId));
    expect(await left([w.id, w2.id])).toBe(0);
    expect(await db.publishedWish.count({ where: { OR: [{ title: { contains: "Zainab" } }, { title: { contains: "Tolu" } }] } })).toBe(0);
  });

  it("SS2: E-136 and E-137 need the creator side; a person-only or business-only account gets 403 creator_side_required, a creator is unchanged", async () => {
    const creator = await account(t, ["creator"]);
    const w = await liveWish(t, creator);
    for (const sides of [["person"], ["business"]] as const) {
      const who = await account(t, [...sides]);
      const own = await liveWish(t, who);
      const post = await ask(who.token, own.id);
      expect(post.status).toBe(403);
      expect(post.body.error.code).toBe("creator_side_required");
      const del = await t.http().delete(`/v1/wishes/${own.id}/publish-requests`).set(bearer(who.token)).send({});
      expect(del.status).toBe(403);
      expect(del.body.error.code).toBe("creator_side_required");
      expect(await db.publishRequest.count({ where: { wishId: own.id } })).toBe(0);
    }
    expect((await ask(creator.token, w.id)).status).toBe(201);
    expect((await t.http().delete(`/v1/wishes/${w.id}/publish-requests`).set(bearer(creator.token)).send({})).status).toBe(200);
  });
});
