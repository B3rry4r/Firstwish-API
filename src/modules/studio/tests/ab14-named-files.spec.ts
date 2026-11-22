import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, uniqueAddress } from "../../../../test/kit/app";
import { holdSettingLockForFile } from "../../../../test/kit/setting-lock";
import { RUN, testSlug, testWishNo } from "../../../../test/kit/unique";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";
import { SubmissionsService } from "../submissions.service";

/* API-BASE-14: II5 (a style names only its own, ready files, in every place a document names one), II4 for every kind (a kept file is
   recognised wherever an approved document names it), and E-196 for an erased creator. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2034-08-10T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(40)]);
const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(40)]);
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// the upload checks read the price book's file limits, which the Prices specs change: this file holds the same lock they do
holdSettingLockForFile();

let t: TestApp;
let db: PrismaService;
let jobs: JobsService;
const staff: Record<string, string> = {};

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
  const s = await makeStaff(db, ["reviewer"]);
  staff.reviewer = `staff-reviewer-${tag()}`;
  t.tokens.set(staff.reviewer, { kind: "staff", staffId: s.id, roles: ["reviewer"] });
}, 120_000);
afterAll(() => t.close());
beforeEach(() => t.clock.set(NOW));

async function creator() {
  const id = ids.next();
  await db.account.create({ data: { id, contact: uniqueAddress(), handle: `ab14${tag()}`, sides: ["person", "creator"], lastSide: "creator" } });
  await db.creator.create({ data: { id: ids.next(), accountId: id, name: "Maker" } });
  await db.creatorState.create({
    data: { id: ids.next(), accountId: id, plan: "creator", credits: 3, reviewsLeft: 50, extraReviews: 0, packs: 0, renews: new Date(NOW.getTime() + 20 * DAY), periodEndsAt: new Date(NOW.getTime() + 20 * DAY), on: true, signed: false },
  });
  const token = `c-${tag()}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides: ["person", "creator"] });
  return { id, h: { Authorization: `Bearer ${token}` } };
}
type Creator = Awaited<ReturnType<typeof creator>>;
const post = (c: Creator, path: string, body: Body = {}) => t.http().post(`/v1${path}`).set(c.h).send(body);
const get = (c: Creator, path: string) => t.http().get(`/v1${path}`).set(c.h);
const patch = (c: Creator, id: string, style: Body) => t.http().patch(`/v1/studio/styles/${id}`).set(c.h).send({ style });
const del = (c: Creator, file: string) => t.http().delete(`/v1/uploads/${file}`).set(c.h);

async function draft(c: Creator, over: Body = {}): Promise<Body> {
  const r = await post(c, "/studio/styles", { style: goodDoc(over) });
  expect(r.status).toBe(201);
  return r.body as Body;
}
/** The style as read back, with the changes laid over it, saved again. */
async function save(c: Creator, d: Body, over: Body) {
  const back = (await get(c, `/studio/styles/${d.id}`)).body as Body;
  return patch(c, d.id, { ...back, ...over });
}
const KINDS = {
  picture: { type: "image/png", bytes: PNG },
  poster: { type: "image/png", bytes: PNG },
  sound: { type: "audio/mpeg", bytes: MP3 },
  model: { type: "model/gltf-binary", bytes: GLB },
} as const;
async function upload(c: Creator, styleId: string, purpose: keyof typeof KINDS = "picture"): Promise<string> {
  const k = KINDS[purpose];
  const tk = await t.http().post("/v1/uploads").set(c.h).send({ contentType: k.type, bytes: k.bytes.length, purpose, styleId });
  expect(tk.status).toBe(201);
  const key = decodeURI(new URL(tk.body.upload.url).pathname.replace(/^\/[^/]+\//, ""));
  expect(t.storage.putSigned(key, k.bytes, k.type)).toBe(true);
  expect((await t.http().post(`/v1/uploads/${tk.body.id}/confirm`).set(c.h).send({ fileId: tk.body.id })).status).toBe(200);
  return tk.body.id as string;
}
/** A file row made directly in a state the routes make slowly (still in screening, refused, never confirmed, removed). */
async function row(accountId: string, styleId: string | null, status: string, extra: Body = {}): Promise<string> {
  const id = ids.next();
  await db.storedFile.create({
    data: { id, ownerAccountId: accountId, styleId, purpose: "studio_asset", objectKey: `k/${id}`, contentType: "image/png", bytes: 40, status, variants: {}, driver: "r2", kind: "image", ...extra } as never,
  });
  return id;
}
const asStaff = () => ({ Authorization: `Bearer ${staff.reviewer}` });
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
const decide = (sid: string, body: Body) => t.http().post(`/v1/admin/styles/review/${sid}/decide`).set(asStaff()).send(body);
const approve = async (c: Creator, d: Body) => expect((await decide(await checked(c, d), { decision: "approve", reason: "Looks good" })).status).toBe(200);
const player = (link: string) => t.http().get(`/v1/w/${link}/style-files`);
const slugOf = (d: Body) => `studio-${d.id}`;
async function madeIn(slug: string): Promise<{ link: string; wishId: string }> {
  const o = await creator();
  const r = await t.http().post("/v1/wishes").set(o.h).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: slug });
  expect(r.status).toBeLessThan(300);
  const wishId = r.body.id as string;
  await db.wish.update({
    where: { id: wishId },
    data: { status: "live", ticket: "keepsake", no: testWishNo(), opensAt: new Date(NOW.getTime() - DAY), openedAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 5 * DAY) },
  });
  const link = testSlug("ab14");
  await db.wishLink.create({ data: { id: ids.next(), slug: link, wishId, active: true } });
  return { link, wishId };
}
const fileIdsAt = (r: { body: Body }) => (r.body.items as Body[]).map((i) => i.fileId as string).sort();

