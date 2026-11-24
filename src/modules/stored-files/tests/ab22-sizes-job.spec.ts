import sharp from "sharp";
import { PrismaService } from "../../../common/db/prisma.service";
import { SharpImageSizes } from "../../../common/ports/adapters/sharp-image-sizes.adapter";
import { ImageSizesPort } from "../../../common/ports/image-sizes.port";
import { StoragePort } from "../../../common/ports/storage.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { JobsService, MAX_TRIES } from "../../jobs/jobs.service";
import { JobHandlers } from "../../job-handlers/job-handlers.service";
import { FileJobs } from "../file-jobs";
import { IMAGE_WIDTHS, variantsOf } from "../file-rules";
import { ids, makeAccount, stage } from "./files-kit";

/** API-BASE-22: the file job with the real adapter bound (over the stand-in storage): the sizes the product reads, and a failed resize. */
const NOW = new Date("2025-06-01T09:00:00.000Z");
holdSettingLockForFile();

describe("API-BASE-22: make-image-sizes with SharpImageSizes bound", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;

  beforeAll(async () => {
    t = await createTestApp({
      now: NOW,
      configure: (b) => b.overrideProvider(ImageSizesPort).useFactory({ factory: (s: StoragePort) => new SharpImageSizes(s), inject: [StoragePort] }),
    });
    db = t.app.get(PrismaService);
    jobs = t.app.get(JobsService);
    t.app.get(JobHandlers).registerAll();
  });
  afterAll(() => t.close());

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  async function confirmed(bytes: Buffer, type: string): Promise<{ id: string; key: string }> {
    const me = await makeAccount(db, t);
    const ticket = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose: "photo", contentType: type, bytes: bytes.length });
    const id = ticket.body.id as string;
    await stage(t, db, id, bytes, type);
    const c = await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id });
    expect(c.status).toBe(200);
    return { id, key: (await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey };
  }
  const jobOf = (id: string) => db.job.findUniqueOrThrow({ where: { type_subjectId: { type: "make_image_sizes", subjectId: id } } });

  it("the tick makes widths 320, 768 and 1600 as real, smaller pictures under their own keys; the full-size clean copy stays", async () => {
    expect([...IMAGE_WIDTHS]).toEqual([320, 768, 1600]); // the widths the file view lists (variant w320, w768, w1600) and a signed read asks for
    const original = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c8693a" } }).jpeg().toBuffer();
    const { id, key } = await confirmed(original, "image/jpeg");
    expect(await jobs.runDue(100, [id])).toBe(1);
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ready");
    const got: number[] = [];
    for (const v of variantsOf(row)) {
      const bytes = (await t.storage.readObject(v.key, 50 * 1024 * 1024)) as Buffer;
      expect((await sharp(bytes).metadata()).width).toBe(v.width);
      got.push(v.width);
    }
    expect(got.sort((a, b) => a - b)).toEqual([320, 768, 1600]);
    // API-BASE-23 (IM1): what is kept at the file's own key is now the clean copy of the original (same size, no metadata), not the untouched bytes
    const kept = (await t.storage.readObject(key, 50 * 1024 * 1024)) as Buffer;
    expect([(await sharp(kept).metadata()).width, (await sharp(kept).metadata()).height]).toEqual([2400, 1600]);
    expect((await sharp(kept).metadata()).exif).toBeUndefined();
    expect((await jobOf(id)).status).toBe("succeeded");
  });

  it("a picture that cannot be sized leaves the file ready and usable at its original; the job is tried again with a wait, then parked after its tries, with the words recorded", async () => {
    // API-BASE-23 (IM1): confirm now refuses a picture it cannot open, so a file the sizing job cannot read is a row that is already confirmed (made here, marked clean) with bytes the library cannot decode
    const me = await makeAccount(db, t);
    const id = ids.next();
    const key = `wish-photo/${id}/undecodable`;
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]);
    t.storage.put(key, broken, "image/jpeg");
    await db.storedFile.create({ data: { id, ownerAccountId: me.id, purpose: "wish_photo", status: "ready", contentType: "image/jpeg", bytes: BigInt(broken.length), objectKey: key, variants: [], driver: "r2", cleanAt: NOW } as never });
    await db.job.create({ data: { id: ids.next(), type: "make_image_sizes" as never, subjectId: id, runAt: NOW, status: "scheduled", attempts: 0 } });
    const original = (await t.storage.readObject(key, 1024 * 1024)) as Buffer;
    expect(await jobs.runDue(100, [id])).toBe(1);
    let job = await jobOf(id);
    expect(job.status).toBe("failed"); // waits to be tried again (30 s, then 60 s, ...)
    expect(job.attempts).toBe(1);
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ready");
    expect(variantsOf(row)).toEqual([]);
    expect((await t.storage.readObject(key, 1024 * 1024))?.equals(original)).toBe(true); // the original is still served
    const runs = await db.jobRun.findMany({ where: { jobId: job.id } });
    expect(JSON.stringify(runs)).toContain("This picture could not be read");
    // the later tries: the file job keeps failing the same way until MAX_TRIES, then it is parked (dead) for staff
    for (let n = 2; n <= MAX_TRIES; n++) {
      await db.job.update({ where: { id: job.id }, data: { runAt: NOW } });
      expect(await jobs.runDue(100, [id])).toBe(1);
    }
    job = await jobOf(id);
    expect(job.status).toBe("dead");
    expect(job.attempts).toBe(MAX_TRIES);
    expect(variantsOf(await db.storedFile.findUniqueOrThrow({ where: { id } }))).toEqual([]);
    // and a person asking for a size meets the plain "no such size", while the original reads
    await expect(t.app.get(FileJobs).makeImageSizes(id)).rejects.toThrow("could not be read");
  });
});
