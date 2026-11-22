import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { RUN, testHex, testSlug, testWishNo } from "../../../../test/kit/unique";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";
import { SubmissionsService } from "../submissions.service";

/* API-BASE-13 case 1 (II1, HX4, HW2): a Studio style plays for a receiver. The approved document is given at the wish's link (E-266, with the
   files) and at the public style read (E-196); never a draft's, a submitted one's, a refused or withdrawn one's; never a later edit. */
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

const goodDoc = (over: Body = {}): Body => ({
  name: "Gold hour", base: "noir", brief: "Warm light.", theme: {}, scenes: { letter: { layers: {} } }, art: [],
  made: { kinds: ["love"], occasions: {}, best: "portrait" }, tags: { mood: ["warm"], palette: "gold", family: "noir" }, still: "fade",
  poster: { frame: "cover" }, holds: { portrait: "bars", landscape: "fills" }, rights: { confirmed: true, words: "Mine." }, ...over,
});

beforeAll(async () => {
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
afterAll(() => t.close());
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
/** A wish played in a style, its link, made as the pre-existing tests make one (a live, opened wish with a term still running). */
async function wishIn(styleSlug: string, over: Record<string, unknown> = {}): Promise<{ link: string; wishId: string; linkId: string }> {
  const owner = await creator();
  const wishId = ids.next();
  await db.wish.create({
    data: {
      id: wishId, accountId: owner.id, status: "live", kind: "birthday", occasion: "birthday", styleSlug, timeZone: "Africa/Lagos", ticket: "keepsake", no: testWishNo(),
      opensAt: new Date(NOW.getTime() - DAY), openedAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 5 * DAY), ...over,
    } as never,
  });
  const link = testSlug("ab13");
  const linkId = ids.next();
  await db.wishLink.create({ data: { id: linkId, slug: link, wishId, active: true } });
  return { link, wishId, linkId };
}
const player = (link: string, h: Record<string, string> = {}) => t.http().get(`/v1/w/${link}/style-files`).set(h);
const slugOf = (d: Body) => `studio-${d.id}`;

describe("II1: the approved document plays at a receiver's link and at the public style read", () => {
  it("an approved, live style gives its document, typed as the creator's own read types it, at the wish's link (with the files) and at E-196", async () => {
    const c = await creator();
    const d = await approved(c);
    const file = await upload(c, d.id);
    const mine = (await get(c, `/studio/styles/${d.id}`)).body as Body;
    const { link } = await wishIn(slugOf(d));

    const at = await player(link);
    expect(at.status).toBe(200);
    expect(at.body.style).toBe(slugOf(d));
    expect((at.body.items as Body[]).map((i) => i.fileId)).toEqual([file]);
    expect(at.body.document).toMatchObject({ id: d.id, name: "Gold hour", base: "noir", brief: "Warm light.", status: "live", level: "standard", on: false });
    expect(at.body.document.scenes).toEqual({ letter: { layers: {} } });
    expect(Object.keys(at.body.document).sort()).toEqual(Object.keys(mine).sort());
    expect(at.body.document.review).toBeNull();

    for (const key of [slugOf(d), d.id as string]) {
      const pub = await t.http().get(`/v1/styles/${key}`);
      expect(pub.status).toBe(200);
      expect(pub.body.document).toEqual(at.body.document);
      expect(pub.body.slug).toBe(slugOf(d));
    }
    // the list reads stay as they were: no document
    const list = await t.http().get("/v1/styles").query({ limit: 50 });
    expect(list.status).toBe(200);
    for (const s of list.body.items as Body[]) expect(s).not.toHaveProperty("document");
  });

  it("a house style answers as it does today, with the field null", async () => {
    const house = await db.style.findFirstOrThrow({ where: { house: true, on: true, slug: { not: null } }, orderBy: { slug: "asc" } });
    const pub = await t.http().get(`/v1/styles/${house.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.document).toBeNull();
    const { link } = await wishIn(house.slug as string);
    const at = await player(link);
    expect(at.status).toBe(200);
    expect(at.body).toEqual({ style: house.slug, items: [], document: null });
  });

  it("a draft, a submitted, a refused and a withdrawn style give no document at E-196, and no wish can be made in one", async () => {
    const c = await creator();
    const owner = await creator();
    const makeWish = (slug: string) => t.http().post("/v1/wishes").set(owner.h).send({ kind: "birthday", occasion: "birthday", style: slug });

    const dr = await draft(c);
    const sub = await draft(c);
    await submit(c, sub);
    const ref = await draft(c);
    expect((await decide(await checked(c, ref), { decision: "return", reason: "Colours clash", note: "Soften it." })).status).toBe(200);
    const wd = await approved(c);
    expect((await post(c, `/studio/styles/${wd.id}/withdraw`)).status).toBe(200);

    for (const d of [dr, sub, ref, wd]) {
      expect((await t.http().get(`/v1/styles/${slugOf(d)}`)).status).toBe(404);
      expect((await t.http().get(`/v1/styles/${d.id}`)).status).toBe(404);
      expect((await makeWish(slugOf(d))).status).toBe(422);
    }
    // a wish that cannot exist for a style never approved reads as no style document (a row put there by hand gives nothing)
    for (const d of [dr, sub, ref]) {
      const { link } = await wishIn(slugOf(d));
      expect((await player(link)).body).toEqual({ style: slugOf(d), items: [], document: null });
    }
  });

  it("another creator's draft id guessed at E-196 is 404 as it is today", async () => {
    const c = await creator();
    const d = await draft(c);
    const other = await creator();
    expect((await t.http().get(`/v1/styles/${d.id}`).set(other.h)).status).toBe(404);
    expect((await t.http().get(`/v1/styles/${d.id}`)).status).toBe(404);
    expect((await t.http().get(`/v1/styles/${ids.next()}`)).status).toBe(404);
  });

  it("an edit saved after approval does not change what the public reads: the approved version is given", async () => {
    const c = await creator();
    const d = await approved(c, { name: "First look", brief: "Approved words." });
    const { link } = await wishIn(slugOf(d));
    // a live row edited underneath (nothing in the app does this): the public still reads the version the reviewer approved
    const row = await db.studioStyle.findUniqueOrThrow({ where: { id: d.id } });
    await db.studioStyle.update({ where: { id: d.id }, data: { document: { ...(row.document as Body), name: "Sneaky edit", brief: "Not approved." } } });
    expect((await t.http().get(`/v1/styles/${slugOf(d)}`)).body.document).toMatchObject({ name: "First look", brief: "Approved words." });
    expect((await player(link)).body.document).toMatchObject({ name: "First look", brief: "Approved words." });
  });

  it("taken back by its creator, edited and saved: E-196 stops giving it; the wish already made still plays the approved version, files included", async () => {
    const c = await creator();
    const d = await approved(c, { name: "First look" });
    const file = await upload(c, d.id);
    const { link } = await wishIn(slugOf(d));
    expect((await post(c, `/studio/styles/${d.id}/withdraw`)).status).toBe(200);
    const back = (await get(c, `/studio/styles/${d.id}`)).body as Body;
    expect(back.status).toBe("draft");
    const saved = await t.http().patch(`/v1/studio/styles/${d.id}`).set(c.h).send({ style: { ...back, name: "Second thoughts", brief: "A newer edit." } });
    expect(saved.status).toBe(200);
    expect((await t.http().get(`/v1/styles/${slugOf(d)}`)).status).toBe(404);
    const at = await player(link);
    expect(at.status).toBe(200);
    expect(at.body.document).toMatchObject({ id: d.id, name: "First look", brief: "Warm light." });
    expect((at.body.items as Body[]).map((i) => i.fileId)).toEqual([file]);
    // sent in again: the old approved version still plays until the new one is approved
    await checked(c, d);
    expect((await player(link)).body.document).toMatchObject({ name: "First look" });
  });

  it("the style switched off after a wish was made: the wish's link still gives the document and the files; E-196 does not", async () => {
    const c = await creator();
    const d = await approved(c);
    const file = await upload(c, d.id);
    const { link } = await wishIn(slugOf(d));
    const off = await t.http().post(`/v1/admin/styles/${slugOf(d)}/switch`).set(sh("reviewer")).send({ on: false, reason: "Switched off to test" });
    expect(off.status).toBe(200);
    expect((await t.http().get(`/v1/styles/${slugOf(d)}`)).status).toBe(404);
    const at = await player(link);
    expect(at.status).toBe(200);
    expect(at.body.document).toMatchObject({ id: d.id, name: "Gold hour" });
    expect((at.body.items as Body[]).map((i) => i.fileId)).toEqual([file]);
  });

  it("the creator's account erased (HX4): the link still gives the document and the files, with no person on it; E-196 still gives the document", async () => {
    const c = await creator();
    const d = await approved(c);
    const file = await upload(c, d.id);
    const { link } = await wishIn(slugOf(d));
    const before = (await player(link)).body.document as Body;
    expect(before.byline).not.toBe("");
    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "system", id: null, requestId: `ab13-${RUN}` }, reason: "test" });
    const at = await player(link);
    expect(at.status).toBe(200);
    expect(at.body.document).toMatchObject({ id: d.id, name: "Gold hour", base: "noir", brief: null, byline: "" });
    expect(at.body.document.scenes).toEqual(before.scenes);
    expect((at.body.items as Body[]).map((i) => i.fileId)).toEqual([file]);
    const pub = await t.http().get(`/v1/styles/${slugOf(d)}`);
    expect(pub.status).toBe(200);
    expect(pub.body.document).toMatchObject({ name: "Gold hour", brief: null, byline: "" });
  });
});

describe("II1: the wish itself must be showing", () => {
  const hash = (p: string) => {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${scryptSync(p, salt, 32).toString("hex")}`;
  };

  it("a sealed wish, a passcode wish before it is unlocked, a removed wish, a resting wish and a wish whose link is off give nothing", async () => {
    const c = await creator();
    const d = await approved(c);
    await upload(c, d.id);
    const slug = slugOf(d);

    const sealed = await wishIn(slug, { status: "sealed", openedAt: null, endsAt: null, opensAt: new Date(NOW.getTime() + DAY) });
    expect((await player(sealed.link)).status).toBe(404);

    const removed = await wishIn(slug, { status: "removed", removedAt: new Date(NOW.getTime() - 1000) });
    expect((await player(removed.link)).status).toBe(404);
    const removedLive = await wishIn(slug, { removedAt: new Date(NOW.getTime() - 1000) });
    expect((await player(removedLive.link)).status).toBe(404);

    const resting = await wishIn(slug, { endsAt: new Date(NOW.getTime() - 1000) });
    expect((await player(resting.link)).status).toBe(404);

    const off = await wishIn(slug);
    await db.wishLink.update({ where: { id: off.linkId }, data: { active: false } });
    expect((await player(off.link)).status).toBe(404);

    const locked = await wishIn(slug, { passcodeHash: hash("open-sesame") });
    expect((await player(locked.link)).status).toBe(404);
    expect((await player(locked.link, { "x-unlock-token": "1.nonsense" })).status).toBe(404);
    const wrong = await t.http().post(`/v1/w/${locked.link}/unlock`).set("X-Forwarded-For", uniqueAddress()).send({ passcode: "nope" });
    expect(wrong.body.ok).toBe(false);
    const unlocked = await t.http().post(`/v1/w/${locked.link}/unlock`).set("X-Forwarded-For", uniqueAddress()).send({ passcode: "open-sesame" });
    expect(unlocked.body.ok).toBe(true);
    const at = await player(locked.link, { "x-unlock-token": unlocked.body.token });
    expect(at.status).toBe(200);
    expect(at.body.document).toMatchObject({ id: d.id, name: "Gold hour" });
    expect(at.body.items).toHaveLength(1);
    // the token is for that link only
    const other = await wishIn(slug, { passcodeHash: hash("open-sesame") });
    expect((await player(other.link, { "x-unlock-token": unlocked.body.token })).status).toBe(404);

    expect((await player(testHex(15))).status).toBe(404);
  });
});
