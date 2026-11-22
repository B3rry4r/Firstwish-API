import { PrismaService } from "../../src/common/db/prisma.service";
import { account, B12App, b13App, bearer, staffOf } from "../../src/modules/showing/tests/b13-kit";

/** INT-5: the shared base of wave 6, by registry id. */
describe("INT-5 shared base", () => {
  let t: B12App;
  let db: PrismaService;
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
  });
  afterAll(() => t.close());

  it("QQ6, WW4, EA1, XX4, YY3, OO4, CA2: the 16 raw-SQL tables are Prisma models the client reads", async () => {
    const counts = await Promise.all([
      db.invoiceCounter.count(), db.invoiceLink.count(), db.moderationDecision.count(), db.reportHit.count(), db.takeDownCode.count(),
      db.conciergeOrderExt.count(), db.conciergeOrderWish.count(), db.emailSuppression.count(), db.supportIntakeCount.count(),
      db.payoutDetail.count(), db.royaltyReversal.count(), db.styleSubmissionSnapshot.count(), db.revealAccess.count(), db.revealVisit.count(),
      db.revealSend.count(), db.vaultPeak.count(),
    ]);
    expect(counts).toHaveLength(16);
    expect(counts[0]).toBe(1); // the one counter row of the invoice numbers
  });

  it("E-242 lifts a ban: owner and ops only, a reason, one audit row, a ban not in force is 409", async () => {
    const mod = await staffOf(t, "moderator");
    const ops = await staffOf(t, "ops");
    const victim = await account(t, ["creator"]);
    const ban = await t.http().post("/v1/admin/bans").set(bearer(mod.token)).send({ accountId: victim.accountId, scope: "account", reason: "Too many reports" });
    expect(ban.status).toBe(201);
    const lift = (id: string, body: object, token = ops.token) => t.http().delete(`/v1/admin/bans/${id}`).set(bearer(token)).send(body);
    expect((await lift(ban.body.id, { reason: "Appeal accepted" }, mod.token)).status).toBe(403);
    expect((await t.http().delete(`/v1/admin/bans/${ban.body.id}`).send({ reason: "Appeal accepted" })).status).toBe(401);
    expect((await lift(ban.body.id, {})).status).toBe(422);
    expect((await lift("not-an-id", { reason: "Appeal accepted" })).status).toBe(422); // IF2: a name that is not an id is 422 in words
    const ok = await lift(ban.body.id, { reason: "Appeal accepted" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: ban.body.id, accountId: victim.accountId });
    expect(Date.parse(ok.body.until)).toBeLessThanOrEqual(t.clock.now().getTime());
    expect(await db.auditEntry.count({ where: { action: "ban.lift", subjectId: victim.accountId } })).toBe(1);
    expect((await lift(ban.body.id, { reason: "Appeal accepted" })).status).toBe(409);
  });

  it("E-250 to E-253: saved replies have a list and a writer; support, ops and owner; a reason; one audit row each", async () => {
    const sup = await staffOf(t, "support");
    const mod = await staffOf(t, "moderator");
    const base = "/v1/admin/support/saved-replies";
    const add = await t.http().post(base).set(bearer(sup.token)).send({ name: "Int five thanks", text: "Thank you for writing in.", reason: "A reply staff use often" });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ name: "Int five thanks", text: "Thank you for writing in." });
    expect((await t.http().post(base).set(bearer(mod.token)).send({ name: "x", text: "y", reason: "No access here" })).status).toBe(403);
    expect((await t.http().post(base).send({ name: "x", text: "y", reason: "No token" })).status).toBe(401);
    expect((await t.http().post(base).set(bearer(sup.token)).send({ name: "", text: "y", reason: "Bad name here" })).status).toBe(422);
    expect((await t.http().post(base).set(bearer(sup.token)).send({ name: "Two", text: "<b>tags</b>", reason: "Bad text here" })).status).toBe(422);
    expect((await t.http().post(base).set(bearer(sup.token)).send({ name: "Two", text: "words" })).status).toBe(422);
    const list = await t.http().get(base).set(bearer(sup.token));
    expect(list.status).toBe(200);
    expect((list.body.items as { id: string }[]).map((r) => r.id)).toContain(add.body.id);
    const patch = (body: object) => t.http().patch(`${base}/${add.body.id}`).set(bearer(sup.token)).send(body);
    expect((await patch({ reason: "Nothing to change" })).status).toBe(422);
    const changed = await patch({ text: "Thanks for writing in.", reason: "Plainer words" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id: add.body.id, name: "Int five thanks", text: "Thanks for writing in." });
    expect((await t.http().patch(`${base}/${t.id()}`).set(bearer(sup.token)).send({ name: "Gone", reason: "Not there at all" })).status).toBe(404);
    const gone = await t.http().delete(`${base}/${add.body.id}`).set(bearer(sup.token)).send({ reason: "No longer used" });
    expect(gone.status).toBe(204);
    expect((await t.http().delete(`${base}/${add.body.id}`).set(bearer(sup.token)).send({ reason: "No longer used" })).status).toBe(404);
    expect(await db.savedReply.count({ where: { id: add.body.id } })).toBe(0);
    const acts = (await db.auditEntry.findMany({ where: { subjectId: add.body.id }, orderBy: { id: "asc" } })).map((a) => a.action);
    expect(acts).toEqual(["support.saved-reply.add", "support.saved-reply.change", "support.saved-reply.remove"]);
  });
});
