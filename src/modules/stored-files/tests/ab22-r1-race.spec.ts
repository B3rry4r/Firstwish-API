import sharp from "sharp";
import { PrismaService } from "../../../common/db/prisma.service";
import { SharpImageSizes } from "../../../common/ports/adapters/sharp-image-sizes.adapter";
import { ImageSizesPort, CleanInput, ResizeInput } from "../../../common/ports/image-sizes.port";
import { StoragePort } from "../../../common/ports/storage.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { FileJobs } from "../file-jobs";
import { IMAGE_WIDTHS } from "../file-rules";
import { makeAccount, stage } from "./files-kit";

/** API-BASE-22 round 1 (M1, L3): a photo erased while its sizing job runs leaves nothing behind; the source is read once for the three sizes. */
const NOW = new Date("2025-06-01T09:00:00.000Z");
holdSettingLockForFile();

/** The real adapter, with a hook that runs after the nth resize has written its copy (an erase landing at that moment). */
class HookedSizes extends ImageSizesPort {
  calls = 0;
  hook: { after: number; run: () => Promise<void> } | null = null;
  constructor(private readonly real: SharpImageSizes) {
    super();
  }
  ping() {
    return this.real.ping();
  }
  clean(input: CleanInput) {
    return this.real.clean(input);
  }
  async resize(input: ResizeInput): Promise<void> {
    await this.real.resize(input);
    this.calls++;
    if (this.hook && this.hook.after === this.calls) await this.hook.run();
  }
}

describe("API-BASE-22 round 1: an erase during the sizing job; one read of the source", () => {
  let t: TestApp;
  let db: PrismaService;
  let hooked: HookedSizes;
  beforeAll(async () => {
    t = await createTestApp({
      now: NOW,
      configure: (b) =>
        b.overrideProvider(ImageSizesPort).useFactory({
          factory: (s: StoragePort) => (hooked = new HookedSizes(new SharpImageSizes(s))),
          inject: [StoragePort],
        }),
    });
    db = t.app.get(PrismaService);
  });
  afterAll(() => t.close());

  async function confirmed(): Promise<{ id: string; key: string; owner: string }> {
    const me = await makeAccount(db, t);
    const bytes = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c8693a" } }).jpeg().toBuffer();
    const ticket = await t.http().post("/v1/uploads").set({ authorization: `Bearer ${me.token}` }).send({ purpose: "photo", contentType: "image/jpeg", bytes: bytes.length });
    const id = ticket.body.id as string;
    await stage(t, db, id, bytes, "image/jpeg");
    expect((await t.http().post(`/v1/uploads/${id}/confirm`).set({ authorization: `Bearer ${me.token}` }).send({ fileId: id })).status).toBe(200);
    return { id, key: (await db.storedFile.findUniqueOrThrow({ where: { id } })).objectKey, owner: me.id };
  }
  const left = async (key: string) => {
    const out: string[] = [];
    for (const k of [key, `incoming/${key}`, ...IMAGE_WIDTHS.map((w) => `${key}.w${w}`)]) if (await t.storage.readObject(k, 1 << 30)) out.push(k);
    return out;
  };

  it.each([
    ["between w320 and w768", 1],
    ["after the last write, before the row is saved", 3],
  ])("M1: a photo erased %s leaves no object under its keys", async (_name, after) => {
    const f = await confirmed();
    hooked.calls = 0;
    hooked.hook = { after, run: async () => void (await t.app.get(FileJobs).eraseFilesOf(f.owner)) };
    await t.app.get(FileJobs).makeImageSizes(f.id).catch(() => undefined);
    hooked.hook = null;
    expect(await db.storedFile.findUnique({ where: { id: f.id } })).toBeNull();
    expect(await left(f.key)).toEqual([]);
  });

  it("M1: the erase deletes every sized key the rules can name, not only those listed in the row", async () => {
    const f = await confirmed();
    for (const w of IMAGE_WIDTHS) await t.storage.putObject(`${f.key}.w${w}`, Buffer.from("x"), "image/jpeg");
    expect(await db.storedFile.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ variants: [] });
    await t.app.get(FileJobs).eraseFilesOf(f.owner);
    expect(await left(f.key)).toEqual([]);
  });

  it("L3: the source is read from storage once for the three sizes", async () => {
    const f = await confirmed();
    const real = t.storage.readObject.bind(t.storage);
    const reads: string[] = [];
    const spy = jest.spyOn(t.storage, "readObject").mockImplementation((k, m) => {
      reads.push(k);
      return real(k, m);
    });
    try {
      expect((await t.app.get(FileJobs).makeImageSizes(f.id)).made).toBe(3);
    } finally {
      spy.mockRestore();
    }
    expect(reads.filter((k) => k === f.key)).toHaveLength(1);
  });
});
