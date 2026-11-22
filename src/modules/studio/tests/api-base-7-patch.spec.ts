import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { FileJobs } from "../../stored-files/file-jobs";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { testWishNo, RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2036-06-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const run = RUN;
let seq = 0;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(40)]);

/** API-BASE-7 patch: HX3 (a deleted draft's files), HX4 (an erased creator's live style keeps its files), F6 (Signed backfill). */
describe("API-BASE-7 patch: Studio files and Signed", () => {
  let t: TestApp;
  let db: PrismaService;
  let ownerStaff = "";
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    await seedRoleTable(db);
    ownerStaff = (await makeStaff(db, ["owner"])).id;
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  async function person() {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab7p-${run}-${++seq}@example.com`, name: "Maker", handle: `ab7p${run}${seq}`.toLowerCase().slice(0, 20), sides: ["person", "creator"], lastSide: "creator" } });
    await db.creator.create({ data: { id: ids.next(), accountId: id, name: "Maker" } });
    t.tokens.set(`c-${id}`, { kind: "user", accountId: id, sides: ["person", "creator"] });
    return { id, auth: { authorization: `Bearer c-${id}` } };
  }
  async function style(accountId: string, status = "draft") {
    const id = ids.next();
    await db.studioStyle.create({ data: { id, accountId, status, document: { id, name: "Style", byline: "Maker", brief: "private" }, version: 0 } });
    return id;
  }
  const ticket = (c: { auth: Record<string, string> }, body: Record<string, unknown>, bytes: Buffer, type: string) =>
    t.http().post("/v1/uploads").set(c.auth).send({ contentType: type, bytes: bytes.length, ...body });
  const keyOf = (url: string) => decodeURI(new URL(url).pathname.replace(/^\/[^/]+\//, ""));
  async function upload(c: { auth: Record<string, string> }, body: Record<string, unknown>, bytes: Buffer, type: string) {
    const tk = await ticket(c, body, bytes, type);
    expect(tk.status).toBe(201);
    const key = keyOf(tk.body.upload.url);
    t.storage.putSigned(key, bytes, type);
    const cf = await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(c.auth).send({ fileId: tk.body.id });
    expect(cf.status).toBe(200);
    return { id: tk.body.id as string, objectKey: (await db.storedFile.findUniqueOrThrow({ where: { id: tk.body.id } })).objectKey };
  }

  it("HX3 deleting a draft removes its files and their bytes; a confirm for it is 404; a file whose style is gone is swept", async () => {
    const c = await person();
    const s = await style(c.id);
    const done = await upload(c, { purpose: "picture", styleId: s }, PNG, "image/png");
    const sound = await upload(c, { purpose: "sound", styleId: s }, MP3, "audio/mpeg");
    const waiting = await ticket(c, { purpose: "picture", styleId: s }, PNG, "image/png");
    expect(waiting.status).toBe(201);
    t.storage.putSigned(keyOf(waiting.body.upload.url), PNG, "image/png");
    expect(await t.storage.head(done.objectKey)).not.toBeNull();
    expect(await t.storage.head(sound.objectKey)).not.toBeNull();

    expect((await t.http().delete(`/v1/studio/styles/${s}`).set(c.auth)).status).toBe(200);
    expect(await db.storedFile.count({ where: { id: { in: [done.id, sound.id, waiting.body.id] } } })).toBe(0);
    expect(await t.storage.head(done.objectKey)).toBeNull();
    expect(await t.storage.head(sound.objectKey)).toBeNull();
    const cf = await t.http().post(`/v1/uploads/${waiting.body.id}/confirm`).set(c.auth).send({ fileId: waiting.body.id });
    expect(cf.status).toBe(404);
    expect((await t.http().post("/v1/uploads").set(c.auth).send({ purpose: "picture", styleId: s, contentType: "image/png", bytes: 10 })).status).toBe(404);
    expect((await t.http().get(`/v1/studio/styles/${s}/files`).set(c.auth)).status).toBe(404);
  });

  it("HX3 the file's style id is a key to the style row again: a draft's id is a real row, a missing one cannot be named, and the sweep takes the file of a style that is gone", async () => {
    const c = await person();
    const s = await style(c.id);
    const f = await upload(c, { purpose: "picture", styleId: s }, PNG, "image/png");
    // the row a draft is is the row its files name
    const [fk] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'stored_file_styleId_fkey' AND confrelid = 'studio_style'::regclass`;
    expect(fk.n).toBe(1);
    await expect(db.$executeRaw`UPDATE stored_file SET "styleId" = ${ids.next()}::uuid WHERE id = ${f.id}::uuid`).rejects.toThrow();
    // another way a style row goes (not the delete route): the file keeps no style, and the sweep takes it once it is 7 days old
    await db.studioStyle.delete({ where: { id: s } });
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: f.id } })).styleId).toBeNull();
    await db.$executeRaw`UPDATE stored_file SET "updatedAt" = ${new Date(NOW.getTime() - 8 * DAY)} WHERE id = ${f.id}::uuid`;
    expect(await t.app.get(FileJobs).sweepUnattached()).toBeGreaterThanOrEqual(1);
    expect(await db.storedFile.count({ where: { id: f.id } })).toBe(0);
    expect(await t.storage.head(f.objectKey)).toBeNull();
  });

  it("HX4 erasing a creator: a live style keeps its files and still plays; drafts, their files and the profile picture go; the kept files name no one", async () => {
    const c = await person();
    const live = await style(c.id, "live");
    const draft = await style(c.id);
    const slug = `ab7p-${run}-${++seq}`;
    await db.style.create({ data: { id: live, slug, name: "Kept", on: true, level: "starter" } });
    const kept = await upload(c, { purpose: "picture", styleId: live }, PNG, "image/png");
    const keptSound = await upload(c, { purpose: "sound", styleId: live }, MP3, "audio/mpeg");
    const gone = await upload(c, { purpose: "picture", styleId: draft }, PNG, "image/png");
    const profile = await upload(c, { purpose: "profile" }, PNG, "image/png");

    const viewer = await person();
    const wid = ids.next();
    await db.wish.create({ data: { id: wid, accountId: viewer.id, status: "live", kind: "birthday", occasion: "birthday", styleSlug: slug, timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - DAY), openedAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 300 * DAY) } as never });
    const link = `ab7pl-${run}-${++seq}`;
    await db.wishLink.create({ data: { id: ids.next(), slug: link, wishId: wid, active: true } });
    const play = async () => t.http().get(`/v1/w/${link}/style-files`);
    const idsOf = (body: { items: { fileId: string }[] }) => body.items.map((i) => i.fileId).sort();
    expect(idsOf((await play()).body as { items: { fileId: string }[] })).toEqual([kept.id, keptSound.id].sort());

    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "staff", id: ownerStaff, requestId: "ab7p" }, reason: "patch test" });
    await t.app.get(FileJobs).cleanupUnconfirmed();

    // the kept files stay, with no link to the erased account, and the player still gets them
    const rows = await db.storedFile.findMany({ where: { id: { in: [kept.id, keptSound.id] } } });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.ownerAccountId).toBeNull();
      expect(r.businessId).toBeNull();
      expect(r.styleId).toBe(live);
      expect(r.status).toBe("ready");
    }
    expect(await db.storedFile.count({ where: { ownerAccountId: c.id } })).toBe(0);
    const p = await play();
    expect(p.status).toBe(200);
    expect(idsOf(p.body as { items: { fileId: string }[] })).toEqual([kept.id, keptSound.id].sort());
    expect((p.body as { items: { url: string | null }[] }).items.every((i) => typeof i.url === "string")).toBe(true);
    expect(await t.storage.head(kept.objectKey)).not.toBeNull();
    // drafts, their files and the profile picture go
    expect(await db.studioStyle.count({ where: { id: draft } })).toBe(0);
    expect(await db.storedFile.count({ where: { id: { in: [gone.id, profile.id] } } })).toBe(0);
    expect(await t.storage.head(gone.objectKey)).toBeNull();
    expect(await t.storage.head(profile.objectKey)).toBeNull();
    // the style row stays without the person's words
    const doc = (await db.studioStyle.findUniqueOrThrow({ where: { id: live } })).document as Record<string, unknown>;
    expect(doc.byline).toBeUndefined();
    expect(doc.brief).toBeUndefined();
  });

  it("F6 the migration gives a creator already Signed a signedUntil: from the last Signed payment's paid day, else the day it runs, plus the paid period; PATCH signed:false then works", async () => {
    const sql = readFileSync(join(ROOT, "prisma/migrations/20261127090000_studio_files_base7/migration.sql"), "utf8");
    const backfill = sql.slice(sql.indexOf('UPDATE "creator_state" c SET "signedUntil"'));
    expect(backfill.length).toBeGreaterThan(50);
    const make = async () => {
      const c = await person();
      await t.http().get("/v1/studio/me").set(c.auth); // makes the creator_state row
      await db.$executeRaw`UPDATE creator_state SET signed = true, "signedUntil" = NULL WHERE "accountId" = ${c.id}::uuid`;
      return c;
    };
    const paid = await make();
    const never = await make();
    const paidAt = new Date("2036-06-01T08:00:00.000Z");
    const pid = ids.next();
    await db.payment.create({ data: { id: pid, accountId: paid.id, purpose: "signed" as never, lines: [], amountKobo: 1n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `ab7p-${pid}`, idempotencyKey: `ab7p-${pid}`, fulfilledAt: paidAt } });
    const open = await make(); // not Signed: left alone
    await db.$executeRaw`UPDATE creator_state SET signed = false WHERE "accountId" = ${open.id}::uuid`;
    await db.$executeRawUnsafe(backfill);
    const until = async (id: string) => (await db.creatorState.findFirstOrThrow({ where: { accountId: id } })).signedUntil;
    expect((await until(paid.id))?.getTime()).toBe(paidAt.getTime() + 30 * DAY);
    const n = (await until(never.id))?.getTime() ?? 0;
    expect(Math.abs(n - (Date.now() + 30 * DAY))).toBeLessThan(5 * 60_000);
    expect(await until(open.id)).toBeNull();
    // Signed off works for both, and the read says until which day (the clock is the day the migration ran)
    t.clock.set(new Date());
    for (const c of [paid, never]) {
      const r = await t.http().patch("/v1/studio/me").set(c.auth).send({ signed: false });
      expect(r.status).toBe(200);
      expect(r.body.signedEnding).toBe(true);
      expect(typeof r.body.signedUntil).toBe("string");
    }
  });
});