/** Every place a document names a file, as a document that names `f` there. */
const PLACES: { place: RegExp; name: (f: string) => Body }[] = [
  { place: /art list, item 2/i, name: (f) => ({ art: [{ id: "keep", name: "a" }, { fileId: f }] }) },
  { place: /art list, item 1/i, name: (f) => ({ art: [{ id: f }] }) },
  { place: /poster/i, name: (f) => ({ poster: { frame: "cover", src: f } }) },
  { place: /sound/i, name: (f) => ({ sound: f }) },
  { place: /background picture/i, name: (f) => ({ scenes: { letter: { layers: {}, backdrop: f } } }) },
  { place: /added thing 1 \(artwork\)/i, name: (f) => ({ scenes: { letter: { layers: {}, added: [{ id: "a", kind: "artwork", what: f }] } } }) },
  { place: /added thing 1 \(3D model\)/i, name: (f) => ({ scenes: { letter: { layers: {}, added: [{ id: "a", kind: "model", what: f }] } } }) },
  { place: /added thing 1 \(3D thing\)/i, name: (f) => ({ scenes: { letter: { layers: {}, added: [{ id: "a", kind: "three", what: f, three: { shape: "model" } }] } } }) },
  { place: /added thing 2 \(picture fill\)/i, name: (f) => ({ scenes: { "*": { layers: {}, added: [{ id: "b", kind: "shape", what: "box" }, { id: "a", kind: "shape", what: "box", fill: { kind: "picture", art: f } }] } } }) },
];

