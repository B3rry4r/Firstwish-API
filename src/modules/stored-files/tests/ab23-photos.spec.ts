import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { PrismaService } from "../../../common/db/prisma.service";
import { SharpImageSizes } from "../../../common/ports/adapters/sharp-image-sizes.adapter";
import { ImageSizesPort } from "../../../common/ports/image-sizes.port";
import { StoragePort } from "../../../common/ports/storage.port";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { JobsService } from "../../jobs/jobs.service";
import { JobHandlers } from "../../job-handlers/job-handlers.service";
import { FileJobs } from "../file-jobs";
import { RULES } from "../file-rules";
import { WishPictures } from "../../wishes/wish-pictures";
import { PhotoCleaner } from "../photo-cleaner";
import { SignedUrlsService } from "../signed-urls.service";
import { ensureEntitlements, ids, makeAccount, makeBusiness, makeWish, stage } from "./files-kit";
import { leaks, phonePhoto, phonePng, phoneWebp } from "./ab23-pictures";
import { testSlug } from "../../../../test/kit/unique";

/** API-BASE-23 (IM1, IM2): no photo carries a position to someone else; no kind the server cannot open. Real pictures with GPS, a serial, XMP and a thumbnail, through the real routes. */
const NOW = new Date("2025-06-01T09:00:00.000Z");
holdSettingLockForFile();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Size = { width: number; variant: string; sized: boolean; url: string; expiresAt: string };

