import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";
import { lockAccount } from "../../../common/db/account-lock";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { CreatorHandlers } from "../../purchases/creator-handlers";
import { AI_SWEEP_KIND, StudioAiService } from "../studio-ai.service";
import { type Bases, runChecks, type UsedFile } from "../submission-checks";
import { SubmissionsService } from "../submissions.service";
import { RUN } from "../../../../test/kit/unique";

/** P-B15: SA1 to SA5, XX1 to XX3. Every row here is this spec's own. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-02T09:00:00.000Z");
const ids = new UuidV7Maker();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
let db: PrismaService;
let jobs: JobsService;
let reviewer = "";
let reviewerId = "";
let seq = 0;

/** A style as the web's lib/studio.ts makes it: a house scene set, holds as "bars" and "fills", made as kinds, occasions and best. */
const webDoc = (over: Body = {}): Body => ({
  name: "Gold hour", base: "noir", brief: "Warm light.", theme: {}, scenes: { letter: { layers: {} }, ending: { layers: {} } }, art: [],
  made: { kinds: ["love"], occasions: {}, best: "portrait" }, tags: { mood: ["warm"], palette: "gold", family: "noir" }, still: "fade",
  poster: { frame: "cover" }, holds: { portrait: "bars", landscape: "fills" }, ...over,
});