describe("case 1 (II5): a document names only this style's own, ready files", () => {
  it("II5 every place: a file of this style that is ready is named (200); another creator's file, ready or unconfirmed, is 422 in words naming the place and nothing is saved", async () => {
    const c = await creator();
    const other = await creator();
    const d = await draft(c);
    const mine = await upload(c, d.id);
    const od = await draft(other);
    const theirReady = await upload(other, od.id);
    const theirUnconfirmed = await row(other.id, od.id, "pending");
    for (const p of PLACES) {
      const back = (await get(c, `/studio/styles/${d.id}`)).body as Body;
      for (const f of [theirReady, theirUnconfirmed]) {
        const bad = await patch(c, d.id, { ...back, ...p.name(f) });
        expect(bad.status).toBe(422);
        expect(Object.values(bad.body.error.fields as Record<string, string>).join(" ")).toMatch(p.place);
        expect(JSON.stringify(bad.body)).not.toContain(f);
        const after = (await get(c, `/studio/styles/${d.id}`)).body as Body;
        expect(after.version).toBe(back.version);
        expect(after.art).toEqual(back.art);
      }
      const ok = await patch(c, d.id, { ...back, ...p.name(mine) });
      expect(ok.status).toBe(200);
      expect((await patch(c, d.id, { ...ok.body, art: [], poster: { frame: "cover" }, sound: null, scenes: { letter: { layers: {} } } })).status).toBe(200);
    }
  });

  it("II5: another of the caller's own styles' file, a held file, a refused file, a removed file, an id that is no file and a non-id are each 422 naming the place; creating with such a name is 422 too", async () => {
    const c = await creator();
    const d = await draft(c);
    const second = await draft(c);
    const elsewhere = await upload(c, second.id);
    const held = await row(c.id, d.id, "screening");
    const refused = await row(c.id, d.id, "rejected");
    const removed = await upload(c, d.id);
    expect((await del(c, removed)).status).toBeLessThan(300);
    const none = ids.next();
    const unfinished = await row(c.id, d.id, "uploaded");
    const cases: [string, string, RegExp][] = [
      [elsewhere, "poster", /not one of this style's files/],
      [held, "poster", /still being checked/],
      [unfinished, "poster", /still being checked/],
      [refused, "poster", /was refused/],
      [removed, "poster", /not one of this style's files|was removed/],
      [none, "poster", /not one of this style's files/],
    ];
    for (const [f, , words] of cases) {
      const r = await save(c, d, { sound: f });
      expect(r.status).toBe(422);
      expect(r.body.error.fields["style.sound"]).toMatch(/^The sound names a file that /);
      expect(r.body.error.fields["style.sound"]).toMatch(words);
      const made = await post(c, "/studio/styles", { style: goodDoc({ poster: { frame: "cover", src: f } }) });
      expect(made.status).toBe(422);
      expect(made.body.error.fields["style.poster.src"]).toMatch(/^The poster names a file that /);
    }
    // an explicit file field that is no id is refused; a use that is no id names no file (II5a)
    expect((await save(c, d, { poster: { frame: "cover", fileId: "not-an-id" } })).status).toBe(422);
    expect(((await get(c, `/studio/styles/${d.id}`)).body as Body).sound).toBeNull();
    // a number is no id either
    expect((await save(c, d, { sound: 7 })).status).toBe(422);
    expect((await save(c, d, { sound: "not-an-id" })).status).toBe(200);
  });

  it("II5: a scene that names a file still in screening is not saved; once the file is ready it is", async () => {
    const c = await creator();
    const d = await draft(c);
    const f = await row(c.id, d.id, "screening");
    const scenes = { letter: { layers: {}, backdrop: f } };
    const r = await save(c, d, { scenes });
    expect(r.status).toBe(422);
    expect(r.body.error.fields[`style.scenes.letter.backdrop`]).toMatch(/Scene letter, its background picture names a file that is still being checked/);
    await db.storedFile.update({ where: { id: f }, data: { status: "ready" } });
    expect((await save(c, d, { scenes })).status).toBe(200);
  });

  it("II5: the send-in names the same refusal; a style saved before the rule still reads (E-190) and is refused at the send-in in words until the name is taken out", async () => {
    const c = await creator();
    const other = await creator();
    const od = await draft(other);
    const theirs = await upload(other, od.id);
    const d = await draft(c);
    // as an older save left it: the document names another creator's file
    const row0 = await db.studioStyle.findUniqueOrThrow({ where: { id: d.id } });
    await db.studioStyle.update({ where: { id: d.id }, data: { document: { ...(row0.document as Body), art: [{ fileId: theirs }], poster: { frame: "cover", src: theirs } } } });
    const read = await get(c, `/studio/styles/${d.id}`);
    expect(read.status).toBe(200);
    expect(read.body.art).toEqual([{ fileId: theirs }]);
    const sent = await post(c, `/studio/styles/${d.id}/submissions`);
    expect(sent.status).toBe(422);
    expect(sent.body.error.fields["style.art.0.fileId"]).toMatch(/^The art list, item 1 names a file that is not one of this style's files/);
    expect(sent.body.error.fields["style.poster.src"]).toMatch(/^The poster names a file/);
    expect((await db.styleSubmission.count({ where: { styleId: d.id } }))).toBe(0);
    expect(((await get(c, `/studio/styles/${d.id}`)).body as Body).status).toBe("draft");
    // taking the names out lets it go
    expect((await save(c, d, { art: [], poster: { frame: "cover" } })).status).toBe(200);
    expect((await post(c, `/studio/styles/${d.id}/submissions`)).status).toBe(201);
  });

  it("II5 with II4: a kept file may not be named anew, by the creator who deleted it or in another place", async () => {
    const c = await creator();
    const d = await draft(c);
    const f = await upload(c, d.id);
    expect((await save(c, d, { art: [{ fileId: f }] })).status).toBe(200);
    await approve(c, d);
    expect((await post(c, `/studio/styles/${d.id}/withdraw`)).status).toBe(200);
    expect((await del(c, f)).status).toBeLessThan(300);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: f } })).keptAt).not.toBeNull();
    for (const over of [{ art: [{ fileId: f }] }, { sound: f }, { poster: { frame: "cover", src: f } }]) {
      const r = await save(c, d, over);
      expect(r.status).toBe(422);
      expect(Object.values(r.body.error.fields as Record<string, string>).join(" ")).toMatch(/was deleted and cannot be used again/);
    }
  });

  it("II5: 30 parallel saves, one of which names a file while it is removed: the saved document never names a gone file", async () => {
    const c = await creator();
    const d = await draft(c);
    const f = await upload(c, d.id);
    const back = (await get(c, `/studio/styles/${d.id}`)).body as Body;
    const saves = Array.from({ length: 30 }, (_, i) => patch(c, d.id, { ...back, name: `Gold hour ${i}`, ...(i === 7 ? { art: [{ fileId: f }] } : {}) }).then((r) => r.status));
    const [statuses] = await Promise.all([Promise.all(saves), del(c, f)]);
    expect(statuses.every((s) => [200, 409, 422].includes(s))).toBe(true);
    for (let round = 0; round < 3; round++) {
      const g = await upload(c, d.id);
      const now = (await get(c, `/studio/styles/${d.id}`)).body as Body;
      await Promise.all([...Array.from({ length: 30 }, (_, i) => patch(c, d.id, { ...now, name: `Round ${round} ${i}`, ...(i % 3 === 0 ? { art: [{ fileId: g }], sound: g } : {}) })), del(c, g)]);
      const stored = ((await db.studioStyle.findUniqueOrThrow({ where: { id: d.id } })).document ?? {}) as Body;
      for (const named of [...((stored.art as Body[]) ?? []).map((a) => a.fileId as string), stored.sound as string | undefined].filter(Boolean) as string[]) {
        const r = await db.storedFile.findUnique({ where: { id: named } });
        expect(r).not.toBeNull();
        expect(r?.status).toBe("ready");
      }
    }
    const stored = ((await db.studioStyle.findUniqueOrThrow({ where: { id: d.id } })).document ?? {}) as Body;
    for (const a of (stored.art as Body[]) ?? []) expect(await db.storedFile.count({ where: { id: a.fileId as string, status: "ready" } })).toBe(1);
  }, 120_000);
});

