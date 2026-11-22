import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { testWishNo } from "../../../../test/kit/unique";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2034-07-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = `${process.pid}${Date.now() % 100000}`;
let seq = 0;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(40)]);
const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(40)]);

// the book's limits are shared by every spec in the run's database: hold the setting lock for the file
holdSettingLockForFile();

/** API-BASE-12 case 2 (HW2): the signed reads of a creator's Studio files and profile picture exist; this proves them for the creator and the public. */
describe("HW2 reads: Studio files and the profile picture, for the creator and for the public", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function creator() {
    const id = ids.next();
    const handle = `ab12r${run}${++seq}`.toLowerCase().slice(0, 20);
    await db.account.create({ data: { id, contact: `ab12r-${run}-${seq}@example.com`, name: "Maker", handle, sides: ["person", "creator"], lastSide: "creator" } });
    await db.creator.create({ data: { id: ids.next(), accountId: id, name: "Maker" } });
    t.tokens.set(`c-${id}`, { kind: "user", accountId: id, sides: ["person", "creator"] });
    return { id, handle, auth: { authorization: `Bearer c-${id}` } };
  }
  async function style(accountId: string, status: string) {
    const id = ids.next();
    await db.studioStyle.create({ data: { id, accountId, status, document: { id, name: "Style" }, version: 0 } });
    return id;
  }
  async function upload(c: { auth: Record<string, string> }, body: Record<string, unknown>, bytes: Buffer, type: string) {
    const tk = await t.http().post("/v1/uploads").set(c.auth).send({ contentType: type, bytes: bytes.length, ...body });
    expect(tk.status).toBe(201);
    const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
    expect(t.storage.putSigned(key, bytes, type)).toBe(true);
    const cf = await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(c.auth).send({ fileId: tk.body.id });
    expect(cf.status).toBe(200);
    return tk.body.id as string;
  }
  const slugWish = async (styleSlug: string) => {
    const owner = await creator();
    const wid = ids.next();
    await db.wish.create({ data: { id: wid, accountId: owner.id, status: "live", kind: "birthday", occasion: "birthday", styleSlug, timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - DAY), openedAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 5 * DAY) } as never });
    const slug = `ab12-l-${run}-${++seq}`;
    await db.wishLink.create({ data: { id: ids.next(), slug, wishId: wid, active: true } });
    return slug;
  };

  it("a picture, a poster, a sound and a 3D model each read by a short-lived signed address for the creator, a held one too; another creator and the public get 404", async () => {
    const c = await creator();
    const other = await creator();
    const s = await style(c.id, "draft");
    const files = {
      picture: await upload(c, { purpose: "picture", styleId: s }, PNG, "image/png"),
      poster: await upload(c, { purpose: "poster", styleId: s }, PNG, "image/png"),
      sound: await upload(c, { purpose: "sound", styleId: s }, MP3, "audio/mpeg"),
      model: await upload(c, { purpose: "model", styleId: s }, GLB, "model/gltf-binary"),
    };
    const list = await t.http().get(`/v1/studio/styles/${s}/files`).set(c.auth);
    expect(list.status).toBe(200);
    expect((list.body.items as { kind: string }[]).map((i) => i.kind).sort()).toEqual(["image", "image", "model", "sound"]);
    for (const i of list.body.items as { url: string; expiresAt: string }[]) {
      expect(i.url).toMatch(/^https:\/\//);
      const left = Date.parse(i.expiresAt) - NOW.getTime();
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(10 * 60 * 1000);
    }
    // a file held in screening is the owner's to see, not the public's
    await db.storedFile.update({ where: { id: files.sound }, data: { status: "screening" } });
    const held = await t.http().get(`/v1/studio/styles/${s}/files/${files.sound}`).set(c.auth);
    expect(held.status).toBe(200);
    expect(held.body).toMatchObject({ status: "screening", kind: "sound" });
    expect(held.body.url).toMatch(/^https:\/\//);
    for (const id of Object.values(files)) expect((await t.http().get(`/v1/studio/styles/${s}/files/${id}`).set(other.auth)).status).toBe(404);
    expect((await t.http().get(`/v1/studio/styles/${s}/files`).set(other.auth)).status).toBe(404);
    expect((await t.http().get(`/v1/studio/styles/${s}/files`)).status).toBe(401);
    // a file of one style is not read through another of the same creator
    const s2 = await style(c.id, "draft");
    expect((await t.http().get(`/v1/studio/styles/${s2}/files/${files.picture}`).set(c.auth)).status).toBe(404);
  });

  it("the public reads a style's files only once it is approved, only those that passed screening and only that style's own", async () => {
    const c = await creator();
    const approved = await style(c.id, "live");
    const slug = `ab12-ap-${run}`;
    await db.style.create({ data: { id: approved, slug, name: "Approved", on: true, level: "starter" } });
    const ok = await upload(c, { purpose: "picture", styleId: approved }, PNG, "image/png");
    const held = await upload(c, { purpose: "poster", styleId: approved }, PNG, "image/png");
    const snd = await upload(c, { purpose: "sound", styleId: approved }, MP3, "audio/mpeg");
    const mdl = await upload(c, { purpose: "model", styleId: approved }, GLB, "model/gltf-binary");
    await db.storedFile.update({ where: { id: held }, data: { status: "screening" } });
    const draft = await style(c.id, "draft");
    await upload(c, { purpose: "picture", styleId: draft }, PNG, "image/png");
    const link = await slugWish(slug);
    const read = await t.http().get(`/v1/w/${link}/style-files`);
    expect(read.status).toBe(200);
    expect(read.body.style).toBe(slug);
    expect((read.body.items as { fileId: string }[]).map((i) => i.fileId).sort()).toEqual([ok, snd, mdl].sort());
    for (const i of read.body.items as { url: string; expiresAt: string; status: string }[]) {
      expect(i.status).toBe("ready");
      expect(i.url).toMatch(/^https:\/\//);
      expect(Date.parse(i.expiresAt) - NOW.getTime()).toBeLessThanOrEqual(10 * 60 * 1000);
    }
    // the style taken off the catalogue, or sent back to a draft, gives the public nothing
    await db.style.update({ where: { id: approved }, data: { on: false } });
    expect((await t.http().get(`/v1/w/${link}/style-files`)).body.items).toEqual([]);
    await db.style.update({ where: { id: approved }, data: { on: true } });
    await db.studioStyle.update({ where: { id: approved }, data: { status: "draft" } });
    expect((await t.http().get(`/v1/w/${link}/style-files`)).body.items).toEqual([]);
  });

  it("a profile picture is read by a signed address: by the creator (a held one too, on /me) and by the public once it passed screening", async () => {
    const c = await creator();
    const pic = await upload(c, { purpose: "profile" }, PNG, "image/png");
    const mine = await t.http().get("/v1/me").set(c.auth);
    expect(mine.body.picture).toMatchObject({ fileId: pic });
    expect(mine.body.picture.url).toMatch(/^https:\/\//);
    expect(Date.parse(mine.body.picture.expiresAt) - NOW.getTime()).toBeLessThanOrEqual(10 * 60 * 1000);
    const pub = await t.http().get(`/v1/creators/${c.handle}`);
    expect(pub.body.img).toMatch(/^https:\/\//);
    await db.storedFile.update({ where: { id: pic }, data: { status: "screening" } });
    const heldMine = await t.http().get("/v1/me").set(c.auth);
    expect(heldMine.body.picture).toMatchObject({ fileId: pic });
    expect(heldMine.body.picture.url).toMatch(/^https:\/\//);
    expect((await t.http().get(`/v1/creators/${c.handle}`)).body.img).toBeNull();
    const other = await creator();
    expect((await t.http().get("/v1/me").set(other.auth)).body.picture).toBeNull();
  });
});
