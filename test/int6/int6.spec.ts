import { PrismaService } from "../../src/common/db/prisma.service";
import { JobsService } from "../../src/modules/jobs/jobs.service";
import { account, B12App, b13App, bearer, staffOf } from "../../src/modules/showing/tests/b13-kit";

/** INT-6: the closing base, by ruling id. */
describe("INT-6 closing base", () => {
  let t: B12App;
  let db: PrismaService;
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
  });
  afterAll(() => t.close());

  it("GC2: deleting the voice file of an AI request clears the link; the request and its words stay", async () => {
    const a = await account(t, ["creator"]);
    const fileId = t.id();
    await db.storedFile.create({ data: { id: fileId, purpose: "voice_note", objectKey: `int6/${fileId}`, contentType: "audio/mp4", bytes: 10n, status: "ready", variants: {}, driver: "r2" } });
    const reqId = t.id();
    await db.aiRequest.create({ data: { id: reqId, accountId: a.accountId, kind: "letter_from_voice", creditsSpent: 0, status: "done", model: "m", voiceFileId: fileId, transcript: "words" } });
    await db.storedFile.delete({ where: { id: fileId } });
    expect(await db.aiRequest.findUniqueOrThrow({ where: { id: reqId } })).toMatchObject({ voiceFileId: null, transcript: "words" });
  });

  it("HC2: cancelling a job that has history marks it cancelled, staff can list it, and it is never claimed again", async () => {
    const jobs = t.app.get(JobsService);
    const key = `int6-cancel-${t.id()}`;
    const id = await jobs.schedule("rest-wish", new Date(t.clock.now().getTime() + 1000), key);
    await db.$executeRaw`INSERT INTO job_run (id, "jobId", "startedAt", "finishedAt", outcome) VALUES (${t.id()}::uuid, ${id}::uuid, now(), now(), 'succeeded')`;
    await jobs.cancel("rest-wish", key);
    expect(await db.job.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "cancelled" });
    const ops = await staffOf(t, "ops");
    const list = await t.http().get(`/v1/admin/jobs?status=cancelled&type=rest-wish`).set(bearer(ops.token));
    expect(list.status).toBe(200);
    expect((list.body.items as { id: string; status: string }[]).find((j) => j.id === id)).toMatchObject({ status: "cancelled" });
    // a cancelled job is not retried by staff either: retry changes nothing
    const retry = await t.http().post(`/v1/admin/jobs/${id}/retry`).set(bearer(ops.token)).send({ reason: "Checking the retry" });
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("cancelled");
  });
});
