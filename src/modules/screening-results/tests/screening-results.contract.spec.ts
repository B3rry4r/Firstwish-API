import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { filesApp, ids, JPEG, makeAccount, makeBusiness, ScoredScreening } from "../../stored-files/tests/files-kit";
import { ScreeningResultsService } from "../screening-results.service";

describe("E-157 screening decision (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let scored: ScoredScreening;
  let me: { id: string; token: string };
  const modId = ids.next();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ t, db, scored } = await filesApp());
    await seedRoleTable(db);
    me = await makeAccount(db, t, ["person", "business"]);
    t.tokens.set("mod", { kind: "staff", staffId: modId, roles: ["moderator"] });
    t.tokens.set("support", { kind: "staff", staffId: ids.next(), roles: ["support"] });
  });
  afterAll(() => t.close());

  /** A held file (score 0.6) and its screening result. */
  async function held(purpose = "photo", contentType = "image/jpeg"): Promise<{ fileId: string; resultId: string; key: string }> {
    const r = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose, contentType, bytes: 700 });
    expect(r.status).toBe(201);
    const fileId = r.body.id as string;
    const key = (await db.storedFile.findUniqueOrThrow({ where: { id: fileId } })).objectKey;
    t.storage.put(key, JPEG(700), contentType);
    scored.next.push(0.7);
    const c = await t.http().post(`/v1/uploads/${fileId}/confirm`).set(auth(me.token)).send({ fileId });
    expect(c.body.status).toBe("screening");
    const res = await db.screeningResult.findFirstOrThrow({ where: { fileId } });
    return { fileId, resultId: res.id, key };
  }
  const decide = (id: string, body: object, token = "mod") => t.http().post(`/v1/admin/screening-results/${id}/decision`).set(auth(token)).send(body);

  it("a held file is in the staff queue; pass makes it ready, with one audit row carrying the reason", async () => {
    const h = await held();
    const queue = await t.app.get(ScreeningResultsService).queue();
    expect(queue.map((q) => q.id)).toContain(h.resultId);
    const r = await decide(h.resultId, { finalVerdict: "pass", reason: "  Looks fine to me  " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: h.resultId, fileId: h.fileId, verdict: "review", finalVerdict: "pass", reviewedBy: modId, provider: "standin" });
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: h.fileId } })).status).toBe("ready");
    const audit = await db.auditEntry.findMany({ where: { subjectId: h.resultId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: modId, action: "screening.decide", section: "/admin/moderation", reason: "Looks fine to me" });
    expect((await t.app.get(ScreeningResultsService).queue()).map((q) => q.id)).not.toContain(h.resultId);
    const again = await decide(h.resultId, { finalVerdict: "reject", reason: "changed my mind" });
    expect(again.status).toBe(409);
  });

  it("reject refuses the file for good: the object is removed and Vault bytes are given back", async () => {
    const bizId = await makeBusiness(db, me.id, { plan: "starter" });
    const h = await held("vault");
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(700);
    const r = await decide(h.resultId, { finalVerdict: "reject", reason: "breaks the rules" });
    expect(r.status).toBe(200);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: h.fileId } })).status).toBe("rejected");
    expect(await t.storage.head(h.key)).toBeNull();
    expect(Number((await db.business.findUniqueOrThrow({ where: { id: bizId } })).vault)).toBe(0);
  });

  it("401 without a token, 403 for a user or a role that does not open moderation, 422 for a bad body, 404 for an unknown or non-uuid id", async () => {
    const h = await held();
    expect((await t.http().post(`/v1/admin/screening-results/${h.resultId}/decision`).send({ finalVerdict: "pass", reason: "fine fine" })).status).toBe(401);
    expect((await decide(h.resultId, { finalVerdict: "pass", reason: "fine fine" }, "support")).status).toBe(403);
    expect((await decide(h.resultId, { finalVerdict: "pass", reason: "fine fine" }, me.token)).status).toBe(403);
    const bad = await decide(h.resultId, { finalVerdict: "maybe", reason: "fine fine" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toHaveProperty("finalVerdict");
    const short = await decide(h.resultId, { finalVerdict: "pass", reason: " ok " });
    expect(short.status).toBe(422);
    expect(short.body.error.fields).toHaveProperty("reason");
    expect(await db.auditEntry.count({ where: { subjectId: h.resultId } })).toBe(0);
    expect((await decide(ids.next(), { finalVerdict: "pass", reason: "fine fine" })).status).toBe(404);
    expect((await decide("nope", { finalVerdict: "pass", reason: "fine fine" })).status).toBe(404);
  });

  it("two decisions at once: one wins, the other is 409, one audit row", async () => {
    const h = await held();
    const [a, b] = await Promise.all([decide(h.resultId, { finalVerdict: "pass", reason: "first one" }), decide(h.resultId, { finalVerdict: "reject", reason: "second one" })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.auditEntry.count({ where: { subjectId: h.resultId } })).toBe(1);
  });
});
