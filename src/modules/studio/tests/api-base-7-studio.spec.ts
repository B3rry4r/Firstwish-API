import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { FileJobs } from "../../stored-files/file-jobs";
import { SettlementService } from "../../payments/settlement.service";
import { testWishNo, RUN, testHex } from "../../../../test/kit/unique";
import { ownDatabase } from "../../../../test/kit/own-db";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2034-05-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = RUN;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(40)]);
const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(40)]);

// F4: this spec moves the clock years ahead and runs the global file sweeps, which take any old unattached file in the database: it has a database of its own
const own = ownDatabase("ab7s");

/** API-BASE-7 cases 2, 3, 7 and 8 (HW2 Studio files, HW3 Signed off, HW5 the sweep, the wish list's publish). */
describe("HW2 Studio files, HW3 Signed off, HW5 sweep, wish list publish", () => {
  let t: TestApp;
  let db: PrismaService;

  beforeAll(async () => {
    own.use();
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });
  beforeEach(() => t.clock.set(NOW));

  async function creator() {
    const id = ids.next();
    const handle = `a${testHex()}`;
    await db.account.create({ data: { id, contact: `ab7s-${run}-${testHex()}@example.com`, name: "Maker", handle, sides: ["person", "creator"], lastSide: "creator" } });
    await db.creator.create({ data: { id: ids.next(), accountId: id, name: "Maker" } });
    t.tokens.set(`c-${id}`, { kind: "user", accountId: id, sides: ["person", "creator"] });
    return { id, handle, auth: { authorization: `Bearer c-${id}` } };
  }
  async function draft(accountId: string, status = "draft") {
    const id = ids.next();
    await db.studioStyle.create({ data: { id, accountId, status, document: { id, name: "Draft" }, version: 0 } });
    return id;
  }
  /** The whole upload path through the real routes: ticket, the signed put to the stand-in storage, confirm. */
  async function upload(c: { auth: Record<string, string> }, body: Record<string, unknown>, bytes: Buffer, type: string) {
    const tk = await t.http().post("/v1/uploads").set(c.auth).send({ contentType: type, bytes: bytes.length, ...body });
    if (tk.status !== 201) return { tk };
    const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
    expect(t.storage.putSigned(key, bytes, type)).toBe(true);
    const cf = await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(c.auth).send({ fileId: tk.body.id });
    return { tk, cf };
  }

  it("2. a creator uploads a style picture, a poster, a sound and a model to a DRAFT's style id, and a profile picture", async () => {
    const c = await creator();
    const s = await draft(c.id);
    const pic = await upload(c, { purpose: "picture", styleId: s }, PNG, "image/png");
    expect(pic.cf?.status).toBe(200);
    expect(pic.cf?.body).toMatchObject({ purpose: "studio-asset", kind: "image", styleId: s, status: "ready" });
    expect((await upload(c, { purpose: "poster", styleId: s }, PNG, "image/png")).cf?.body.kind).toBe("image");
    expect((await upload(c, { purpose: "sound", styleId: s }, MP3, "audio/mpeg")).cf?.body).toMatchObject({ kind: "sound", styleId: s });
    expect((await upload(c, { purpose: "model", styleId: s }, GLB, "model/gltf-binary")).cf?.body).toMatchObject({ kind: "model", styleId: s });
    // a sound is not a picture; a picture is not a model
    expect((await upload(c, { purpose: "picture", styleId: s }, MP3, "audio/mpeg")).tk.status).toBe(422);
    expect((await upload(c, { purpose: "model", styleId: s }, PNG, "image/png")).tk.status).toBe(422);
    // a profile picture
    const prof = await upload(c, { purpose: "profile" }, PNG, "image/png");
    expect(prof.cf?.body).toMatchObject({ purpose: "profile-picture", status: "ready" });
    expect((await db.creator.findFirstOrThrow({ where: { accountId: c.id } })).img).toBe(prof.tk.body.id);
  });

  it("2. the limits are the price book's: change one and the upload check moves with it", async () => {
    const c = await creator();
    const s = await draft(c.id);
    const row = await db.lifecycleConfig.findFirstOrThrow({ orderBy: { id: "desc" } });
    try {
      await db.lifecycleConfig.update({ where: { id: row.id }, data: { soundMaxBytes: 30, modelMaxBytes: 30, photoMaxBytes: 30 } });
      const big = await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "sound", styleId: s, contentType: "audio/mpeg", bytes: 31 });
      expect(big.status).toBe(422);
      expect(big.body.error.fields.bytes).toContain("Too large");
      expect((await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "model", styleId: s, contentType: "model/gltf-binary", bytes: 31 })).status).toBe(422);
      expect((await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "poster", styleId: s, contentType: "image/png", bytes: 31 })).status).toBe(422);
      expect((await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "sound", styleId: s, contentType: "audio/mpeg", bytes: 30 })).status).toBe(201);
    } finally {
      await db.lifecycleConfig.update({ where: { id: row.id }, data: { soundMaxBytes: row.soundMaxBytes, modelMaxBytes: row.modelMaxBytes, photoMaxBytes: row.photoMaxBytes } });
    }
  });

  it("2. the owner reads the files by signed read (list and one); another creator gets 404; a draft's files stay private", async () => {
    const c = await creator();
    const other = await creator();
    const s = await draft(c.id);
    const a = await upload(c, { purpose: "picture", styleId: s }, PNG, "image/png");
    await upload(c, { purpose: "sound", styleId: s }, MP3, "audio/mpeg");
    const list = await t.http().get(`/v1/studio/styles/${s}/files`).set(c.auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items[0]).toMatchObject({ fileId: a.tk.body.id, kind: "image", status: "ready" });
    expect(list.body.items[0].url).toMatch(/^https:\/\//);
    const one = await t.http().get(`/v1/studio/styles/${s}/files/${a.tk.body.id}`).set(c.auth);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ fileId: a.tk.body.id, purpose: "studio-asset" });
    expect(one.body.url).toBeTruthy();
    expect((await t.http().get(`/v1/studio/styles/${s}/files`).set(other.auth)).status).toBe(404);
    expect((await t.http().get(`/v1/studio/styles/${s}/files/${a.tk.body.id}`).set(other.auth)).status).toBe(404);
    expect((await t.http().post("/v1/uploads").set(other.auth).send({ purpose: "picture", styleId: s, contentType: "image/png", bytes: 10 })).status).toBe(404);
    expect((await t.http().get(`/v1/studio/styles/${s}/files`)).status).toBe(401);
  });

  it("2. a player of a wish in an APPROVED style reads that style's files; a draft's files are not readable by a player", async () => {
    const c = await creator();
    const approved = await draft(c.id, "live");
    const slug = `ab7-ap-${run}`;
    await db.style.create({ data: { id: approved, slug, name: "Approved", on: true, level: "starter" } });
    const f = await upload(c, { purpose: "picture", styleId: approved }, PNG, "image/png");
    const privateDraft = await draft(c.id);
    await upload(c, { purpose: "picture", styleId: privateDraft }, PNG, "image/png");
    const owner = await creator();
    const mk = async (styleSlug: string, n: number) => {
      const wid = ids.next();
      await db.wish.create({ data: { id: wid, accountId: owner.id, status: "live", kind: "birthday", occasion: "birthday", styleSlug, timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - DAY), openedAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 5 * DAY) } as never });
      const l = `ab7-l-${run}-${n}`;
      await db.wishLink.create({ data: { id: ids.next(), slug: l, wishId: wid, active: true } });
      return l;
    };
    const player = await t.http().get(`/v1/w/${await mk(slug, 1)}/style-files`);
    expect(player.status).toBe(200);
    expect(player.body.style).toBe(slug);
    expect(player.body.items).toHaveLength(1);
    expect(player.body.items[0]).toMatchObject({ fileId: f.tk.body.id, kind: "image", status: "ready" });
    expect(player.body.items[0].url).toMatch(/^https:\/\//);
    // a style that is still a draft (its row exists but it is not live) gives a player nothing
    const draftSlug = `ab7-dr-${run}`;
    await db.style.create({ data: { id: privateDraft, slug: draftSlug, name: "Draft", on: true, level: "starter" } });
    expect((await t.http().get(`/v1/w/${await mk(draftSlug, 2)}/style-files`)).body.items).toEqual([]);
    expect((await t.http().get("/v1/w/nope-nope/style-files")).status).toBe(404);
  });

  it("2. /me and the creator read carry the profile picture", async () => {
    const c = await creator();
    const up = await upload(c, { purpose: "profile" }, PNG, "image/png");
    const me = await t.http().get("/v1/me").set(c.auth);
    expect(me.body.picture).toMatchObject({ fileId: up.tk.body.id });
    expect(me.body.picture.url).toMatch(/^https:\/\//);
    const pub = await t.http().get(`/v1/creators/${c.handle}`);
    expect(pub.status).toBe(200);
    expect(pub.body.img).toMatch(/^https:\/\//);
    const plain = await creator();
    expect((await t.http().get("/v1/me").set(plain.auth)).body.picture).toBeNull();
  });

  it("3. turn Signed off and move from Creator to Open: each read says until which day; back on costs nothing; nothing refunded; the ledger is untouched by the switch", async () => {
    const c = await creator();
    const settle = t.app.get(SettlementService);
    const pay = async (sku: string, purpose: string) => {
      const book = await db.price.findFirstOrThrow({ where: { sku }, orderBy: { version: "desc" } });
      const unit = book.promoKobo ?? book.listKobo;
      const id = ids.next();
      const reference = `fw-${id}`;
      await db.payment.create({ data: { id, accountId: c.id, purpose: purpose as never, lines: [{ sku, name: sku, qty: 1, unitKobo: Number(unit), totalKobo: Number(unit) }], amountKobo: unit, currency: "NGN", priceBookVersion: book.version, status: "pending", provider: "paystack", providerReference: reference, idempotencyKey: `ab7s:${id}`, options: { request: { purpose }, server: { fingerprint: id } } } });
      expect((await settle.settle({ reference, status: "success", amountKobo: unit, currency: "NGN", paidAt: t.clock.now() })).outcome).toBe("fulfilled");
      return id;
    };
    await pay("creator.plan", "creator_plan");
    await pay("creator.signed", "signed");
    const read = () => t.http().get("/v1/studio/me").set(c.auth);
    const before = (await read()).body;
    expect(before).toMatchObject({ plan: "creator", signed: true, planEnding: false, signedEnding: false });
    expect(before.planUntil).toBe(new Date(Date.UTC(2034, 5, 10, 9)).toISOString());
    expect(before.signedUntil).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
    expect(before.planEndsOn).toBe("2034-06-10");
    expect(before.signedEndsOn).toBe("2034-06-09");
    // this account's own rows only: other specs share the database and add rows in parallel
    const mine = { payment: { accountId: c.id } };
    const ledger = () => db.ledgerEntry.count({ where: mine });
    const rows = await ledger();
    const refunds = await db.refund.count({ where: mine });
    // Signed off: still on until its day, not renewed
    const off = await t.http().patch("/v1/studio/me").set(c.auth).send({ signed: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ signed: true, signedEnding: true, signedUntil: before.signedUntil, signedEndsOn: "2034-06-09" });
    expect((await t.http().patch("/v1/studio/me").set(c.auth).send({ plan: "open" })).body).toMatchObject({ plan: "creator", planEnding: true, planUntil: before.planUntil });
    // back on before the day: no payment, nothing changes but the marks
    const back = await t.http().patch("/v1/studio/me").set(c.auth).send({ signed: true, plan: "creator" });
    expect(back.body).toMatchObject({ signed: true, signedEnding: false, planEnding: false, signedUntil: before.signedUntil });
    expect(await ledger()).toBe(rows);
    expect(await db.refund.count({ where: mine })).toBe(refunds);
    expect((await t.http().patch("/v1/studio/me").set(c.auth).send({ plan: "bogus" })).status).toBe(422);
    // turn both off and let the days pass: nothing renews and nothing is refunded
    await t.http().patch("/v1/studio/me").set(c.auth).send({ signed: false, plan: "open" });
    t.clock.set(new Date(NOW.getTime() + 30 * DAY));
    const after = (await read()).body;
    expect(after).toMatchObject({ signed: false, signedUntil: null, signedEnding: false });
    expect(after.plan).toBe("creator");
    t.clock.set(new Date(Date.UTC(2034, 5, 11, 9)));
    expect((await read()).body).toMatchObject({ plan: "open", planUntil: null, planEnding: false });
    // after the day a switch back is a payment, not a free flip
    expect((await t.http().patch("/v1/studio/me").set(c.auth).send({ plan: "creator" })).status).toBe(402);
    expect((await t.http().patch("/v1/studio/me").set(c.auth).send({ signed: true })).status).toBe(402);
    expect(await ledger()).toBe(rows);
    expect(await db.refund.count({ where: mine })).toBe(refunds);
  });

  it("7. the sweep removes a confirmed, unattached upload after 7 days and never one that is attached", async () => {
    const c = await creator();
    const jobs = t.app.get(FileJobs);
    const mk = async (over: Record<string, unknown> = {}) => {
      const r = await upload(c, { purpose: "photo" }, PNG, "image/png");
      const id = r.tk.body.id as string;
      await db.$executeRaw`UPDATE stored_file SET "updatedAt" = ${new Date(NOW.getTime() - 8 * DAY)} WHERE id = ${id}::uuid`;
      if (over.styleId) await db.storedFile.update({ where: { id }, data: { styleId: over.styleId as string } });
      return id;
    };
    const loose = await mk();
    const inWish = await mk();
    const inStyle = await mk({ styleId: await draft(c.id) });
    const wid = ids.next();
    await db.wish.create({ data: { id: wid, accountId: c.id, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos" } as never });
    await db.wishFile.create({ data: { id: ids.next(), wishId: wid, fileId: inWish, role: "photo" } });
    const fresh = await upload(c, { purpose: "photo" }, PNG, "image/png");
    await db.$executeRaw`UPDATE stored_file SET "updatedAt" = ${new Date(NOW.getTime() - 6 * DAY)} WHERE id = ${fresh.tk.body.id as string}::uuid`;
    const profile = await upload(c, { purpose: "profile" }, PNG, "image/png");
    await db.$executeRaw`UPDATE stored_file SET "updatedAt" = ${new Date(NOW.getTime() - 9 * DAY)} WHERE id = ${profile.tk.body.id as string}::uuid`;
    expect(await jobs.sweepUnattached()).toBeGreaterThanOrEqual(1);
    const left = async (id: string) => (await db.storedFile.count({ where: { id } })) === 1;
    expect(await left(loose)).toBe(false);
    expect(await left(inWish)).toBe(true);
    expect(await left(inStyle)).toBe(true);
    expect(await left(fresh.tk.body.id)).toBe(true);
    expect(await left(profile.tk.body.id)).toBe(true);
    // a second run changes nothing more for the files that stay
    await jobs.sweepUnattached();
    expect(await left(inWish)).toBe(true);
  });

  it("8. GET /v1/wishes rows carry publish as the detail does", async () => {
    const c = await creator();
    const wid = ids.next();
    await db.wish.create({ data: { id: wid, accountId: c.id, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "golden", timeZone: "Africa/Lagos" } as never });
    const list = await t.http().get("/v1/wishes").set(c.auth);
    expect(list.status).toBe(200);
    const row = (list.body.items as { id: string; publish?: unknown }[]).find((w) => w.id === wid);
    expect(row).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(row, "publish")).toBe(true);
    const detail = await t.http().get(`/v1/wishes/${wid}`).set(c.auth);
    expect(row?.publish).toEqual(detail.body.publish);
  });
});
