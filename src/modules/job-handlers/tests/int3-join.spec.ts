import { PrismaService } from "../../../common/db/prisma.service";
import { StandinImageSizes } from "../../../common/ports/adapters/standins";
import { ImageSizesPort } from "../../../common/ports/image-sizes.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { ScoredScreening, ids, makeAccount, makeBusiness, makeWish, PNG, stage, ensureEntitlements } from "../../stored-files/tests/files-kit";
import { ERASE_FILES_PREFIX } from "../../stored-files/file-jobs";
import { stagingKeyOf } from "../../stored-files/file-rules";
import { UploadScreeningPort } from "../../../common/ports/screening.port";
import { ABANDON_EVERY_MS, JobHandlers, SWEEP_KEY, UPLOAD_CLEANUP_EVERY_MS } from "../job-handlers.service";

/* INT-3: the joins only the merged base can make. Every handler a bundle exported is registered with the jobs frame and the tick
   (JobsService.runDue, the body of the BullMQ tick) really runs it; erasing an account and the signed PUT are re-proved with B06's wishes.
   The clock stands at a time no other spec uses, so this spec's runDue never takes another spec's job. */
const NOW = new Date("2025-06-01T09:00:00.000Z");
const MIN = 60_000;
const FAR = new Date("2099-01-01T00:00:00.000Z");

/** Removes this spec's job rows and their recorded runs, so no job of ours is left for another spec's tick. */
async function dropJobs(db: PrismaService, where: object): Promise<void> {
  const found = await db.job.findMany({ where, select: { id: true } });
  const jobId = { in: found.map((j) => j.id) };
  await db.jobRun.deleteMany({ where: { jobId } });
  await db.job.deleteMany({ where: { id: jobId } });
}