async function creator(opts: { credits?: number; reviewsLeft?: number } = {}) {
  const id = ids.next();
  const n = ++seq;
  const handle = `pb15${tag()}`;
  await db.account.create({ data: { id, contact: `pb15-${RUN}-${n}@example.com`, handle, name: `Zuzu Quillfeather ${n}`, sides: ["person", "creator"] as never, lastSide: "creator" } });
  await db.creator.create({ data: { id: ids.next(), accountId: id, name: `Zuzu Quillfeather ${n}` } });
  const token = `c-${tag()}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides: ["person", "creator"] as never });
  await db.creatorState.create({
    data: {
      id: ids.next(), accountId: id, plan: "creator", credits: opts.credits ?? 3, reviewsLeft: opts.reviewsLeft ?? 3, extraReviews: 0, packs: 0,
      renews: new Date(NOW.getTime() + 20 * 86_400_000), periodEndsAt: new Date(NOW.getTime() + 20 * 86_400_000), on: true, signed: false,
    },
  });
  return { id, handle, contact: `pb15-${RUN}-${n}@example.com`, name: `Zuzu Quillfeather ${n}`, h: { Authorization: `Bearer ${token}` } };
}
type Creator = Awaited<ReturnType<typeof creator>>;
const post = (c: Creator, path: string, body: Body = {}) => t.http().post(`/v1${path}`).set(c.h).send(body);
const patch = (c: Creator, path: string, body: Body) => t.http().patch(`/v1${path}`).set(c.h).send(body);
const decide = (sid: string, body: Body) => t.http().post(`/v1/admin/styles/review/${sid}/decide`).set({ Authorization: `Bearer ${reviewer}` }).send(body);
const credits = async (c: Creator) => (await db.creatorState.findUniqueOrThrow({ where: { accountId: c.id } })).credits;

/** A draft sent in and checked: the submission waits for staff. */
async function waiting(c: Creator, over: Body = {}) {
  const d = await post(c, "/studio/styles", { style: webDoc(over) });
  expect(d.status).toBe(201);
  const s = await post(c, `/studio/styles/${d.body.id as string}/submissions`);
  expect(s.status).toBe(201);
  const sid = s.body.submission.id as string;
  await jobs.runDue(5, [`check:${sid}`]);
  return { styleId: d.body.id as string, sid };
}

// This spec CHANGES a shared catalogue row (it changes a seeded house style or the entitlements book), which other specs read in the shared database: it has a database of its own.
const own = ownDatabase("sp");
beforeAll(async () => {
  own.use();
  t = await createTestApp({ now: NOW });
  db = t.app.get(PrismaService);
  jobs = t.app.get(JobsService);
  t.app.get(SubmissionsService).registerAll();
  t.app.get(StudioAiService).registerAll();
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  await seedRoleTable(db);
  const s = await makeStaff(db, ["reviewer"]);
  reviewer = `staff-reviewer-${tag()}`;
  reviewerId = s.id;
  t.tokens.set(reviewer, { kind: "staff", staffId: s.id, roles: ["reviewer"] });
});
afterAll(async () => {
  await t.close();
  own.drop();
});
beforeEach(() => t.clock.set(NOW));

describe("SA1: one lock order", () => {
  it("accept racing withdraw, 20 times: no 500, the state is one of the two outcomes, at most one audit row (as many as accepts)", async () => {
    const seen = { accepted: 0, withdrawnFirst: 0 };
    for (let i = 0; i < 20; i++) {
      const c = await creator();
      const { styleId, sid } = await waiting(c);
      const [a, w] = await Promise.all([decide(sid, { decision: "approve", reason: "Accept it" }), post(c, `/studio/styles/${styleId}/withdraw`)]);
      expect([a.status, w.status].every((x) => x === 200 || x === 409)).toBe(true);
      const sub = await db.styleSubmission.findUniqueOrThrow({ where: { id: sid } });
      const audits = await db.auditEntry.count({ where: { subjectType: "StyleSubmission", subjectId: sid } });
      const studio = await db.studioStyle.findUniqueOrThrow({ where: { id: styleId } });
      const style = await db.style.findUniqueOrThrow({ where: { id: styleId } });
      if (a.status === 200) {
        seen.accepted++;
        expect(audits).toBe(1);
        expect(sub.status).toBe("live");
        // the withdraw ran after the accept (200: took the live style down) or lost (409)
        expect([studio.status, style.on]).toEqual(w.status === 200 ? ["draft", false] : ["live", true]);
      } else {
        seen.withdrawnFirst++;
        expect(a.status).toBe(409);
        expect(w.status).toBe(200);
        expect(audits).toBe(0);
        expect([sub.status, studio.status, style.on]).toEqual(["returned", "draft", false]);
      }
    }
    expect(seen.accepted + seen.withdrawnFirst).toBe(20);
  });
});

/** The documents the web's checks function reads, with the scene sets the server looks up for them. */
const noir = { slug: "noir", dimension: "flat", kinds: ["love", "celebration", "photographers"] };
const drawn = { slug: "aso-ebi", dimension: "drawn", kinds: ["wedding", "celebration"], occasions: { celebration: ["birthday"], wedding: ["save-the-date", "our-story"] } };
const flat = { slug: "letter", dimension: "flat", kinds: ["love"] };
const run = (doc: Body, files: UsedFile[] = [], bases: Bases = { base: noir }) => runChecks(doc, new Map(files.map((f) => [f.id, f])), bases);
const failed = (r: ReturnType<typeof run>) => r.filter((x) => !x.pass).map((x) => x.key);
const FILE = "0190a000-0000-7000-8000-000000000001";

describe("SA2 / XX1: the eight checks are the web's checks, rule for rule", () => {
  it("a document that passes all eight on the web passes on the server", () => {
    expect(failed(run(webDoc()))).toEqual([]);
    expect(run(webDoc())).toHaveLength(8);
    expect(failed(run(webDoc({ made: { kinds: ["love"], occasions: { love: ["birthday"] }, best: "landscape" }, holds: { portrait: "fills", landscape: "bars" } })))).toEqual([]);
  });

  it("chapters: a kind must be chosen; a required chapter whose title and words are both hidden fails; a hidden title alone does not", () => {
    expect(failed(run(webDoc({ made: { kinds: [], occasions: {}, best: "portrait" } })))).toEqual(["chapters"]);
    const hidden = (layers: Body) => webDoc({ scenes: { letter: { layers }, reasons: { layers } } });
    expect(failed(run(hidden({ title: { hidden: true }, words: { hidden: true } })))).toEqual(["chapters"]);
    expect(run(hidden({ title: { hidden: true }, words: { hidden: true } }))[0].detail).toMatch(/Birthday.*hidden/);
    expect(failed(run(hidden({ title: { hidden: true } })))).toEqual([]);
    // a scene set that does not fit the kind fails; a kind with no occasion the set fits is "no occasion claimed"
    expect(failed(run(webDoc({ made: { kinds: ["wedding"], occasions: {}, best: "portrait" } })))).toEqual(["chapters"]);
    expect(failed(run(webDoc({ made: { kinds: ["love"], occasions: { love: ["no-such-one"] }, best: "portrait" } })))).toEqual(["chapters"]);
    // a set made for some occasions only: the others are not claimed
    expect(failed(run(webDoc({ base: "aso-ebi", fallback: "letter", made: { kinds: ["celebration"], occasions: {}, best: "portrait" } }), [], { base: drawn, fallback: flat }))).toEqual([]);
    // no scene set at all
    expect(failed(run(webDoc({ base: "gone" }), [], {}))).toEqual(expect.arrayContaining(["chapters", "fallback"]));
    // a style made from nothing needs no scene set
    expect(failed(run(webDoc({ base: "blank" }), [], {}))).toEqual([]);
  });

  it("readable: words, quiet words, each scene background, each words layer's colour, and anything under 80%", () => {
    const only = (d: Body) => expect(failed(run(d))).toEqual(["readable"]);
    only(webDoc({ theme: { ink: "#777777", ground: "#888888" } }));
    only(webDoc({ theme: { muted: "#0e0b0a" } }));
    only(webDoc({ scenes: { letter: { ground: "#f1e7dc", layers: {} } } }));
    only(webDoc({ scenes: { letter: { layers: { "words#1": { colour: "#101010" } } } } }));
    only(webDoc({ scenes: { letter: { layers: { "eyebrow#2": { colour: "#222222" } } } } }));
    only(webDoc({ scenes: { letter: { layers: { title: { size: 70 } } } } }));
    // the label needs only 3 : 1; a colour named from the look is read from the look; a photo's colour is not words
    expect(failed(run(webDoc({ scenes: { letter: { layers: { "eyebrow#1": { colour: "#8a8a8a" }, "photo#1": { colour: "#0d0a09" }, "title#1": { colour: "accent" } } } } })))).toEqual([]);
  });

  it("smooth: only effects that are not calm count; added things and the files' weight are the budget", () => {
    const fx = (what: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, kind: "effect", what }));
    expect(failed(run(webDoc({ scenes: { letter: { added: fx("sparkle", 4) } } })))).toEqual(["smooth"]);
    expect(failed(run(webDoc({ scenes: { letter: { added: [...fx("sparkle", 3), ...fx("glow", 5)] } } })))).toEqual([]);
    expect(failed(run(webDoc({ scenes: { letter: { added: Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, kind: "shape", what: "box" })) } } })))).toEqual(["smooth"]);
    // what is added on every scene counts toward each scene
    expect(failed(run(webDoc({ scenes: { "*": { added: fx("rain", 2) }, letter: { added: fx("snow", 2) } } })))).toEqual(["smooth"]);
    const big = Array.from({ length: 4 }, (_, i): UsedFile => ({ id: `0190a000-0000-7000-8000-00000000010${i}`, kind: "sound", bytes: 800 * 1024 }));
    expect(failed(run(webDoc({ art: big.map((f) => ({ fileId: f.id })) }), big))).toEqual(["smooth"]);
  });

  it("still: something must be chosen", () => {
    expect(failed(run(webDoc({ still: "" })))).toEqual(["still"]);
    expect(failed(run(webDoc({ still: undefined })))).toEqual(["still"]);
  });

  it("holds: the web writes bars, fills or breaks for each; both must be looked at, and neither may break", () => {
    expect(failed(run(webDoc({ holds: { portrait: "bars" } })))).toEqual(["holds"]);
    expect(failed(run(webDoc({ holds: undefined })))).toEqual(["holds"]);
    expect(failed(run(webDoc({ holds: { portrait: "bars", landscape: "breaks" } })))).toEqual(["holds"]);
    expect(run(webDoc({ holds: { portrait: "breaks", landscape: "breaks" } }))[4].detail).toMatch(/Portrait and Landscape/);
    expect(failed(run(webDoc({ holds: { portrait: true, landscape: true } })))).toEqual([]);
  });

  it("fallback: a scene set that is not flat needs a flat one", () => {
    const d = (o: Body = {}) => webDoc({ base: "aso-ebi", made: { kinds: ["celebration"], occasions: { celebration: ["birthday"] }, best: "portrait" }, ...o });
    expect(failed(run(d(), [], { base: drawn }))).toEqual(["fallback"]);
    expect(failed(run(d({ fallback: "letter" }), [], { base: drawn, fallback: flat }))).toEqual([]);
    expect(failed(run(d({ fallback: "other" }), [], { base: drawn, fallback: drawn }))).toEqual(["fallback"]);
    expect(failed(run(d({ fallback: "gone" }), [], { base: drawn }))).toEqual(["fallback"]);
    expect(failed(run(webDoc({ fallback: undefined }), [], { base: noir }))).toEqual([]);
  });

  it("touch: it fails only when the ending's action is hidden, not when no ending is named", () => {
    expect(failed(run(webDoc({ ending: undefined })))).toEqual([]);
    expect(failed(run(webDoc({ scenes: { letter: { layers: {} }, ending: { layers: { "action#1": { hidden: true } } } } })))).toEqual(["touch"]);
    expect(failed(run(webDoc({ scenes: { ending: { layers: { "action#1": { hidden: false }, "title#1": { hidden: true } } } } })))).toEqual([]);
  });

  it("safe (kept stricter): a file that is not one of the account's ready files, or is too big, fails", () => {
    expect(failed(run(webDoc({ art: [{ fileId: FILE }] })))).toEqual(["safe"]);
    const img: UsedFile = { id: FILE, kind: "image", bytes: 401 * 1024 };
    expect(failed(run(webDoc({ art: [{ fileId: FILE }] }), [img]))).toEqual(["safe"]);
    expect(failed(run(webDoc({ art: [{ fileId: FILE }] }), [{ ...img, bytes: 400 * 1024 }]))).toEqual([]);
  });

  it("a piece skips chapters, fallback and (unless it is an ending) touch, as the web does", () => {
    const bad = { made: { kinds: [], occasions: {}, best: "portrait" }, scenes: { ending: { layers: { "action#1": { hidden: true } } } } };
    expect(failed(run(webDoc({ ...bad, piece: "opening" })))).toEqual([]);
    expect(failed(run(webDoc({ ...bad, piece: "ending" })))).toEqual(["touch"]);
    expect(failed(run(webDoc({ ...bad, piece: "style" })))).toEqual(expect.arrayContaining(["chapters", "touch"]));
    expect(failed(run(webDoc({ piece: "opening", base: "aso-ebi" }), [], { base: drawn }))).toEqual([]);
    expect(run(webDoc({ piece: "opening" }))).toHaveLength(8);
  });

  it("through a real submit: the scene set is read from its Template row, and the failing rule alone returns the style", async () => {
    const c = await creator();
    const { styleId, sid } = await waiting(c, { base: "aso-ebi", made: { kinds: ["celebration"], occasions: { celebration: ["birthday"] }, best: "portrait" } });
    const sub = await db.styleSubmission.findUniqueOrThrow({ where: { id: sid } });
    expect(sub.status).toBe("returned");
    expect((sub.checks as Body[]).filter((x) => !x.pass).map((x): string => x.key as string)).toEqual(["fallback"]);
    expect((await db.studioStyle.findUniqueOrThrow({ where: { id: styleId } })).status).toBe("returned");
    const ok = await waiting(c);
    expect((await db.styleSubmission.findUniqueOrThrow({ where: { id: ok.sid } })).status).toBe("review");
  });
});

describe("SA3: the AI's answer goes through the save's shape check", () => {
  const rubbish: [string, Body][] = [
    ["theme a number", { said: ["Done."], theme: 12345 }],
    ["tags a string", { said: ["Done."], tags: "x" }],
    ["made a string", { said: ["Done."], made: "x" }],
    ["scenes with a scene that is not an object", { said: ["Done."], scenes: { a: 5 } }],
    ["said with markup", { said: ["<img src=x onerror=alert(1)>"] }],
    ["said not a list", { said: "Done." }],
    ["said with a thing that is not text", { said: ["Done.", 7] }],
    ["base not text", { said: ["Done."], base: 4 }],
    ["ops with a thing that is not an object", { said: ["Done."], ops: ["x"] }],
    ["scenes an array", { said: ["Done."], scenes: [] }],
  ];
  it.each(rubbish)("%s: 502, and the credits come back once", async (_name, answer) => {
    const c = await creator({ credits: 4 });
    t.ai.queue(JSON.stringify(answer));
    const r = await post(c, "/ai/studio-change", { instruction: "warmer", style: webDoc() });
    expect(r.status).toBe(502);
    expect(await credits(c)).toBe(4);
    const rows = await db.aiRequest.findMany({ where: { accountId: c.id } });
    expect(rows.map((x) => x.status)).toEqual(["failed"]);
  });

  it("a good answer still goes through, with the credit taken", async () => {
    const c = await creator({ credits: 4 });
    t.ai.queue(JSON.stringify({ said: ["Warmer."], theme: { ink: "#111111" }, scenes: { letter: { layers: {} } }, made: { kinds: ["love"] }, tags: { mood: [] } }));
    const r = await post(c, "/ai/studio-change", { instruction: "warmer", style: webDoc() });
    expect(r.status).toBe(200);
    expect(r.body.credits).toBe(3);
  });
});

describe("SA4: the erase of a creator with an accepted style", () => {
  it("the style still plays, and no name, handle, email or typed brief stays in any table or in Style.by", async () => {
    const c = await creator({ credits: 8 });
    const needles = [c.name, c.handle, c.contact, "zq-brief-7731", "zq-rights-words-5520", "zq-ask-9912"];
    // an older submission that was returned keeps a snapshot too
    const first = await waiting(c, { brief: "zq-brief-7731 write to zq-mail-1@example.test", rights: { confirmed: true, words: "zq-rights-words-5520" } });
    expect((await decide(first.sid, { decision: "return", reason: "Please fix the words", note: "Please fix the words" })).status).toBe(200);
    const again = await post(c, `/studio/styles/${first.styleId}/submissions`);
    expect(again.status).toBe(201);
    await jobs.runDue(5, [`check:${again.body.submission.id as string}`]);
    expect((await decide(again.body.submission.id as string, { decision: "approve", reason: "Accept it" })).status).toBe(200);
    // a wish already made in it, and an AI request with words the creator typed
    const made = await t.http().post("/v1/wishes").set(c.h).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: `studio-${first.styleId}` });
    expect(made.status).toBe(201);
    t.ai.queue(JSON.stringify({ said: ["Warmer."] }));
    expect((await post(c, "/ai/studio-change", { instruction: "zq-ask-9912", style: webDoc() })).status).toBe(200);
    const before = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM style WHERE id = ${first.styleId}::uuid AND ("by" LIKE ${`%${c.handle}%`} OR line LIKE '%zq-brief%')`;
    expect(Number(before[0].n)).toBe(1);

    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "staff", id: reviewerId, requestId: "r-pb15" }, reason: "Asked to erase" });

    const style = await db.style.findUniqueOrThrow({ where: { id: first.styleId } });
    expect(style).toMatchObject({ on: true, by: "", house: false });
    expect((await t.http().get(`/v1/styles/studio-${first.styleId}`)).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: made.body.id as string } })).styleSlug).toBe(`studio-${first.styleId}`);
    const doc = (await db.studioStyle.findUniqueOrThrow({ where: { id: first.styleId } })).document as Body;
    expect(doc).toMatchObject({ name: "Gold hour", base: "noir", still: "fade" });
    expect(doc).not.toHaveProperty("brief");
    expect(doc.byline).toBeUndefined();
    const snaps = await db.$queryRaw<{ document: Body }[]>`SELECT s.document FROM style_submission_snapshot s JOIN style_submission u ON u.id = s."submissionId" WHERE u."styleId" = ${first.styleId}::uuid`;
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    for (const s of snaps) expect(s.document).toMatchObject({ name: "Gold hour", base: "noir" });
    // every table, every row, as text
    const tables = (await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).map((x) => x.tablename);
    const hits: string[] = [];
    for (const table of tables) {
      for (const n of needles) {
        const r = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}" x WHERE x::text ILIKE $1`, `%${n}%`);
        if (Number(r[0].n) > 0) hits.push(`${table}: ${n}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("SA5: only a style that is on can be picked", () => {
  const wish = (c: Creator, style: string) => t.http().post("/v1/wishes").set(c.h).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style });

  it("held, returned and off are 422; one already made keeps playing; a live one is picked", async () => {
    const c = await creator();
    const { styleId, sid } = await waiting(c);
    // held: sent in, waiting
    let r = await wish(c, `studio-${styleId}`);
    expect(r.status).toBe(422);
    expect(r.body.error.fields).toHaveProperty("style");
    // live: picked
    expect((await decide(sid, { decision: "approve", reason: "Accept it" })).status).toBe(200);
    r = await wish(c, `studio-${styleId}`);
    expect(r.status).toBe(201);
    const wishId = r.body.id as string;
    // off again (the creator takes it back): new wishes refused, the one made keeps its style
    expect((await post(c, `/studio/styles/${styleId}/withdraw`)).status).toBe(200);
    expect((await wish(c, `studio-${styleId}`)).status).toBe(422);
    expect((await db.wish.findUniqueOrThrow({ where: { id: wishId } })).styleSlug).toBe(`studio-${styleId}`);
    const repick = await t.http().patch(`/v1/wishes/${wishId}`).set(c.h).send({ version: 0, style: `studio-${styleId}` });
    // J8: a draft saved again with its own current style is accepted after that style went off (only a CHANGE to an off style is 422)
    expect(repick.status).toBe(200);
    // returned by staff
    const second = await waiting(c);
    expect((await decide(second.sid, { decision: "return", reason: "Not this one", note: "Not this one" })).status).toBe(200);
    expect((await wish(c, `studio-${second.styleId}`)).status).toBe(422);
    // a house style that is off
    await db.style.update({ where: { slug: "letter" }, data: { on: false } });
    try {
      expect((await wish(c, "letter")).status).toBe(422);
    } finally {
      await db.style.update({ where: { slug: "letter" }, data: { on: true } });
    }
    expect((await wish(c, "noir")).status).toBe(201);
  });

  it("PATCH {on} on a style in review is 409 style_locked; a draft takes it", async () => {
    const c = await creator();
    const d = await post(c, "/studio/styles", { style: webDoc() });
    expect((await patch(c, `/studio/styles/${d.body.id as string}`, { on: true })).status).toBe(200);
    const s = await post(c, `/studio/styles/${d.body.id as string}/submissions`);
    expect(s.status).toBe(201);
    const r = await patch(c, `/studio/styles/${d.body.id as string}`, { on: false });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("style_locked");
  });
});

describe("XX2: an AI request left waiting 5 minutes is failed and its credits come back once", () => {
  const request = (accountId: string, createdAt: Date, status: "queued" | "done" = "queued") => {
    const id = ids.next();
    return db.aiRequest.create({ data: { id, accountId, kind: "studio_change", creditsSpent: 1, status, model: "pending", createdAt } as never });
  };

  it("swept by the job (run with only): marked failed, credits back once; a second run gives nothing more", async () => {
    const c = await creator({ credits: 0 });
    const old = await request(c.id, new Date(NOW.getTime() - 5 * 60_000));
    const young = await request(c.id, new Date(NOW.getTime() - 5 * 60_000 + 1_000));
    const done = await request(c.id, new Date(NOW.getTime() - 60 * 60_000), "done");
    const key = `ai-sweep:pb15-${tag()}`;
    await jobs.schedule(AI_SWEEP_KIND, NOW, key);
    expect(await jobs.runDue(5, [key])).toBe(1);
    const st = async (id: string) => (await db.aiRequest.findUniqueOrThrow({ where: { id } })).status;
    expect([await st(old.id), await st(young.id), await st(done.id)]).toEqual(["failed", "queued", "done"]);
    expect(await credits(c)).toBe(1);
    // the same instant again: nothing more
    expect(await t.app.get(StudioAiService).sweepStale()).toBe(0);
    expect(await credits(c)).toBe(1);
    // a minute on, the young one has waited its five minutes
    t.clock.set(new Date(NOW.getTime() + 60_000));
    expect(await jobs.runDue(5, [key])).toBe(1);
    expect(await st(young.id)).toBe("failed");
    expect(await credits(c)).toBe(2);
    t.clock.set(new Date(NOW.getTime() + 3_600_000));
    // the job asks to run again, so it is due an hour on, and finds nothing waiting
    expect(await jobs.runDue(5, [key])).toBe(1);
    expect(await t.app.get(StudioAiService).sweepStale()).toBe(0);
    expect(await credits(c)).toBe(2);
    expect(await st(done.id)).toBe("done");
  });

  it("a late answer after the sweep keeps no output and gives nothing twice", async () => {
    const c = await creator({ credits: 2 });
    const svc = t.app.get(StudioAiService);
    const slow = jest.spyOn(svc["ai"], "write").mockImplementationOnce(async () => {
      t.clock.set(new Date(NOW.getTime() + 6 * 60_000));
      await svc.sweepStale();
      return { text: JSON.stringify({ said: ["Late."] }), model: "standin" };
    });
    try {
      const r = await post(c, "/ai/studio-change", { instruction: "warmer", style: webDoc() });
      expect(r.status).toBe(502);
    } finally {
      slow.mockRestore();
    }
    expect(await credits(c)).toBe(2);
    expect((await db.aiRequest.findMany({ where: { accountId: c.id } })).map((x) => [x.status, x.output])).toEqual([["failed", null]]);
  });
});

describe("XX3: Open's 3 credits are given once whichever code makes the creator's row first", () => {
  const handlers = () => t.app.get<{ lockState: (tx: unknown, id: string) => Promise<unknown> }>(CreatorHandlers);
  /** As a settlement does it: the account is locked, then the handler makes or reads the row. */
  const locked = (id: string) =>
    db.$transaction(async (tx) => {
      await lockAccount(tx, id);
      return handlers().lockState(tx, id);
    });
  const person = async () => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `pb15x-${RUN}-${++seq}@example.com`, sides: ["person", "creator"] as never, lastSide: "creator" } });
    const token = `x-${tag()}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person", "creator"] as never });
    return { id, h: { Authorization: `Bearer ${token}` } };
  };
  const state = (id: string) => db.creatorState.findUniqueOrThrow({ where: { accountId: id } });

  it("the Studio first, then a purchase's handler: 3 credits, once", async () => {
    const a = await person();
    expect((await t.http().get("/v1/studio/me").set(a.h)).body.credits).toBe(3);
    await locked(a.id);
    await locked(a.id);
    expect((await state(a.id)).credits).toBe(3);
    expect((await t.http().get("/v1/studio/me").set(a.h)).body.credits).toBe(3);
  });

  it("a purchase's handler first, then the Studio: 3 credits, once, with the month's review and the Studio on", async () => {
    const a = await person();
    await locked(a.id);
    expect(await state(a.id)).toMatchObject({ credits: 3, plan: "open", on: true, reviewsLeft: 1 });
    const me = await t.http().get("/v1/studio/me").set(a.h);
    expect(me.body).toMatchObject({ credits: 3, plan: "open", reviewsLeft: 1, on: true });
    expect((await t.http().get("/v1/studio/me").set(a.h)).body.credits).toBe(3);
  });

  it("both at once: one row, 3 credits", async () => {
    const a = await person();
    await Promise.all([locked(a.id), t.http().get("/v1/studio/me").set(a.h), t.http().get("/v1/studio/me").set(a.h)]);
    expect(await db.creatorState.count({ where: { accountId: a.id } })).toBe(1);
    expect((await state(a.id)).credits).toBe(3);
  });
});