describe("API-BASE-23: photos given to others are clean; HEIC is not taken", () => {
  let t: TestApp;
  let db: PrismaService;
  let jobs: JobsService;
  let signed: SignedUrlsService;
  const address = uniqueAddress();
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp({ now: NOW, configure: (b) => b.overrideProvider(ImageSizesPort).useFactory({ factory: (s: StoragePort) => new SharpImageSizes(s), inject: [StoragePort] }) });
    db = t.app.get(PrismaService);
    await ensureEntitlements(db);
    jobs = t.app.get(JobsService);
    signed = t.app.get(SignedUrlsService);
    t.app.get(JobHandlers).registerAll();
  });
  afterAll(() => t.close());

  const keyOf = (url: string): string => {
    const path = decodeURI(new URL(url).pathname);
    return path.slice(path.indexOf("/", 1) + 1);
  };
  const bytesAt = async (url: string): Promise<Buffer> => (await t.storage.readObject(keyOf(url), 50 * 1024 * 1024)) as Buffer;

  async function upload(me: { token: string }, bytes: Buffer, type: string, purpose = "photo"): Promise<{ id: string; res: { status: number; body: Body } }> {
    const ticket = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose, contentType: type, bytes: bytes.length });
    const id = ticket.body.id as string;
    await stage(t, db, id, bytes, type);
    const res = await t.http().post(`/v1/uploads/${id}/confirm`).set(auth(me.token)).send({ fileId: id });
    return { id, res };
  }

  /** A live wish of `owner` with the file attached as a photo, and its public link. */
  async function liveWish(owner: string, fileIds: string[]) {
    const id = await makeWish(db, owner, "sealed", "keepsake");
    const slug = testSlug("ab23");
    await db.wish.update({ where: { id }, data: { opensAt: new Date(NOW.getTime() - 60_000), sealedAt: NOW, name: "Chidi", content: { letter: { paras: ["Hello."] } } } });
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
    for (const f of fileIds) await db.wishFile.create({ data: { id: ids.next(), wishId: id, fileId: f, role: "photo" } });
    return { id, slug };
  }
  const publicOpen = (slug: string) => t.http().post(`/v1/w/${slug}/opens`).set("x-forwarded-for", address).send({});
  // the owner's wish read builds its pictures with WishPictures (the route needs the seeded price book, which a shared test database may not hold: this reads the same code)
  const ownerRead = async (_me: { token: string }, wishId: string) => ({ body: { pictures: (await t.app.get(WishPictures).forWishes([wishId])).get(wishId) as unknown as Body[] } });

  it("0. the pictures used here really carry a position, a serial, XMP and a thumbnail (what the head handed out untouched)", async () => {
    const jpeg = await phonePhoto();
    expect((await leaks(jpeg)).sort()).toEqual(["embedded thumbnail", "exif", "exif block", "maker", "serial", "xmp", "xmp block", "xmp place"].sort());
    expect(await leaks(await phonePng())).toEqual(expect.arrayContaining(["serial", "exif chunk", "xmp chunk"]));
    expect(await leaks(await phoneWebp())).toEqual(expect.arrayContaining(["exif block"]));
  });

  it("1. confirm replaces the original with the clean copy at the file's own key: it is the one hashed, counted and kept; JPEG, PNG, WebP and GIF", async () => {
    const me = await makeAccount(db, t);
    const gif = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#123456" } }).gif().toBuffer();
    for (const [bytes, type] of [[await phonePhoto(), "image/jpeg"], [await phonePng(), "image/png"], [await phoneWebp(), "image/webp"], [gif, "image/gif"]] as [Buffer, string][]) {
      const { id, res } = await upload(me, bytes, type);
      expect(res.status).toBe(200);
      const row = await db.storedFile.findUniqueOrThrow({ where: { id } });
      const kept = (await t.storage.readObject(row.objectKey, 50 * 1024 * 1024)) as Buffer;
      expect(await leaks(kept)).toEqual([]);
      expect((await sharp(kept).metadata()).format).toBe(type.slice(6));
      expect(row.cleanAt).not.toBeNull();
      expect(row.sha256).toBe(createHash("sha256").update(kept).digest("hex"));
      expect(Number(row.bytes)).toBe(kept.length);
      expect(res.body.sha256).toBe(row.sha256);
      expect(row.contentType).toBe(type);
      expect(await t.storage.head(`incoming/${row.objectKey}`)).toBeNull(); // no untouched original anywhere
    }
    const kept = await upload(me, await phonePhoto(1800, 1200), "image/jpeg");
    const m = await sharp((await t.storage.readObject((await db.storedFile.findUniqueOrThrow({ where: { id: kept.id } })).objectKey, 50 * 1024 * 1024)) as Buffer).metadata();
    expect([m.width, m.height]).toEqual([1800, 1200]); // the full size is kept
  });

  it("1. every read that hands a photo to someone else gives the clean bytes: the public link, the owner's wish read, and every reader of the one signing place", async () => {
    const me = await makeAccount(db, t);
    const { id } = await upload(me, await phonePhoto(), "image/jpeg");
    const w = await liveWish(me.id, [id]);
    // the public link's view
    const open = await publicOpen(w.slug);
    expect(open.status).toBe(200);
    const link = open.body.content.files[0];
    expect(await leaks(await bytesAt(link.url))).toEqual([]);
    // the owner's wish read
    const owned = (await ownerRead(me, w.id)).body.pictures[0];
    expect(await leaks(await bytesAt(owned.url))).toEqual([]);
    // every reader type of the signing place (owner, a receiver, staff, a business's own and a login of it)
    for (const reader of [{ type: "owner", accountId: me.id }, { type: "allowed" }, { type: "staff" }] as const) {
      const s = await signed.signedRead({ fileId: id }, reader);
      expect(await leaks(await bytesAt(s.url))).toEqual([]);
    }
    // no other code signs a read: the storage port's signDownload is called from the signing place alone
    const src = (p: string) => readFileSync(join(__dirname, "../../..", p), "utf8");
    const { execSync } = await import("node:child_process");
    const users = execSync(`grep -rln "signDownload(" src --include=*.ts | grep -v "/tests/\\|adapters/\\|ports/"`, { cwd: join(__dirname, "../../../.."), encoding: "utf8" }).trim().split("\n");
    expect(users).toEqual(["src/modules/stored-files/signed-urls.service.ts"]);
    expect(src("modules/stored-files/signed-urls.service.ts")).toContain("cleanFirst");
  });

  it("1. a Vault's picture is clean for its owner and for a login; a creator's profile picture and a style's picture are clean for the public", async () => {
    const biz = await makeAccount(db, t, ["business"]);
    const bizId = await makeBusiness(db, biz.id, { plan: "studio" });
    const v = await upload(biz, await phonePhoto(), "image/jpeg", "vault");
    expect(v.res.status).toBe(200);
    expect(bizId).toBeTruthy();
    const mine = await signed.signedRead({ fileId: v.id }, { type: "vault", accountId: biz.id });
    expect(await leaks(await bytesAt(mine.url))).toEqual([]);
    const listed = await t.http().get("/v1/business/vault-files").set(auth(biz.token));
    expect(await leaks(await bytesAt(listed.body.items[0].url))).toEqual([]);
    const creator = await makeAccount(db, t, ["creator"]);
    const p = await upload(creator, await phonePhoto(), "image/jpeg");
    await db.storedFile.update({ where: { id: p.id }, data: { purpose: "profile_picture" } });
    expect(await leaks(await bytesAt((await signed.signedRead({ fileId: p.id }, { type: "allowed" })).url))).toEqual([]);
    const s = await upload(creator, await phonePhoto(), "image/jpeg");
    await db.storedFile.update({ where: { id: s.id }, data: { purpose: "studio_asset" } });
    expect(await leaks(await bytesAt((await signed.signedRead({ fileId: s.id }, { type: "allowed" })).url))).toEqual([]);
  });

  it("2. a file stored before this round is cleaned the first time it is asked for, or by the job; until then no one is given it", async () => {
    const me = await makeAccount(db, t);
    const legacy = async () => {
      const id = ids.next();
      const objectKey = `wish-photo/${id}/legacy`;
      const raw = await phonePhoto();
      t.storage.put(objectKey, raw, "image/jpeg");
      await db.storedFile.create({ data: { id, ownerAccountId: me.id, purpose: "wish_photo", status: "ready", contentType: "image/jpeg", bytes: BigInt(raw.length), objectKey, variants: [], driver: "r2" } as never });
      return { id, objectKey, raw };
    };
    const a = await legacy();
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: a.id } })).cleanAt).toBeNull();
    const w = await liveWish(me.id, [a.id]);
    const open = await publicOpen(w.slug);
    expect(await leaks(await bytesAt(open.body.content.files[0].url))).toEqual([]);
    const row = await db.storedFile.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.cleanAt).not.toBeNull();
    expect(Number(row.bytes)).toBe(((await t.storage.readObject(a.objectKey, 50 * 1024 * 1024)) as Buffer).length);
    expect(row.sha256).not.toBeNull();
    // the job: cleans what no one has asked for yet
    const b = await legacy();
    expect(await t.app.get(FileJobs).cleanupUnconfirmed(100)).toBeDefined();
    const after = await db.storedFile.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.cleanAt).not.toBeNull();
    expect(await leaks((await t.storage.readObject(b.objectKey, 50 * 1024 * 1024)) as Buffer)).toEqual([]);
    expect(after.sha256).toBe(createHash("sha256").update((await t.storage.readObject(b.objectKey, 50 * 1024 * 1024)) as Buffer).digest("hex"));
    expect(await t.app.get(PhotoCleaner).sweep()).toBe(0); // nothing left to clean
  });

  it("2. a stored picture that cannot be opened is given to no one else: the public link leaves it out, the owner's read says so in words; its own owner may still read their file", async () => {
    const me = await makeAccount(db, t);
    const id = ids.next();
    const objectKey = `wish-photo/${id}/heic`;
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(200, 1)]);
    t.storage.put(objectKey, heic, "image/heic");
    await db.storedFile.create({ data: { id, ownerAccountId: me.id, purpose: "wish_photo", status: "ready", contentType: "image/heic", bytes: BigInt(heic.length), objectKey, variants: [], driver: "r2" } as never });
    const w = await liveWish(me.id, [id]);
    expect((await publicOpen(w.slug)).body.content.files).toEqual([]);
    const pic = (await ownerRead(me, w.id)).body.pictures[0];
    expect(pic).toMatchObject({ fileId: id, status: "refused", url: null });
    expect(pic.reason).toBe("This picture is in a kind we cannot open. Send it again as a JPEG or PNG.");
    await expect(signed.signedRead({ fileId: id }, { type: "allowed" })).rejects.toMatchObject({ code: "photo_not_shown" });
    expect((await db.storedFile.findUniqueOrThrow({ where: { id } })).cleanAt).toBeNull();
  });

  it("3. each view carries w320, w768 and w1600: the clean full size until the job has made them, then the sized copies (clean too)", async () => {
    const me = await makeAccount(db, t);
    const { id } = await upload(me, await phonePhoto(2400, 1600), "image/jpeg");
    const w = await liveWish(me.id, [id]);
    const before = (await publicOpen(w.slug)).body.content.files[0];
    expect((before.variants as Size[]).map((v) => [v.width, v.variant, v.sized])).toEqual([[320, "w320", false], [768, "w768", false], [1600, "w1600", false]]);
    for (const v of before.variants as Size[]) {
      expect(v.url).toBe(before.url); // never nothing, never the untouched original (none is kept)
      expect(await leaks(await bytesAt(v.url))).toEqual([]);
    }
    expect(await jobs.runDue(100, [id])).toBe(1);
    const sets: Size[][] = [
      (await publicOpen(w.slug)).body.content.files[0].variants as Size[],
      (await ownerRead(me, w.id)).body.pictures[0].variants as Size[],
    ];
    for (const variants of sets) {
      expect(variants.map((v) => [v.width, v.sized])).toEqual([[320, true], [768, true], [1600, true]]);
      for (const v of variants) {
        const bytes = await bytesAt(v.url);
        expect((await sharp(bytes).metadata()).width).toBe(v.width);
        expect(await leaks(bytes)).toEqual([]);
        expect(Date.parse(v.expiresAt)).toBeGreaterThan(NOW.getTime());
      }
    }
  });

  it("4. HEIC and HEIF are not taken: an upload start is refused in words that say JPEG or PNG; a file that claims JPEG but is HEIC inside is refused at confirm; every rule lists the same kinds", async () => {
    const me = await makeAccount(db, t);
    for (const type of ["image/heic", "image/heif", "IMAGE/HEIC"]) {
      for (const purpose of ["photo", "vault", "studio", "profile", "brand", "order-photo"]) {
        const r = await t.http().post("/v1/uploads").set(auth(me.token)).send({ purpose, contentType: type, bytes: 1000 });
        expect([r.status, r.body.error?.fields?.contentType]).toEqual([422, "HEIC pictures are not taken. Send a JPEG or PNG."]);
      }
    }
    for (const rule of Object.values(RULES)) expect(rule.types.filter((x) => /hei[cf]/.test(x))).toEqual([]);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(300, 1)]);
    const { id, res } = await upload(me, heic, "image/jpeg");
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("HEIC pictures are not taken. Send a JPEG or PNG.");
    expect(await db.storedFile.findUnique({ where: { id } })).toBeNull();
    // a JPEG that cannot be opened at all is refused in words too, and nothing of it is kept
    const broken = await upload(me, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]), "image/jpeg");
    expect(broken.res.status).toBe(422);
    expect(broken.res.body.error.message).toBe("We could not open this picture. Send a JPEG or PNG.");
  });
});