describe("INT-3: the jobs frame runs the handlers other bundles exported", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  let k = 0;
  const subject = () => `int3-${process.pid}-${Date.now()}-${++k}`;

  beforeAll(async () => {
    const scored = new ScoredScreening();
    t = await createTestApp({ now: NOW, configure: (b) => b.overrideProvider(UploadScreeningPort).useValue(scored) });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    t.app.get(JobHandlers).registerAll();
    await ensureEntitlements(db);
  });
  afterAll(() => t.close());

  const jobOf = (type: "abandon_payment" | "upload_cleanup" | "make_image_sizes", subjectId: string) => db.job.findUniqueOrThrow({ where: { type_subjectId: { type, subjectId } } });
  const runsOf = (jobId: string) => db.jobRun.findMany({ where: { jobId }, orderBy: { id: "asc" } });

  async function payment(accountId: string, createdAt: Date, status: "pending" | "started" | "succeeded" = "pending"): Promise<string> {
    const id = ids.next();
    await db.payment.create({
      data: {
        id, accountId, purpose: "ticket", lines: [{ sku: "ticket.moment", qty: 1, totalKobo: 100000 }], amountKobo: 100000n, currency: "NGN", priceBookVersion: 1, status,
        provider: "paystack", providerReference: `int3-ref-${id}`, idempotencyKey: `int3-key-${id}`, createdAt,
      },
    });
    return id;
  }

  it("abandon-payment (B05): the tick marks payments waiting past the abandon time, leaves younger and paid ones, records the run and comes back in 5 minutes", async () => {
    const me = await makeAccount(db, t);
    const old = await payment(me.id, new Date(NOW.getTime() - 90 * MIN));
    const started = await payment(me.id, new Date(NOW.getTime() - 120 * MIN), "started");
    const young = await payment(me.id, new Date(NOW.getTime() - 10 * MIN));
    const paid = await payment(me.id, new Date(NOW.getTime() - 300 * MIN), "succeeded");
    const key = subject();
    await jobs.schedule("abandon-payment", NOW, key);
    expect(await jobs.runDue()).toBeGreaterThanOrEqual(1);
    const status = async (id: string) => (await db.payment.findUniqueOrThrow({ where: { id } })).status;
    expect([await status(old), await status(started), await status(young), await status(paid)]).toEqual(["abandoned", "abandoned", "pending", "succeeded"]);
    const job = await jobOf("abandon_payment", key);
    expect(job.status).toBe("scheduled");
    expect(job.runAt.getTime()).toBe(NOW.getTime() + ABANDON_EVERY_MS);
    const runs = await runsOf(job.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ outcome: "succeeded", error: null });
    expect((runs[0].changed as { abandoned: number }).abandoned).toBeGreaterThanOrEqual(2);
    await dropJobs(db, { id: job.id });
  });

  it("the recurring jobs are put on the table once: scheduling twice moves one row each", async () => {
    const handlers = t.app.get(JobHandlers);
    const before = await db.job.count({ where: { subjectId: SWEEP_KEY, type: { in: ["abandon_payment", "upload_cleanup"] } } });
    await handlers.scheduleRecurring();
    await handlers.scheduleRecurring();
    expect(await db.job.count({ where: { subjectId: SWEEP_KEY, type: { in: ["abandon_payment", "upload_cleanup"] } } })).toBe(Math.max(before, 2));
    expect(await db.job.count({ where: { subjectId: SWEEP_KEY, type: "abandon_payment" } })).toBe(1);
    expect(await db.job.count({ where: { subjectId: SWEEP_KEY, type: "upload_cleanup" } })).toBe(1);
    await dropJobs(db, { subjectId: SWEEP_KEY, type: { in: ["abandon_payment", "upload_cleanup"] } });
  });

  it("upload-cleanup (B09), the recurring sweep: the tick removes an upload never confirmed in 24 hours (rows and objects) and comes back in an hour", async () => {
    const me = await makeAccount(db, t);
    const id = ids.next();
    const objectKey = `files/${id}`;
    await db.storedFile.create({ data: { id, ownerAccountId: me.id, purpose: "wish_photo", objectKey, contentType: "image/png", bytes: BigInt(10), status: "pending", variants: [], driver: "r2", createdAt: new Date(NOW.getTime() - 25 * 60 * MIN) } });
    await db.uploadTicket.create({ data: { id, bytes: BigInt(10), contentType: "image/png", purpose: "wish-photo" } });
    t.storage.put(objectKey, PNG(10), "image/png");
    const key = subject();
    await jobs.schedule("upload-cleanup", NOW, key);
    await jobs.runDue();
    expect(await db.storedFile.count({ where: { id } })).toBe(0);
    expect(await db.uploadTicket.count({ where: { id } })).toBe(0);
    expect(await t.storage.head(objectKey)).toBeNull();
    const job = await jobOf("upload_cleanup", key);
    expect(job.runAt.getTime()).toBe(NOW.getTime() + UPLOAD_CLEANUP_EVERY_MS);
    expect(await runsOf(job.id)).toEqual([expect.objectContaining({ outcome: "succeeded" })]);
    await dropJobs(db, { id: job.id });
  });

  it("upload-cleanup (B09), a staging key and an erased account's files: the tick runs the job whose subject is the key or erase-files:<account>", async () => {
    const me = await makeAccount(db, t);
    const stray = `incoming/files/${ids.next()}`;
    t.storage.put(stray, PNG(20), "image/png");
    await t.app.get(JobHandlers)["files"].scheduleCleanup(stray, NOW);
    const fileId = ids.next();
    const objectKey = `files/${fileId}`;
    t.storage.put(objectKey, PNG(30), "image/png");
    await db.storedFile.create({ data: { id: fileId, ownerAccountId: me.id, purpose: "wish_photo", objectKey, contentType: "image/png", bytes: BigInt(30), status: "ready", variants: [], driver: "r2" } });
    await t.app.get(JobHandlers)["files"].removeAccountFiles(me.id);
    await jobs.runDue();
    expect(await t.storage.head(stray)).toBeNull();
    expect(await t.storage.head(objectKey)).toBeNull();
    expect(await db.storedFile.count({ where: { id: fileId } })).toBe(0);
    for (const subjectId of [stray, `${ERASE_FILES_PREFIX}${me.id}`]) {
      const job = await jobOf("upload_cleanup", subjectId);
      expect(job.status).toBe("succeeded");
      expect(await runsOf(job.id)).toEqual([expect.objectContaining({ outcome: "succeeded" })]);
    }
    // a second erase request for the same account moves the same row (CC4): no second row, no unique violation
    await t.app.get(JobHandlers)["files"].removeAccountFiles(me.id);
    expect(await db.job.count({ where: { type: "upload_cleanup", subjectId: `${ERASE_FILES_PREFIX}${me.id}` } })).toBe(1);
    await dropJobs(db, { type: "upload_cleanup", subjectId: { in: [stray, `${ERASE_FILES_PREFIX}${me.id}`] } });
  });

  it("make-image-sizes (B09): a confirmed image writes the job; the tick makes widths 320, 768 and 1600 through the image-sizes port", async () => {
    const me = await makeAccount(db, t);
    const sizes = t.app.get<ImageSizesPort, StandinImageSizes>(ImageSizesPort);
    const ticket = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose: "photo", contentType: "image/png", bytes: 300 });
    const id = ticket.body.id as string;
    await stage(t, db, id, PNG(300), "image/png");
    const c = await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id });
    expect(c.status).toBe(200);
    expect((await jobOf("make_image_sizes", id)).status).toBe("scheduled");
    const madeBefore = sizes.made.length;
    const objectKey = (await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey;
    await jobs.runDue();
    expect(sizes.made.slice(madeBefore).filter((m) => m.sourceKey === objectKey).map((m) => m.width).sort((a, b) => a - b)).toEqual([320, 768, 1600]);
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    expect((row.variants as { width: number }[]).map((v) => v.width).sort((a, b) => a - b)).toEqual([320, 768, 1600]);
    const job = await jobOf("make_image_sizes", id);
    expect(job.status).toBe("succeeded");
    expect(await runsOf(job.id)).toEqual([expect.objectContaining({ outcome: "succeeded", changed: { made: 3 } })]);
    // run again by hand: nothing left to make, recorded as skipped
    await jobs.schedule("make-image-sizes", NOW, id);
    await jobs.runDue();
    const again = await runsOf(job.id);
    expect(again).toHaveLength(2);
    expect(again[1]).toMatchObject({ outcome: "skipped" });
  });
});

