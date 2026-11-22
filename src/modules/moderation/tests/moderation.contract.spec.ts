import { PrismaService } from "../../../common/db/prisma.service";
import { SessionsService } from "../../sessions/sessions.service";
import { account, B12App, b13App, bearer, liveWish, staffOf, uniqueAddress } from "../../showing/tests/b13-kit";
import { BansService } from "../bans.service";
import { ReportsService } from "../reports.service";

describe("Moderation: reports, take-down asks, decisions, bans, queues (B13)", () => {
  let t: B12App;
  let db: PrismaService;
  let mod: { id: string; token: string };
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
    mod = await staffOf(t, "moderator");
  });
  afterAll(() => t.close());

  const report = (slug: string, body: object = {}, ip = uniqueAddress()) =>
    t.http().post("/v1/reports").set("X-Forwarded-For", ip).send({ slug, reason: "abuse", ...body });
  const decide = (id: string, body: object, token = mod.token) => t.http().post(`/v1/admin/moderation/${id}/decide`).set(bearer(token)).send(body);
  const publicIds = async () => ((await t.http().get("/v1/showing?limit=50")).body.items as { wish: string }[]).map((i) => i.wish);
  async function listed() {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    await t.http().post(`/v1/wishes/${w.id}/publish-requests`).set(bearer(owner.token)).send({ consent: true });
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id } });
    const s = await staffOf(t, "ops");
    await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(s.token)).send({ decision: "approve", reason: "Looks lovely" });
    return { owner, w };
  }

  it("case 5: anyone reports a wish by its link, signed in or not; the report has its 24-hour clock and shows no account", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    const anon = await report(w.slug, { note: "  rude words  " });
    expect(anon.status).toBe(201);
    expect(anon.body).toMatchObject({ slug: w.slug, reason: "abuse", status: "open", queue: "report" });
    expect(Date.parse(anon.body.dueAt) - Date.parse(anon.body.createdAt)).toBe(24 * 3600 * 1000);
    expect(JSON.stringify(anon.body)).not.toContain(owner.accountId);
    const signed = await t.http().post("/v1/reports").set(bearer((await account(t, ["creator"])).token)).set("X-Forwarded-For", uniqueAddress()).send({ slug: w.slug, reason: "other" });
    expect(signed.status).toBe(201);
    expect(await db.report.findUniqueOrThrow({ where: { id: anon.body.id } })).toMatchObject({ wishId: w.id, accountId: owner.accountId, note: "rude words", status: "open", reporterContact: null });
    const bad = await report(w.slug, { reason: "this-is-me" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toHaveProperty("reason");
    expect((await report(w.slug, { note: "x".repeat(1001) })).status).toBe(422);
    expect((await report("no-such-link")).status).toBe(404);
    expect((await report("A!")).status).toBe(404);
  });

  it("10 reports a day per address, counted in the database; the 11th is 429; another address is not affected", async () => {
    const w = await liveWish(t, await account(t, ["creator"]));
    const ip = uniqueAddress();
    const first = await Promise.all(Array.from({ length: 12 }, () => report(w.slug, {}, ip)));
    expect(first.filter((r) => r.status === 201)).toHaveLength(10);
    expect(first.filter((r) => r.status === 429)).toHaveLength(2);
    expect((await report(w.slug)).status).toBe(201);
    t.clock.advance(25 * 3600 * 1000);
    expect((await report(w.slug, {}, ip)).status).toBe(201);
  });

  it("case 5: 'This is me, take it down' needs an email checked by a code; the report is its own kind in the take-down queue", async () => {
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    const email = `me-${t.id()}@example.com`;
    const ip = uniqueAddress();
    const post = (body: object) => t.http().post(`/v1/w/${w.slug}/take-down`).set("X-Forwarded-For", ip).send(body);
    expect((await post({ contact: "not-an-email" })).status).toBe(422);
    const asked = await post({ contact: `  ${email.toUpperCase()} ` });
    expect(asked.status).toBe(200);
    expect(asked.body).toMatchObject({ sent: true });
    expect(await db.report.count({ where: { wishId: w.id, reason: "this_is_me" } })).toBe(0);
    const mail = t.email.lastTo(email);
    const code = /\b(\d{6})\b/.exec(`${mail?.subject ?? ""} ${mail?.text ?? ""}`)?.[1];
    expect(code).toBeDefined();
    const wrong = await post({ contact: email, code: code === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("code_wrong");
    expect(await db.report.count({ where: { wishId: w.id } })).toBe(0);
    const ok = await post({ contact: email, code });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ reason: "this-is-me", status: "open", queue: "takedown" });
    expect(JSON.stringify(ok.body)).not.toContain(email);
    expect(await db.report.findUniqueOrThrow({ where: { id: ok.body.id } })).toMatchObject({ reason: "this_is_me", reporterContact: email, wishId: w.id, accountId: owner.accountId });
    expect((await post({ contact: email, code })).status).toBe(400);
    const staff = await t.http().get("/v1/admin/moderation?limit=50").set(bearer(mod.token));
    expect((staff.body.items as { id: string; queue: string }[]).find((i) => i.id === ok.body.id)).toMatchObject({ queue: "takedown", reason: "this-is-me", late: false, minutesLeft: 1440 });
  });

  it("five wrong codes end a code; a code for another wish does not work; an unknown link is 404", async () => {
    const w = await liveWish(t, await account(t, ["creator"]));
    const other = await liveWish(t, await account(t, ["creator"]));
    const email = `me-${t.id()}@example.com`;
    const ip = uniqueAddress();
    const post = (slug: string, body: object) => t.http().post(`/v1/w/${slug}/take-down`).set("X-Forwarded-For", ip).send(body);
    await post(w.slug, { contact: email });
    const code = /\b(\d{6})\b/.exec(`${t.email.lastTo(email)?.subject ?? ""} ${t.email.lastTo(email)?.text ?? ""}`)?.[1] as string;
    expect((await post(other.slug, { contact: email, code })).status).toBe(400);
    for (let i = 0; i < 5; i++) await post(w.slug, { contact: email, code: "000000" === code ? "111111" : "000000" });
    const dead = await post(w.slug, { contact: email, code });
    expect(dead.status).toBe(400);
    expect(dead.body.error.code).toBe("code_expired");
    expect((await post("nothing-here", { contact: email })).status).toBe(404);
  });

  it("B13: the fifth wrong code says no tries are left, not that the code ran out", async () => {
    const w = await liveWish(t, await account(t, ["creator"]));
    const email = `me-${t.id()}@example.com`;
    const ip = uniqueAddress();
    const post = (body: object) => t.http().post(`/v1/w/${w.slug}/take-down`).set("X-Forwarded-For", ip).send(body);
    await post({ contact: email });
    const code = /\b(\d{6})\b/.exec(`${t.email.lastTo(email)?.subject ?? ""} ${t.email.lastTo(email)?.text ?? ""}`)?.[1] as string;
    const bad = code === "000000" ? "111111" : "000000";
    const answers: { status: number; body: { error: { code: string; message: string } } }[] = [];
    for (let i = 0; i < 5; i++) answers.push(await post({ contact: email, code: bad }));
    expect(answers.slice(0, 4).map((r) => r.body.error.message)).toEqual([1, 2, 3, 4].map((i) => `That code is not right. ${5 - i} ${5 - i === 1 ? "try" : "tries"} left.`));
    expect(answers[4].status).toBe(400);
    expect(answers[4].body.error).toMatchObject({ code: "code_wrong", message: "That code is not right. No tries are left. Ask for a new one." });
  });

  it("B13 E-133: one email address is mailed at most 3 codes a day, from any network", async () => {
    const w = await liveWish(t, await account(t, ["creator"]));
    const email = `me-${t.id()}@example.com`;
    const ask = (ip: string) => t.http().post(`/v1/w/${w.slug}/take-down`).set("X-Forwarded-For", ip).send({ contact: email });
    expect((await ask(uniqueAddress())).status).toBe(200);
    expect((await ask(uniqueAddress())).status).toBe(200);
    expect((await ask(uniqueAddress())).status).toBe(200);
    const fourth = await ask(uniqueAddress());
    expect(fourth.status).toBe(429);
    expect(t.email.sent.filter((e) => e.to === email)).toHaveLength(3);
  });

  it("case 6: take down moves the wish through the lifecycle: off every list, its link gone, one audit row, one decision at once", async () => {
    const x = await listed();
    const saver = await account(t, ["creator"]);
    const feed = (await db.publishedWish.findFirstOrThrow({ where: { wishId: x.w.id } })).id;
    await t.http().put(`/v1/feed/wishes/${feed}/save`).set(bearer(saver.token)).send({ wish: feed });
    const rep = (await report(x.w.slug)).body.id as string;
    expect((await decide(rep, { decision: "take_down" })).status).toBe(422);
    expect((await decide(rep, { decision: "take_down", reason: "no" })).status).toBe(422);
    const other = await staffOf(t, "ops");
    const [a, b] = await Promise.all([decide(rep, { decision: "take_down", reason: "Breaks the rules" }), decide(rep, { decision: "keep", reason: "Looks fine" }, other.token)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.auditEntry.count({ where: { subjectId: rep } })).toBe(1);
    const won = a.status === 200 ? a : b;
    if (won.body.decision === "take_down") {
      expect(won.body).toMatchObject({ status: "upheld", decision: "take_down", wishState: "taken_down", decided: { reason: "Breaks the rules" } });
      expect(await publicIds()).not.toContain(x.w.id);
      expect((await db.wish.findUniqueOrThrow({ where: { id: x.w.id } })).status).toBe("removed");
      expect((await db.wishLink.findFirstOrThrow({ where: { wishId: x.w.id } })).active).toBe(false);
      expect(await db.savedWish.count({ where: { wish: feed } })).toBe(0);
      expect(await db.publishedWish.count({ where: { wishId: x.w.id } })).toBe(0);
    }
  });

  it("keep dismisses and changes nothing; 404 for unknown or non-uuid; a decided report is 409; staff only", async () => {
    const x = await listed();
    const rep = (await report(x.w.slug)).body.id as string;
    const kept = await decide(rep, { decision: "keep", reason: "Nothing wrong here" });
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ status: "dismissed", decision: "keep" });
    expect(await publicIds()).toContain(x.w.id);
    expect((await decide(rep, { decision: "take_down", reason: "changed my mind" })).status).toBe(409);
    expect((await decide(t.id(), { decision: "keep", reason: "nothing here" })).status).toBe(404);
    expect((await decide("nope", { decision: "keep", reason: "nothing here" })).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await decide(rep, { decision: "burn", reason: "nothing here" })).status).toBe(422);
    const support = await staffOf(t, "support");
    expect((await decide(rep, { decision: "keep", reason: "nothing here" }, support.token)).status).toBe(403);
    expect((await decide(rep, { decision: "keep", reason: "nothing here" }, (await account(t, ["creator"])).token)).status).toBe(403);
    expect((await t.http().post(`/v1/admin/moderation/${rep}/decide`).send({ decision: "keep", reason: "nothing here" })).status).toBe(401);
  });

  it("ban the account: a Ban row, sessions end, sign-in refused, listings leave; lifting restores sign-in, not the listings", async () => {
    const x = await listed();
    const y = await liveWish(t, x.owner);
    const sessions = t.app.get(SessionsService);
    const meta = { ip: uniqueAddress(), userAgent: "test" };
    const before = await sessions.start(db, x.owner.accountId, meta);
    const rep = (await report(x.w.slug)).body.id as string;
    const done = await decide(rep, { decision: "ban", reason: "Abusive account" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: "upheld", decision: "ban" });
    const ban = await db.ban.findFirstOrThrow({ where: { accountId: x.owner.accountId } });
    expect(ban).toMatchObject({ scope: "account", reason: "Abusive account", by: mod.id });
    expect((await db.session.findFirstOrThrow({ where: { familyId: before.row.familyId } })).revokedAt).not.toBeNull();
    await expect(sessions.start(db, x.owner.accountId, meta)).rejects.toMatchObject({ status: 403 });
    expect(await publicIds()).not.toContain(x.w.id);
    expect((await t.http().post(`/v1/wishes/${y.id}/publish-requests`).set(bearer(x.owner.token)).send({ consent: true })).status).toBe(403);
    await t.app.get(BansService).lift(ban.id, { type: "staff", id: mod.id, requestId: "r" }, "Appeal accepted");
    await expect(sessions.start(db, x.owner.accountId, meta)).resolves.toBeDefined();
    expect(await publicIds()).not.toContain(x.w.id);
    expect(await db.publishedWish.count({ where: { wishId: x.w.id } })).toBe(0);
  });

  it("E-21 ban by staff: moderator and owner only; scope checked; a second ban of the same scope is 409", async () => {
    const victim = await account(t, ["creator"]);
    const post = (body: object, token = mod.token) => t.http().post("/v1/admin/bans").set(bearer(token)).send(body);
    const ok = await post({ accountId: victim.accountId, scope: "publishing", reason: "Too many reports" });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ accountId: victim.accountId, scope: "publishing", by: mod.id });
    expect((await post({ accountId: victim.accountId, scope: "publishing", reason: "Too many reports" })).status).toBe(409);
    expect((await post({ accountId: victim.accountId, scope: "forever", reason: "Too many reports" })).status).toBe(422);
    expect((await post({ accountId: victim.accountId, scope: "account", reason: "no" })).status).toBe(422);
    expect((await post({ accountId: t.id(), scope: "account", reason: "Too many reports" })).status).toBe(404);
    expect((await post({ accountId: "nope", scope: "account", reason: "Too many reports" })).status).toBe(404);
    expect((await post({ accountId: victim.accountId, scope: "account", reason: "Too many reports" }, (await staffOf(t, "ops")).token)).status).toBe(403);
    expect((await post({ accountId: victim.accountId, scope: "account", reason: "Too many reports" }, victim.token)).status).toBe(403);
    expect((await t.http().post("/v1/admin/bans").send({})).status).toBe(401);
    expect(await db.auditEntry.count({ where: { subjectId: victim.accountId, action: "ban.create" } })).toBe(1);
  });

  it("three upheld reports against one account remove its right to publish", async () => {
    const owner = await account(t, ["creator"]);
    const wishes = [await liveWish(t, owner), await liveWish(t, owner), await liveWish(t, owner), await liveWish(t, owner)];
    for (const w of wishes.slice(0, 3)) {
      const rep = (await report(w.slug)).body.id as string;
      expect((await decide(rep, { decision: "take_down", reason: "Breaks the rules" })).status).toBe(200);
    }
    const bans = await db.ban.findMany({ where: { accountId: owner.accountId } });
    expect(bans).toHaveLength(1);
    expect(bans[0]).toMatchObject({ scope: "publishing", by: "system" });
    expect((await t.http().post(`/v1/wishes/${wishes[3].id}/publish-requests`).set(bearer(owner.token)).send({ consent: true })).status).toBe(403);
    expect(await db.auditEntry.count({ where: { subjectId: owner.accountId, action: "ban.auto" } })).toBe(1);
  });

  it("case 7: the queue is oldest first with time left and late marked; flagged photos from the files queue; counts", async () => {
    const a = await liveWish(t, await account(t, ["creator"]));
    const first = (await report(a.slug)).body.id as string;
    t.clock.advance(30 * 60_000);
    const second = (await report(a.slug)).body.id as string;
    const fileOwner = await account(t, ["creator"]);
    const fileId = t.id();
    await db.storedFile.create({ data: { id: fileId, ownerAccountId: fileOwner.accountId, purpose: "wish_photo", status: "screening", contentType: "image/jpeg", bytes: 10n, objectKey: `k/${fileId}`, variants: [], driver: "r2" } });
    const flagged = t.id();
    await db.screeningResult.create({ data: { id: flagged, fileId, provider: "standin", verdict: "review", labels: [], createdAt: t.clock.now() } });
    const r = await t.http().get("/v1/admin/moderation?limit=50").set(bearer(mod.token));
    expect(r.status).toBe(200);
    const items = r.body.items as { id: string; queue: string; minutesLeft: number; late: boolean; photo?: string }[];
    expect(items.findIndex((i) => i.id === first)).toBeLessThan(items.findIndex((i) => i.id === second));
    expect(items.find((i) => i.id === first)).toMatchObject({ queue: "report", minutesLeft: 1410, late: false });
    expect(items.find((i) => i.id === second)).toMatchObject({ minutesLeft: 1440 });
    expect(items.find((i) => i.id === flagged)).toMatchObject({ queue: "flagged", photo: fileId, late: false });
    t.clock.advance(23 * 3600_000 + 40 * 60_000);
    const late = (await t.http().get("/v1/admin/moderation?limit=50").set(bearer(mod.token))).body.items as { id: string; late: boolean; minutesLeft: number }[];
    expect(late.find((i) => i.id === first)).toMatchObject({ late: true, minutesLeft: 0 });
    expect(late.find((i) => i.id === second)).toMatchObject({ late: false, minutesLeft: 20 });
    const c = await t.app.get(ReportsService).counts();
    expect(c.late).toBeGreaterThan(0);
    expect(c.flagged).toBeGreaterThan(0);
    const p1 = await t.http().get("/v1/admin/moderation?limit=2").set(bearer(mod.token));
    expect(p1.body.items).toHaveLength(2);
    const p2 = await t.http().get(`/v1/admin/moderation?limit=2&cursor=${p1.body.nextCursor as string}`).set(bearer(mod.token));
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
    expect((await t.http().get("/v1/admin/moderation?cursor=zzz").set(bearer(mod.token))).status).toBe(422);
    expect((await t.http().get("/v1/admin/moderation").set(bearer((await staffOf(t, "support")).token))).status).toBe(403);
    expect((await t.http().get("/v1/admin/moderation").set(bearer((await account(t, ["creator"])).token))).status).toBe(403);
    expect((await t.http().get("/v1/admin/moderation")).status).toBe(401);
    expect((await decide(flagged, { decision: "keep", reason: "nothing here" })).status).toBe(404);
  });
});
