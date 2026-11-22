import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { holdSettingLock } from "../../../../test/kit/setting-lock";
import { RUN, testSlug, testWishNo } from "../../../../test/kit/unique";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";
import { readFileSync } from "node:fs";
import { SubmissionsService } from "../submissions.service";

/* API-BASE-13 round 1 F3 (II3): a wish keeps the approved version of its Studio style that it was made under. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2034-08-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
let db: PrismaService;
let jobs: JobsService;
const staff: Record<string, string> = {};
let seq = 0;
// the upload checks read the price book's file limits, which the Prices specs change: this spec holds the same lock they do
let releaseSetting: () => Promise<void>;

const goodDoc = (over: Body = {}): Body => ({
  name: "Gold hour", base: "noir", brief: "Warm light.", theme: {}, scenes: { letter: { layers: {} } }, art: [],
  made: { kinds: ["love"], occasions: {}, best: "portrait" }, tags: { mood: ["warm"], palette: "gold", family: "noir" }, still: "fade",
  poster: { frame: "cover" }, holds: { portrait: "bars", landscape: "fills" }, rights: { confirmed: true, words: "Mine." }, ...over,
});

beforeAll(async () => {
  releaseSetting = await holdSettingLock();
  t = await createTestApp({ now: NOW });
  db = t.app.get(PrismaService);
  jobs = t.app.get(JobsService);
  t.app.get(SubmissionsService).registerAll();
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  await seedRoleTable(db);
  for (const role of ["owner", "reviewer"] as const) {
    const s = await makeStaff(db, [role]);
    staff[role] = `staff-${role}-${tag()}`;
    t.tokens.set(staff[role], { kind: "staff", staffId: s.id, roles: [role] });
  }
});
afterAll(async () => {
  await t.close();
  await releaseSetting();
});
beforeEach(() => t.clock.set(NOW));

const sh = (role: string) => ({ Authorization: `Bearer ${staff[role]}` });

async function creator() {
  const id = ids.next();
  await db.account.create({ data: { id, contact: `ab13-${RUN}-${++seq}@example.com`, handle: `ab13${tag()}`, sides: ["person", "creator"], lastSide: "creator" } });
  await db.creator.create({ data: { id: ids.next(), accountId: id, name: `Maker ${seq}` } });
  await db.creatorState.create({
    data: { id: ids.next(), accountId: id, plan: "creator", credits: 3, reviewsLeft: 5, extraReviews: 0, packs: 0, renews: new Date(NOW.getTime() + 20 * DAY), periodEndsAt: new Date(NOW.getTime() + 20 * DAY), on: true, signed: false },
  });
  const token = `c-${tag()}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides: ["person", "creator"] });
  return { id, h: { Authorization: `Bearer ${token}` } };
}
type Creator = Awaited<ReturnType<typeof creator>>;

const post = (c: Creator, path: string, body: Body = {}) => t.http().post(`/v1${path}`).set(c.h).send(body);
const get = (c: Creator, path: string) => t.http().get(`/v1${path}`).set(c.h);

async function draft(c: Creator, over: Body = {}): Promise<Body> {
  const r = await post(c, "/studio/styles", { style: goodDoc(over) });
  expect(r.status).toBe(201);
  return r.body as Body;
}
async function submit(c: Creator, d: Body): Promise<string> {
  const r = await post(c, `/studio/styles/${d.id}/submissions`);
  expect(r.status).toBe(201);
  return r.body.submission.id as string;
}
async function checked(c: Creator, d: Body): Promise<string> {
  const sid = await submit(c, d);
  await jobs.runDue(5, [`check:${sid}`]);
  return sid;
}
const decide = (sid: string, body: Body) => t.http().post(`/v1/admin/styles/review/${sid}/decide`).set(sh("reviewer")).send(body);
async function approved(c: Creator, over: Body = {}): Promise<Body> {
  const d = await draft(c, over);
  expect((await decide(await checked(c, d), { decision: "approve", reason: "Looks good" })).status).toBe(200);
  return d;
}
async function upload(c: Creator, styleId: string): Promise<string> {
  const tk = await t.http().post("/v1/uploads").set(c.h).send({ contentType: "image/png", bytes: PNG.length, purpose: "picture", styleId });
  expect(tk.status).toBe(201);
  const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
  expect(t.storage.putSigned(key, PNG, "image/png")).toBe(true);
  expect((await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(c.h).send({ fileId: tk.body.id })).status).toBe(200);
  return tk.body.id as string;
}
const player = (link: string, h: Record<string, string> = {}) => t.http().get(`/v1/w/${link}/style-files`).set(h);
const slugOf = (d: Body) => `studio-${d.id}`;


const migrate = async () => {
  const sql = readFileSync(join(ROOT, "prisma/migrations/20261205090000_wish_style_version_ab13r1/migration.sql"), "utf8").replace(/^--.*$/gm, "");
  const parts = sql.split(/(DO \$\$[\s\S]*?END \$\$;)/);
  for (const part of parts) {
    if (part.trimStart().startsWith("DO $$")) await db.$executeRawUnsafe(part.trim().replace(/;$/, ""));
    else for (const stmt of part.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) await db.$executeRawUnsafe(stmt);
  }
};
const pointerOf = async (id: string) => (await db.wish.findUniqueOrThrow({ where: { id }, select: { styleSubmissionId: true } })).styleSubmissionId;
/** A wish made through the real route, then made to show (live, opened) with its link. */
async function madeIn(slug: string, owner?: Creator, showNow = true): Promise<{ link: string; wishId: string; owner: Creator }> {
  const o = owner ?? (await creator());
  const r = await t.http().post("/v1/wishes").set(o.h).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: slug });
  expect(r.status).toBeLessThan(300);
  const wishId = r.body.id as string;
  return { ...(showNow ? await show(wishId) : { link: "" }), wishId, owner: o };
}
async function show(wishId: string): Promise<{ link: string }> {
  await db.wish.update({
    where: { id: wishId },
    data: { status: "live", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - DAY), openedAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 5 * DAY) },
  });
  const link = testSlug("ab13");
  await db.wishLink.create({ data: { id: ids.next(), slug: link, wishId, active: true } });
  return { link };
}
/** The app's clock and the database's own default differ in a test: set the order of what happened (v1 sent in, its files, v2 sent in, its files) by hand. */
async function stamp(styleId: string, files: string[][]): Promise<void> {
  const subs = await db.styleSubmission.findMany({ where: { styleId, status: "live" }, orderBy: { createdAt: "asc" } });
  const base = new Date("2030-01-01T00:00:00.000Z").getTime();
  for (let i = 0; i < subs.length; i++) {
    await db.styleSubmission.update({ where: { id: subs[i].id }, data: { createdAt: new Date(base + i * 10 * 60_000) } });
    for (const f of files[i] ?? []) await db.storedFile.update({ where: { id: f }, data: { createdAt: new Date(base + i * 10 * 60_000 + 60_000) } });
  }
}
/** Takes the style back, edits it and has version 2 approved. */
async function second(c: Creator, d: Body, name: string): Promise<void> {
  expect((await post(c, `/studio/styles/${d.id}/withdraw`)).status).toBe(200);
  const back = (await get(c, `/studio/styles/${d.id}`)).body as Body;
  expect((await t.http().patch(`/v1/studio/styles/${d.id}`).set(c.h).send({ style: { ...back, name, brief: `${name} words.` } })).status).toBe(200);
  expect((await decide(await checked(c, d), { decision: "approve", reason: "Version two" })).status).toBe(200);
}