describe("INT-3: X10, J1, J2 and Y1 on the merged base (B06's wishes with the account erase and the signed upload)", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  const actor = { type: "staff" as const, id: null, requestId: "test-int3" };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    t.app.get(JobHandlers).registerAll();
    await ensureEntitlements(db);
  });
  afterAll(() => t.close());

  async function fileOf(accountId: string, businessId?: string): Promise<{ id: string; keys: string[] }> {
    const id = ids.next();
    const objectKey = `files/${id}`;
    const sized = `${objectKey}.w320`;
    t.storage.put(objectKey, PNG(100), "image/png");
    t.storage.put(sized, PNG(50), "image/png");
    await db.storedFile.create({
      data: { id, ownerAccountId: accountId, businessId: businessId ?? null, purpose: "wish_photo", objectKey, contentType: "image/png", bytes: BigInt(100), status: "ready", variants: [{ width: 320, key: sized }], driver: "r2" },
    });
    return { id, keys: [objectKey, sized] };
  }

  it("X10, J1, J2: erasing an account kills its wishes' links, waiting jobs, files and saves, and nothing of anyone else's", async () => {
    const me = await makeAccount(db, t, ["person", "business"]);
    const biz = await makeBusiness(db, me.id);
    const fan = await makeAccount(db, t);
    const other = await makeAccount(db, t);
    // a sealed wish with a link, a waiting open job, a named file; a live wish with a rest job and a notice job
    const sealed = await makeWish(db, me.id, "sealed");
    const live = await makeWish(db, me.id, "live");
    const theirs = await makeWish(db, other.id, "sealed");
    const f1 = await fileOf(me.id);
    const f2 = await fileOf(me.id, biz);
    const fTheirs = await fileOf(other.id);
    await db.wishFile.create({ data: { id: ids.next(), wishId: sealed, fileId: f1.id, role: "photo" } as never });
    await db.wishFile.create({ data: { id: ids.next(), wishId: theirs, fileId: fTheirs.id, role: "photo" } as never });
    for (const w of [sealed, live, theirs]) await db.wishLink.create({ data: { id: ids.next(), slug: `int3${ids.next().slice(-12)}`, wishId: w, active: true } });
    // far ahead of any clock another spec uses, so no other spec's tick takes these waiting jobs
    await jobs.schedule("open-wish", FAR, sealed);
    await jobs.schedule("rest-wish", FAR, live);
    await jobs.schedule("send-notice", FAR, live);
    await jobs.schedule("open-wish", FAR, theirs);
    // saves: the fan saved both of my wishes and the other's; I saved the other's
    const save = (accountId: string, wish: string) => db.savedWish.create({ data: { id: ids.next(), accountId, wish } });
    await save(fan.id, sealed);
    await save(fan.id, live);
    await save(fan.id, theirs);
    await save(me.id, theirs);

    await t.app.get(AccountErasureService).erase(me.id, { actor, reason: "test" });

    // links: both answer "gone" (inactive), the other's stays active
    expect(await db.wishLink.count({ where: { wishId: { in: [sealed, live] }, active: true } })).toBe(0);
    expect(await db.wishLink.count({ where: { wishId: theirs, active: true } })).toBe(1);
    // jobs: nothing waits on my wishes any more; the other's job stays
    expect(await db.job.count({ where: { subjectId: { in: [sealed, live] }, status: "scheduled" } })).toBe(0);
    expect(await db.job.count({ where: { subjectId: theirs, status: "scheduled" } })).toBe(1);
    // saves
    expect(await db.savedWish.count({ where: { OR: [{ accountId: me.id }, { wish: { in: [sealed, live] } }] } })).toBe(0);
    expect(await db.savedWish.count({ where: { accountId: fan.id, wish: theirs } })).toBe(1);
    // files: the erase wrote one job row, nothing was removed inside its transaction; the tick removes rows and objects
    expect(await db.job.count({ where: { type: "upload_cleanup", subjectId: `${ERASE_FILES_PREFIX}${me.id}`, status: "scheduled" } })).toBe(1);
    expect(await t.storage.head(f1.keys[0])).not.toBeNull();
    await jobs.runDue();
    expect(await db.storedFile.count({ where: { id: { in: [f1.id, f2.id] } } })).toBe(0);
    expect(await db.wishFile.count({ where: { wishId: sealed } })).toBe(0);
    for (const key of [...f1.keys, ...f2.keys]) expect(await t.storage.head(key)).toBeNull();
    expect(await db.storedFile.count({ where: { id: fTheirs.id } })).toBe(1);
    for (const key of fTheirs.keys) expect(await t.storage.head(key)).not.toBeNull();
    expect(await db.wishFile.count({ where: { wishId: theirs } })).toBe(1);
    // the wishes themselves: erased, content gone
    const w = await db.wish.findMany({ where: { id: { in: [sealed, live] } } });
    expect(w.every((x) => x.erasedAt !== null && x.status === "removed" && x.content === null)).toBe(true);
    await dropJobs(db, { subjectId: { in: [theirs, `${ERASE_FILES_PREFIX}${me.id}`] } });
  });

  it("Y1: a PUT with an old signed URL cannot change a file a sealed wish names; the stray it leaves is swept by the tick", async () => {
    const me = await makeAccount(db, t);
    const up = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose: "photo", contentType: "image/png", bytes: 400 });
    const id = up.body.id as string;
    const finalKey = (await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey;
    const staging = stagingKeyOf(finalKey);
    expect(new URL(up.body.upload.url as string).pathname).toContain(encodeURI(staging));
    const good = PNG(400);
    expect(t.storage.putSigned(staging, good, "image/png")).toBe(true);
    const c = await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id });
    expect(c.body).toMatchObject({ status: "ready" });
    // a sealed wish names the file
    const wish = await makeWish(db, me.id, "sealed");
    await db.wishFile.create({ data: { id: ids.next(), wishId: wish, fileId: id, role: "photo" } as never });
    // the attack: same type and length (the signature accepts it), other bytes, the old URL
    const evil = Buffer.concat([PNG(8), Buffer.alloc(392, 9)]);
    expect(t.storage.putSigned(staging, evil, "image/png")).toBe(true);
    expect(t.storage.bound.has(finalKey)).toBe(false);
    expect((await t.storage.readStart(finalKey, 1000))?.equals(good)).toBe(true);
    expect(await db.storedFile.count({ where: { id, status: "ready", bytes: 400n } })).toBe(1);
    // the file the wish names cannot be deleted from under it
    await expect(db.storedFile.delete({ where: { id } })).rejects.toThrow();
    // the tick, once every signed PUT for the key has expired, removes the stray and nothing else
    t.clock.advance(16 * MIN);
    await jobs.runDue();
    expect(await t.storage.head(staging)).toBeNull();
    expect((await t.storage.readStart(finalKey, 1000))?.equals(good)).toBe(true);
    expect(await db.storedFile.count({ where: { id, status: "ready" } })).toBe(1);
    expect(await db.wishFile.count({ where: { wishId: wish, fileId: id } })).toBe(1);
    const job = await db.job.findUniqueOrThrow({ where: { type_subjectId: { type: "upload_cleanup", subjectId: staging } } });
    expect(job.status).toBe("succeeded");
    await dropJobs(db, { id: job.id });
  });
});