describe("case 2 (II4): a kept file is recognised wherever an approved document names it", () => {
  it("a poster, a sound, a 3D model, a scene's picture and a thing's artwork named by approved version 1 are kept when their creator deletes them, and a version 1 wish still gets them at its link", async () => {
    const c = await creator();
    const d = await draft(c);
    const f = {
      poster: await upload(c, d.id, "poster"),
      sound: await upload(c, d.id, "sound"),
      model: await upload(c, d.id, "model"),
      backdrop: await upload(c, d.id),
      artwork: await upload(c, d.id),
      loose: await upload(c, d.id),
    };
    const doc = {
      poster: { frame: "cover", src: f.poster },
      sound: f.sound,
      scenes: { letter: { layers: {}, backdrop: f.backdrop, added: [{ id: "m", kind: "model", what: f.model, x: 50, y: 50, w: 30 }, { id: "p", kind: "artwork", what: f.artwork, x: 50, y: 50, w: 30 }] } },
    };
    expect((await save(c, d, doc)).status).toBe(200);
    await approve(c, d);
    const named = [f.poster, f.sound, f.model, f.backdrop, f.artwork].sort();
    const v1 = await madeIn(slugOf(d));
    expect(fileIdsAt(await player(v1.link))).toEqual([...named, f.loose].sort());
    // taken back, every file deleted by its creator: the named ones are kept, the one nothing names goes
    expect((await post(c, `/studio/styles/${d.id}/withdraw`)).status).toBe(200);
    for (const id of Object.values(f)) expect((await del(c, id)).status).toBeLessThan(300);
    for (const id of named) expect((await db.storedFile.findUniqueOrThrow({ where: { id } })).keptAt).not.toBeNull();
    expect(await db.storedFile.count({ where: { id: f.loose } })).toBe(0);
    // a removed file leaves the draft: nothing in the document names any of them now
    const left = ((await db.studioStyle.findUniqueOrThrow({ where: { id: d.id } })).document ?? {}) as Body;
    expect(JSON.stringify(left)).not.toMatch(new RegExp(Object.values(f).join("|")));
    expect(fileIdsAt(await player(v1.link))).toEqual(named);
    const mine = await get(c, `/studio/styles/${d.id}/files`);
    expect(mine.body.items).toEqual([]);
    // version 2 names none of them: the version 1 wish still plays all of them, a new wish gets none
    expect((await save(c, d, { poster: { frame: "cover" }, sound: null, scenes: { letter: { layers: {} } } })).status).toBe(200);
    await approve(c, d);
    expect(fileIdsAt(await player(v1.link))).toEqual(named);
    const v2 = await madeIn(slugOf(d));
    expect(fileIdsAt(await player(v2.link))).toEqual([]);
    // the sweep never takes a file a live wish's version names
    await t.app.get((await import("../../stored-files/file-jobs")).FileJobs).sweepKeptStyleFiles();
    for (const id of named) expect(await db.storedFile.count({ where: { id } })).toBe(1);
  }, 120_000);
});

