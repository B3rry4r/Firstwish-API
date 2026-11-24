import sharp from "sharp";
import { PrismaService } from "../../../common/db/prisma.service";
import { SharpImageSizes } from "../../../common/ports/adapters/sharp-image-sizes.adapter";
import { StandinMediaClean } from "../../../common/ports/adapters/standins";
import { CleanInput, ImageSizesPort, ResizeInput } from "../../../common/ports/image-sizes.port";
import { MediaCleanInput, MediaCleanPort } from "../../../common/ports/media-clean.port";
import { PortTimeoutError } from "../../../common/ports/time-limit";
import { StoragePort } from "../../../common/ports/storage.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { PhotoCleaner } from "../photo-cleaner";
import { stagingKeyOf } from "../file-rules";
import { JPEG, makeAccount, stage } from "./files-kit";

/** API-BASE-23 round 1 (M1, M2): a clean that fails on the server's side keeps the upload; an erase between the read and the put leaves no object. */
const NOW = new Date("2025-06-01T09:00:00.000Z");
holdSettingLockForFile();

class HookedSizes extends ImageSizesPort {
  failNext: Error | null = null;
  afterClean: (() => Promise<void>) | null = null;
  constructor(private readonly real: SharpImageSizes) {
    super();
  }
  ping() {
    return this.real.ping();
  }
  resize(i: ResizeInput) {
    return this.real.resize(i);
  }
  async clean(input: CleanInput) {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const out = await this.real.clean(input);
    if (this.afterClean) await this.afterClean();
    return out;
  }
}
class HookedMedia extends MediaCleanPort {
  afterClean: (() => Promise<void>) | null = null;
  constructor(private readonly real: StandinMediaClean) {
    super();
  }
  ping() {
    return this.real.ping();
  }
  async clean(i: MediaCleanInput) {
    const out = await this.real.clean(i);
    if (this.afterClean) await this.afterClean();
    return out;
  }
}

describe("API-BASE-23 round 1: M1 server-side clean failure keeps the upload; M2 erase during a stored clean", () => {
  let t: TestApp;
  let db: PrismaService;
  let sizes: HookedSizes;
  let media: HookedMedia;
  beforeAll(async () => {
    t = await createTestApp({
      now: NOW,
      configure: (b) =>
        b
          .overrideProvider(ImageSizesPort)
          .useFactory({ factory: (s: StoragePort) => (sizes = new HookedSizes(new SharpImageSizes(s))), inject: [StoragePort] })
          .overrideProvider(MediaCleanPort)
          .useFactory({ factory: () => (media = new HookedMedia(new StandinMediaClean())), inject: [] }),
    });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  async function ticket(purpose: string, contentType: string, bytes: Buffer) {
    const me = await makeAccount(db, t);
    const r = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose, contentType, bytes: bytes.length });
    const id = r.body.id as string;
    await stage(t, db, id, bytes, contentType);
    return { me, id };
  }
  const confirm = (token: string, id: string) => t.http().post(`/v1/uploads/${id}/confirm`).set(auth(token)).send({ fileId: id });
  const exists = async (k: string) => !!(await t.storage.readObject(k, 1 << 30));

  const photo = () => sharp({ create: { width: 800, height: 600, channels: 3, background: "#c8693a" } }).jpeg().toBuffer();

  it.each([
    ["the port's time limit", () => new PortTimeoutError("imageSizes", "clean", 60_000)],
    ["storage down", () => new Error("connect ECONNREFUSED storage")],
  ])("M1: %s answers 503 with words, keeps the upload unconfirmed, and a second confirm succeeds", async (_n, mk) => {
    const { me, id } = await ticket("photo", "image/jpeg", await photo());
    sizes.failNext = mk();
    const first = await confirm(me.token, id);
    expect(first.status).toBe(503);
    expect(String(first.body.error?.message ?? first.body.message ?? "")).toMatch(/try again/i);
    const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("pending");
    expect(row.cleanAt).toBeNull();
    expect(await exists(stagingKeyOf(row.objectKey))).toBe(true);
    const second = await confirm(me.token, id);
    expect(second.status).toBe(200);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id } })).cleanAt).not.toBeNull();
  });

  it("M1: a picture that cannot be opened is still refused 422 and deleted", async () => {
    const { me, id } = await ticket("photo", "image/jpeg", JPEG(2000));
    const key = (await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey;
    const r = await confirm(me.token, id);
    expect(r.status).toBe(422);
    expect(await db.storedFile.findUnique({ where: { id } })).toBeNull();
    expect(await exists(key)).toBe(false);
  });

  async function legacy(purpose: string, contentType: string, bytes: Buffer) {
    const { me, id } = await ticket(purpose, contentType, bytes);
    expect((await confirm(me.token, id)).status).toBe(200);
    await db.storedFile.update({ where: { id }, data: { cleanAt: null } });
    return { id, row: await db.storedFile.findUniqueOrThrow({ where: { id } }) };
  }
  const erase = (id: string) => db.storedFile.delete({ where: { id } });

  it("M2: a stored photo erased between the read and the put leaves no object under its keys", async () => {
    const f = await legacy("photo", "image/jpeg", await photo());
    // the erase lands after the clean has written its copy (the object is back under the key): the row is gone
    sizes.afterClean = async () => void (await erase(f.id));
    const out = await t.app.get(PhotoCleaner).cleanStored(f.row);
    sizes.afterClean = null;
    expect(out).toBe(false);
    expect(await db.storedFile.findUnique({ where: { id: f.id } })).toBeNull();
    expect(await exists(f.row.objectKey)).toBe(false);
    expect(await exists(stagingKeyOf(f.row.objectKey))).toBe(false);
  });

  it("M2: the same for the media clean of a stored voice", async () => {
    const f = await legacy("voice", "audio/mpeg", Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]), Buffer.alloc(500, 1)]));
    media.afterClean = async () => void (await erase(f.id));
    const out = await t.app.get(PhotoCleaner).cleanStored(f.row);
    media.afterClean = null;
    expect(out).toBe(false);
    expect(await exists(f.row.objectKey)).toBe(false);
  });
});