describe("II3: a wish plays the version of its style that was approved when it was made", () => {
  it("a wish made under version 1 still plays version 1 (document and files) after version 2 is approved; a new wish and E-196 play version 2", async () => {
    const c = await creator();
    const d = await approved(c, { name: "Version one", brief: "One words." });
    const file1 = await upload(c, d.id);
    const old = await madeIn(slugOf(d));
    const v1 = await pointerOf(old.wishId);
    expect(v1).not.toBeNull();
    await second(c, d, "Version two");
    const file2 = await upload(c, d.id);
    await stamp(d.id, [[file1], [file2]]);

    const at = await player(old.link);
    expect(at.status).toBe(200);
    expect(at.body.document).toMatchObject({ id: d.id, name: "Version one", brief: "One words." });
    expect((at.body.items as Body[]).map((i) => i.fileId as string)).toEqual([file1]);

    const fresh = await madeIn(slugOf(d));
    const v2 = await pointerOf(fresh.wishId);
    expect(v2).not.toBeNull();
    expect(v2).not.toBe(v1);
    const nw = await player(fresh.link);
    expect(nw.body.document).toMatchObject({ name: "Version two", brief: "Version two words." });
    expect((nw.body.items as Body[]).map((i) => i.fileId as string).sort()).toEqual([file1, file2].sort());
    const pub = await t.http().get(`/v1/styles/${slugOf(d)}`);
    expect(pub.status).toBe(200);
    expect(pub.body.document).toMatchObject({ name: "Version two" });
    // the old wish is unchanged by reads
    expect((await player(old.link)).body.document).toMatchObject({ name: "Version one" });
  });

  it("a wish whose style changes before it is sealed takes the new style's current version", async () => {
    const c = await creator();
    const a = await approved(c, { name: "Style A v1" });
    const b = await approved(c, { name: "Style B v1" });
    const w = await madeIn(slugOf(a), undefined, false);
    const aV1 = await pointerOf(w.wishId);
    await second(c, b, "Style B v2");
    const bV2 = (await db.styleSubmission.findFirstOrThrow({ where: { styleId: b.id, status: "live" }, orderBy: { createdAt: "desc" } })).id;
    const cur = await db.wish.findUniqueOrThrow({ where: { id: w.wishId } });
    const patched = await t.http().patch(`/v1/wishes/${w.wishId}`).set(w.owner.h).send({ version: cur.version, style: slugOf(b) });
    expect(patched.status).toBe(200);
    expect(await pointerOf(w.wishId)).toBe(bV2);
    expect(await pointerOf(w.wishId)).not.toBe(aV1);
    await show(w.wishId);
    // the link plays version 2 of B, which the wish took when it took B
    const link = (await db.wishLink.findFirstOrThrow({ where: { wishId: w.wishId, active: true } })).slug;
    expect((await player(link)).body.document).toMatchObject({ name: "Style B v2" });
  });

  it("a house style takes no version; the erased-creator and switched-off cases still play the version the wish was made under", async () => {
    const house = await db.style.findFirstOrThrow({ where: { house: true, on: true, slug: { not: null } }, orderBy: { slug: "asc" } });
    const h = await madeIn(house.slug as string);
    expect(await pointerOf(h.wishId)).toBeNull();
    expect((await player(h.link)).body).toEqual({ style: house.slug, items: [], document: null });

    const c = await creator();
    const d = await approved(c, { name: "Kept look" });
    const file = await upload(c, d.id);
    const w = await madeIn(slugOf(d));
    await second(c, d, "Newer look");
    await stamp(d.id, [[file]]);
    expect((await t.http().post(`/v1/admin/styles/${slugOf(d)}/switch`).set(sh("reviewer")).send({ on: false, reason: "Off to test" })).status).toBe(200);
    expect((await t.http().get(`/v1/styles/${slugOf(d)}`)).status).toBe(404);
    let at = await player(w.link);
    expect(at.body.document).toMatchObject({ name: "Kept look" });
    expect((at.body.items as Body[]).map((i) => i.fileId as string)).toEqual([file]);
    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "system", id: null, requestId: `ab13r1-${RUN}` }, reason: "test" });
    at = await player(w.link);
    expect(at.status).toBe(200);
    expect(at.body.document).toMatchObject({ name: "Kept look", byline: "" });
    expect((at.body.items as Body[]).map((i) => i.fileId as string)).toEqual([file]);
  });

  it("the migration ties a wish made before to the version approved then (or the earliest approved), and twice changes nothing", async () => {
    const c = await creator();
    const d = await approved(c, { name: "Mig one" });
    const subs1 = await db.styleSubmission.findMany({ where: { styleId: d.id, status: "live" } });
    await second(c, d, "Mig two");
    const subs = await db.styleSubmission.findMany({ where: { styleId: d.id, status: "live" }, orderBy: { createdAt: "asc" } });
    expect(subs).toHaveLength(2);
    const [s1, s2] = subs;
    expect(subs1.map((s) => s.id)).toEqual([s1.id]);
    const owner = await creator();
    const mk = async (createdAt: Date) => {
      const id = ids.next();
      await db.wish.create({ data: { id, accountId: owner.id, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: slugOf(d), timeZone: "Africa/Lagos", createdAt } as never });
      return id;
    };
    const between = await mk(new Date(s1.createdAt.getTime() + (s2.createdAt.getTime() - s1.createdAt.getTime()) / 2));
    const after = await mk(new Date(s2.createdAt.getTime() + 1000));
    const before = await mk(new Date(s1.createdAt.getTime() - 1000));
    const house = await db.style.findFirstOrThrow({ where: { house: true, slug: { not: null } } });
    const houseWish = ids.next();
    await db.wish.create({ data: { id: houseWish, accountId: owner.id, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: house.slug as string, timeZone: "Africa/Lagos" } as never });
    await migrate();
    expect(await pointerOf(between)).toBe(s1.id);
    expect(await pointerOf(after)).toBe(s2.id);
    expect(await pointerOf(before)).toBe(s1.id); // older than every approval: the earliest approved
    expect(await pointerOf(houseWish)).toBeNull();
    const snapshot = JSON.stringify(await db.wish.findMany({ where: { id: { in: [between, after, before, houseWish] } }, select: { id: true, styleSubmissionId: true }, orderBy: { id: "asc" } }));
    await migrate();
    expect(JSON.stringify(await db.wish.findMany({ where: { id: { in: [between, after, before, houseWish] } }, select: { id: true, styleSubmissionId: true }, orderBy: { id: "asc" } }))).toBe(snapshot);
  });
});