describe("case 3 (E-196): a style whose creator's account is erased", () => {
  it("the public style read carries no creatorId and an empty byline once the creator is erased; before, it carries the creator", async () => {
    const c = await creator();
    const d = await draft(c);
    await approve(c, d);
    const before = await t.http().get(`/v1/styles/${slugOf(d)}`);
    expect(before.status).toBe(200);
    expect(before.body.creator).toMatchObject({ creatorId: expect.any(String) });
    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "system", id: null, requestId: `ab14-${RUN}` }, reason: "test" });
    const after = await t.http().get(`/v1/styles/${slugOf(d)}`);
    expect(after.status).toBe(200);
    expect(JSON.stringify(after.body.creator ?? null)).not.toContain("creatorId");
    expect(after.body.by).toBe("");
    expect(after.body.document.byline).toBe("");
    expect(JSON.stringify(after.body)).not.toContain(before.body.creator.creatorId);
  });
});

describe("fix round 1 (II5a): the art list is a shelf; only a use needs a ready file", () => {
  const web = (id: string, kind = "image") => ({ id, kind, name: "one.png", size: 40 });

  it("G1: a shelf-only file still being checked (the web adds {id} at screening) saves; a USED held file does not; the send-in is refused in words while the shelf holds one", async () => {
    const c = await creator();
    const d = await draft(c);
    const held = await row(c.id, d.id, "screening");
    const refused = await row(c.id, d.id, "rejected");
    const ready = await upload(c, d.id);
    expect((await save(c, d, { art: [web(ready), web(held), web(refused)] })).status).toBe(200);
    expect((await save(c, d, { art: [web(ready), { fileId: held }] })).status).toBe(200);
    const used = await save(c, d, { art: [web(ready), web(held)], sound: held });
    expect(used.status).toBe(422);
    expect(used.body.error.fields["style.sound"]).toMatch(/The sound names a file that is still being checked/);
    expect((await save(c, d, { art: [web(ready), web(held), web(refused)] })).status).toBe(200);
    const sent = await post(c, `/studio/styles/${d.id}/submissions`);
    expect(sent.status).toBe(422);
    expect(sent.body.error.fields["style.art.1.id"]).toMatch(/^The art list, item 2 names a file that is still being checked/);
    expect(sent.body.error.fields["style.art.2.id"]).toMatch(/was refused/);
    expect(await db.styleSubmission.count({ where: { styleId: d.id } })).toBe(0);
    // another creator's file, another style's file and a gone file stay refused on the shelf
    const other = await creator();
    const od = await draft(other);
    expect((await save(c, d, { art: [web(await upload(other, od.id))] })).status).toBe(422);
    expect((await save(c, d, { art: [web(ids.next())] })).status).toBe(422);
    // the held file becomes ready: it goes
    await db.storedFile.updateMany({ where: { id: { in: [held] } }, data: { status: "ready" } });
    expect((await save(c, d, { art: [web(ready), web(held)] })).status).toBe(200);
    expect((await post(c, `/studio/styles/${d.id}/submissions`)).status).toBe(201);
  });

  it("G2 and G4: an older art item with a non-uuid id (no fileId, or fileId null) named by the sound, a backdrop, an artwork or a fill, and a house bank slug, name no file and save as before", async () => {
    const c = await creator();
    const d = await draft(c);
    for (const item of [{ id: "x1y2z3", kind: "image", name: "old.png" }, { id: "x1y2z3", fileId: null, kind: "image" }]) {
      const r = await save(c, d, {
        art: [item],
        sound: "x1y2z3",
        scenes: { letter: { layers: {}, backdrop: "x1y2z3", added: [{ id: "a", kind: "artwork", what: "x1y2z3" }, { id: "b", kind: "shape", what: "box", fill: { kind: "picture", art: "x1y2z3" } }, { id: "c", kind: "artwork", what: "heart" }, { id: "d", kind: "three", what: "sphere", three: { shape: "sphere" } }] } },
        poster: { frame: "cover", src: "https://example.com/p.png" },
      });
      expect(r.status).toBe(200);
    }
    expect((await post(c, `/studio/styles/${d.id}/submissions`)).status).toBe(201);
  });

  it("G3: a 3D model placed as kind three (shape model, what = the file id) is checked like every place, is kept by II4, and leaves the draft when removed", async () => {
    const c = await creator();
    const d = await draft(c);
    const model = await upload(c, d.id, "model");
    const thing = (what: string) => ({ scenes: { letter: { layers: {}, added: [{ id: "m", kind: "three", what, three: { shape: "model" }, x: 50, y: 50, w: 40 }] } } });
    const other = await creator();
    const od = await draft(other);
    for (const bad of [await upload(other, od.id, "model"), await row(c.id, d.id, "screening"), ids.next()]) {
      const r = await save(c, d, thing(bad));
      expect(r.status).toBe(422);
      expect(r.body.error.fields["style.scenes.letter.added.0.what"]).toMatch(/^Scene letter, added thing 1 \(3D thing\) names a file/);
    }
    expect((await save(c, d, thing(model))).status).toBe(200);
    await approve(c, d);
    const wish = await madeIn(slugOf(d));
    expect(fileIdsAt(await player(wish.link))).toContain(model);
    expect((await post(c, `/studio/styles/${d.id}/withdraw`)).status).toBe(200);
    expect((await del(c, model)).status).toBeLessThan(300);
    expect((await db.storedFile.findUniqueOrThrow({ where: { id: model } })).keptAt).not.toBeNull();
    expect(fileIdsAt(await player(wish.link))).toContain(model);
    expect(JSON.stringify((await db.studioStyle.findUniqueOrThrow({ where: { id: d.id } })).document)).not.toContain(model);
    // a model not kept (a draft only) is stripped from the draft too
    const d2 = await draft(c);
    const m2 = await upload(c, d2.id, "model");
    expect((await save(c, d2, thing(m2))).status).toBe(200);
    expect((await del(c, m2)).status).toBeLessThan(300);
    expect(JSON.stringify((await db.studioStyle.findUniqueOrThrow({ where: { id: d2.id } })).document)).not.toContain(m2);
  }, 120_000);

  it("G5: the public lists carry no creatorId for an erased creator", async () => {
    const c = await creator();
    const d = await draft(c);
    await approve(c, d);
    const at = async () => {
      let cursor: string | undefined;
      for (let page = 0; page < 200; page++) {
        const r = await t.http().get("/v1/styles").query({ limit: 50, ...(cursor ? { cursor } : {}) });
        expect(r.status).toBe(200);
        const hit = (r.body.items as Body[]).find((x) => x.slug === slugOf(d));
        if (hit) return hit;
        cursor = r.body.nextCursor as string | undefined;
        if (!cursor) break;
      }
      throw new Error("the style is not in the public list");
    };
    const live = await at();
    expect(live.creator).toMatchObject({ creatorId: expect.any(String) });
    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "system", id: null, requestId: `ab14g5-${RUN}` }, reason: "test" });
    const gone = await at();
    expect(JSON.stringify(gone.creator ?? null)).not.toContain("creatorId");
  });
});
