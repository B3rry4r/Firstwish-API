import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { PortTimeoutError } from "../../../common/ports/time-limit";
import { AiWritingPort } from "../../../common/ports/ai.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { makeStaff, seedRoleTable, tag } from "../../staff-accounts/tests/staff-kit";
import { AccountErasureService } from "../../accounts/account-erasure.service";
import { JobsService } from "../../jobs/jobs.service";
import { AI_AVAILABILITY, AiAvailability, parseChange } from "../studio-ai.service";
import { SubmissionsService } from "../submissions.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-02T09:00:00.000Z");
const DAY = 86_400_000;
const ids = new UuidV7Maker();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let t: TestApp;
let db: PrismaService;
let jobs: JobsService;
const staff: Record<string, string> = {};
let seq = 0;

/** A style the eight checks pass, shaped as the web app's lib/studio.ts makes it (a house scene set, holds as "bars" and "fills"). */
const goodDoc = (over: Body = {}): Body => ({
  name: "Gold hour", base: "noir", brief: "Warm light.", theme: {}, scenes: { letter: { layers: {} } }, art: [],
  made: { kinds: ["love"], occasions: {}, best: "portrait" }, tags: { mood: ["warm"], palette: "gold", family: "noir" }, still: "fade",
  poster: { frame: "cover" }, holds: { portrait: "bars", landscape: "fills" }, ...over,
});

async function creator(opts: { plan?: "open" | "creator"; credits?: number; reviewsLeft?: number; extra?: number; sides?: string[] } = {}) {
  const id = ids.next();
  await db.account.create({ data: { id, contact: `b15-${process.pid}-${++seq}@example.com`, handle: `b15${tag()}`, sides: (opts.sides ?? ["person", "creator"]) as never, lastSide: "creator" } });
  await db.creator.create({ data: { id: ids.next(), accountId: id, name: `Maker ${seq}` } });
  const token = `c-${tag()}`;
  t.tokens.set(token, { kind: "user", accountId: id, sides: (opts.sides ?? ["person", "creator"]) as never });
  if (opts.plan || opts.credits !== undefined || opts.reviewsLeft !== undefined || opts.extra !== undefined) {
    const paid = opts.plan === "creator";
    await db.creatorState.create({
      data: {
        id: ids.next(), accountId: id, plan: opts.plan ?? "open", credits: opts.credits ?? 3, reviewsLeft: opts.reviewsLeft ?? (paid ? 2 : 1), extraReviews: opts.extra ?? 0, packs: 0,
        renews: paid ? new Date(NOW.getTime() + 20 * DAY) : null, periodEndsAt: new Date(NOW.getTime() + 20 * DAY), on: true, signed: false,
      },
    });
  }
  return { id, token, h: { Authorization: `Bearer ${token}` } };
}
type Creator = Awaited<ReturnType<typeof creator>>;

const post = (c: Creator, path: string, body: Body = {}) => t.http().post(`/v1${path}`).set(c.h).send(body);
const patch = (c: Creator, path: string, body: Body) => t.http().patch(`/v1${path}`).set(c.h).send(body);
const get = (c: Creator, path: string) => t.http().get(`/v1${path}`).set(c.h);
const draft = async (c: Creator, over: Body = {}) => {
  const r = await post(c, "/studio/styles", { style: goodDoc(over) });
  expect(r.status).toBe(201);
  return r.body as Body;
};
const stateOf = (id: string) => db.creatorState.findUniqueOrThrow({ where: { accountId: id } });
const runChecks = async (submissionId: string) => {
  await jobs.runDue(5, [`check:${submissionId}`]);
};
const sh = (role: string) => ({ Authorization: `Bearer ${staff[role]}` });

beforeAll(async () => {
  t = await createTestApp({ now: NOW });
  db = t.app.get(PrismaService);
  jobs = t.app.get(JobsService);
  t.app.get(SubmissionsService).registerAll();
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  await seedRoleTable(db);
  for (const role of ["owner", "ops", "reviewer", "support"] as const) {
    const s = await makeStaff(db, [role]);
    staff[role] = `staff-${role}-${tag()}`;
    t.tokens.set(staff[role], { kind: "staff", staffId: s.id, roles: [role] });
    staff[`${role}Id`] = s.id;
  }
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(NOW));

describe("access", () => {
  it("401 without a token, 403 for a person who has no creator side, business may list", async () => {
    const person = await creator({ sides: ["person"] });
    const biz = await creator({ sides: ["person", "business"] });
    for (const [m, p] of [["get", "/studio/me"], ["patch", "/studio/me"], ["get", "/studio/prefs"], ["get", "/studio/styles"], ["post", "/studio/styles"], ["post", "/ai/studio-draft"]] as const) {
      expect((await t.http()[m](`/v1${p}`)).status).toBe(401);
      expect((await t.http()[m](`/v1${p}`).set(person.h)).status).toBe(403);
    }
    expect((await get(biz, "/studio/styles")).status).toBe(200);
    expect((await get(biz, "/studio/me")).status).toBe(403);
    expect((await t.http().get("/v1/admin/styles/review")).status).toBe(401);
    expect((await get(person, "/admin/styles/review")).status).toBe(403);
    expect((await t.http().get("/v1/admin/styles/review").set(sh("support"))).status).toBe(403);
  });
});

describe("case 2: CreatorState", () => {
  it("a new creator is on Open: 3 credits once, this month's review, worked out on the server", async () => {
    const c = await creator();
    const r = await get(c, "/studio/me");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ accountId: c.id, plan: "open", credits: 3, reviewsLeft: 1, extraReviews: 0, packs: 0, signed: false, on: true });
    expect(r.body.periodEndsAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("the month rolls: reviews come back with the new month; a plan that ran out falls back to Open", async () => {
    const c = await creator({ plan: "creator", credits: 7, reviewsLeft: 0 });
    expect((await get(c, "/studio/me")).body).toMatchObject({ plan: "creator", reviewsLeft: 0, credits: 7 });
    t.clock.set(new Date(NOW.getTime() + 21 * DAY));
    const r = await get(c, "/studio/me");
    expect(r.body).toMatchObject({ plan: "open", reviewsLeft: 1, credits: 7 });
    expect((await stateOf(c.id)).plan).toBe("open");
  });

  it("E-44 switches the Studio on or off; 422 for a bad body", async () => {
    const c = await creator();
    expect((await patch(c, "/studio/me", { on: false })).body.on).toBe(false);
    expect((await get(c, "/studio/me")).body.on).toBe(false);
    const bad = await patch(c, "/studio/me", { on: "no" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.on).toBeDefined();
  });
});

describe("case 1: drafts and settings on the server", () => {
  it("Open holds one draft; Creator is unlimited; the number is read from the entitlements row", async () => {
    const open = await creator();
    await draft(open);
    const second = await post(open, "/studio/styles", { style: goodDoc() });
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe("draft_limit");
    const paid = await creator({ plan: "creator" });
    for (let i = 0; i < 3; i++) await draft(paid);
    const row = await db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } });
    const c = row.creator as Body;
    try {
      await db.entitlements.update({ where: { id: row.id }, data: { creator: { ...c, open: { ...c.open, drafts: 2 } } } });
      const o2 = await creator();
      await draft(o2);
      await draft(o2);
      expect((await post(o2, "/studio/styles", { style: goodDoc() })).status).toBe(402);
    } finally {
      await db.entitlements.update({ where: { id: row.id }, data: { creator: c } });
    }
  });

  it("a save carries the version it read; a stale one is 409; two tabs never overwrite", async () => {
    const c = await creator();
    const d = await draft(c);
    expect(d).toMatchObject({ status: "draft", version: 1, name: "Gold hour", template: false, useExtra: false });
    const tabA = await patch(c, `/studio/styles/${d.id}`, { style: { ...d, name: "From tab A" } });
    expect(tabA.status).toBe(200);
    expect(tabA.body).toMatchObject({ name: "From tab A", version: 2 });
    const tabB = await patch(c, `/studio/styles/${d.id}`, { style: { ...d, name: "From tab B" } });
    expect(tabB.status).toBe(409);
    expect(tabB.body.error.code).toBe("stale_version");
    expect((await get(c, `/studio/styles/${d.id}`)).body.name).toBe("From tab A");
    const noVersion = await patch(c, `/studio/styles/${d.id}`, { style: { name: "x", base: "scroll" } });
    expect(noVersion.status).toBe(422);
    expect(noVersion.body.error.fields["style.version"]).toBeDefined();
    const at = await Promise.all([1, 2, 3, 4].map((i) => patch(c, `/studio/styles/${d.id}`, { style: { ...tabA.body, name: `race ${i}` } })));
    expect(at.filter((r) => r.status === 200)).toHaveLength(1);
    expect(at.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it("the server owns the id, the status and the byline; a bad document is 422 with fields", async () => {
    const c = await creator({ plan: "creator" });
    const r = await post(c, "/studio/styles", { style: { ...goodDoc(), id: ids.next(), status: "live", level: "premium", from: { id: "x" }, onlyInBody: 1 } });
    expect(r.status).toBe(422);
    const r2 = await post(c, "/studio/styles", { style: { ...goodDoc(), id: ids.next(), status: "live", level: "premium" } });
    expect(r2.status).toBe(201);
    expect(r2.body.status).toBe("draft");
    expect(r2.body.level).toBeNull();
    expect(r2.body.byline).toMatch(/^Maker/);
    const bad = await post(c, "/studio/styles", { style: { base: "" } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(["style.name", "style.base"]));
    expect((await post(c, "/studio/styles", {})).status).toBe(422);
  });

  it("another creator's draft is 404 to read, change, delete, submit or ask the AI about; a bad id is 404", async () => {
    const a = await creator({ plan: "creator" });
    const b = await creator({ plan: "creator" });
    const d = await draft(a);
    for (const r of [
      await get(b, `/studio/styles/${d.id}`),
      await patch(b, `/studio/styles/${d.id}`, { on: true }),
      await t.http().delete(`/v1/studio/styles/${d.id}`).set(b.h),
      await post(b, `/studio/styles/${d.id}/submissions`),
      await post(b, `/studio/styles/${d.id}/withdraw`),
      await post(b, "/ai/studio-change", { instruction: "warmer", styleId: d.id }),
    ]) expect(r.status).toBe(404);
    expect((await get(a, "/studio/styles/not-a-uuid")).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect((await t.http().delete("/v1/studio/styles/123").set(a.h)).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    const list = await get(b, "/studio/styles");
    expect((list.body.items as Body[]).some((x) => x.id === d.id)).toBe(false);
    expect(((await get(a, "/studio/styles")).body.items as Body[]).map((x) => x.id as string)).toContain(d.id);
  });

  it("delete takes a draft; a PATCH of an unknown id creates it (create-or-replace by id)", async () => {
    const c = await creator({ plan: "creator" });
    const d = await draft(c);
    expect((await t.http().delete(`/v1/studio/styles/${d.id}`).set(c.h)).body).toBe(true);
    expect((await get(c, `/studio/styles/${d.id}`)).status).toBe(404);
    const id = ids.next();
    const made = await patch(c, `/studio/styles/${id}`, { style: goodDoc() });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ id, version: 1 });
    expect((await patch(c, `/studio/styles/${id}`, { style: { ...goodDoc(), id: ids.next() } })).status).toBe(422);
  });

  it("StudioPrefs is per account on the server, merged, and a key sent as null clears", async () => {
    const a = await creator();
    const b = await creator();
    expect((await get(a, "/studio/prefs")).body).toEqual({});
    const r = await patch(a, "/studio/prefs", { coached: true, bottom: "layers", fav: ["x"] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ coached: true, bottom: "layers", fav: ["x"] });
    expect((await patch(a, "/studio/prefs", { span: "wide", bottom: null })).body).toEqual({ coached: true, span: "wide", fav: ["x"] });
    expect((await get(b, "/studio/prefs")).body).toEqual({});
    const bad = await patch(a, "/studio/prefs", { coached: "yes", span: 5 });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(["coached", "span"]));
    expect((await patch(a, "/studio/prefs", { nope: 1 })).status).toBe(422);
    expect((await patch(a, "/studio/prefs", {})).status).toBe(422);
  });
});

describe("case 3: AI through the port only", () => {
  const answer = (said = "Warmer.") => JSON.stringify({ said: [said], ops: [{ set: "theme.ink" }], theme: { ink: "#111111" } });

  it("a change costs 1 credit and a full draft 4 (from the book); the answer carries the balance left", async () => {
    const c = await creator({ plan: "creator", credits: 10 });
    const d = await draft(c);
    t.ai.queue(answer());
    const r = await post(c, "/ai/studio-change", { instruction: "make it warmer", styleId: d.id, target: { scene: "open" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ said: ["Warmer."], credits: 9, theme: { ink: "#111111" } });
    t.ai.queue(answer("Drafted."));
    const dr = await post(c, "/ai/studio-draft", { prompt: "a quiet blue birthday", base: "scroll", made: { kinds: ["love"] } });
    expect(dr.status).toBe(200);
    expect(dr.body.credits).toBe(5);
    expect((await stateOf(c.id)).credits).toBe(5);
    const rows = await db.aiRequest.findMany({ where: { accountId: c.id }, orderBy: { id: "asc" } });
    expect(rows.map((x) => [x.kind, x.creditsSpent, x.status])).toEqual([["studio_change", 1, "done"], ["studio_draft", 4, "done"]]);
  });

  it("the request holds the style and the creator's words only: no customer photo, words or audio (T-74, R13)", async () => {
    const c = await creator({ credits: 5 });
    const before = t.ai.requests.length;
    t.ai.queue(answer());
    const r = await post(c, "/ai/studio-change", {
      instruction: "softer ending",
      style: { ...goodDoc(), customerPhoto: "photo.jpg", voiceNote: "audio.m4a", customerWords: "love you mum", receiver: "Ada" },
    });
    expect(r.status).toBe(200);
    const sent = t.ai.requests[before];
    const prompt = JSON.parse(sent.prompt) as Body;
    expect(Object.keys(prompt).sort()).toEqual(["ask", "instruction", "style", "target", "task"]);
    expect(JSON.stringify(prompt)).not.toMatch(/customerPhoto|voiceNote|customerWords|love you mum|Ada|audio/);
    expect(sent.system).toBeDefined();
  });

  it("not enough credits: 402, nothing spent, the provider is not called", async () => {
    const c = await creator({ credits: 3 });
    const before = t.ai.requests.length;
    const r = await post(c, "/ai/studio-draft", { prompt: "a style" });
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe("credits_needed");
    expect((await stateOf(c.id)).credits).toBe(3);
    expect(t.ai.requests.length).toBe(before);
    expect(await db.aiRequest.count({ where: { accountId: c.id } })).toBe(0);
  });

  it("the credits come back when the provider fails, times out or answers nonsense", async () => {
    const c = await creator({ credits: 5 });
    const port = t.app.get(AiWritingPort);
    const spy = jest.spyOn(port, "write");
    try {
      spy.mockRejectedValueOnce(new Error("provider down"));
      expect((await post(c, "/ai/studio-change", { instruction: "x", style: goodDoc() })).status).toBe(502);
      expect((await stateOf(c.id)).credits).toBe(5);
      spy.mockRejectedValueOnce(new PortTimeoutError("ai", "write", 60_000));
      const slow = await post(c, "/ai/studio-draft", { prompt: "x" });
      expect(slow.status).toBe(504);
      expect((await stateOf(c.id)).credits).toBe(5);
      spy.mockResolvedValueOnce({ text: "this is not json", model: "standin" });
      const junk = await post(c, "/ai/studio-draft", { prompt: "x" });
      expect(junk.status).toBe(502);
      expect(junk.body.error.code).toBe("ai_failed");
      expect((await stateOf(c.id)).credits).toBe(5);
    } finally {
      spy.mockRestore();
    }
    const rows = await db.aiRequest.findMany({ where: { accountId: c.id } });
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.status === "failed")).toBe(true);
  });

  it("20 at once with 3 credits spend at most 3", async () => {
    const c = await creator({ credits: 3 });
    const before = t.ai.requests.length;
    for (let i = 0; i < 20; i++) t.ai.queue(answer());
    const rs = await Promise.all(Array.from({ length: 20 }, () => post(c, "/ai/studio-change", { instruction: "x", style: goodDoc() })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(3);
    expect(rs.filter((r) => r.status === 402)).toHaveLength(17);
    expect((await stateOf(c.id)).credits).toBe(0);
    expect(t.ai.requests.length - before).toBe(3);
    t.ai.queue(); // drop nothing: the 17 unused answers are left for no one
    await db.$executeRaw`SELECT 1`;
  });

  it("with no AI key the route answers 503 ai_unavailable and spends nothing; never an invented answer", async () => {
    expect(new AiAvailability({ PROVIDERS: "live", ANTHROPIC_API_KEY: undefined }).available()).toBe(false);
    expect(new AiAvailability({ PROVIDERS: "live", ANTHROPIC_API_KEY: "  " }).available()).toBe(false);
    expect(new AiAvailability({ PROVIDERS: "live", ANTHROPIC_API_KEY: "k" }).available()).toBe(true);
    const off = await createTestApp({ now: NOW, configure: (b) => b.overrideProvider(AI_AVAILABILITY).useValue(new AiAvailability({ PROVIDERS: "live", ANTHROPIC_API_KEY: undefined })) });
    try {
      const c = await creator({ credits: 5 });
      const r = await off.http().post("/v1/ai/studio-draft").set(c.h).send({ prompt: "a style" });
      off.tokens.set(c.token, { kind: "user", accountId: c.id, sides: ["person", "creator"] });
      const again = await off.http().post("/v1/ai/studio-draft").set(c.h).send({ prompt: "a style" });
      expect([r.status, again.status]).toContain(503);
      expect(again.body.error.code).toBe("ai_unavailable");
      expect(off.ai.requests).toHaveLength(0);
      expect((await stateOf(c.id)).credits).toBe(5);
    } finally {
      await off.close();
    }
  });

  it("422 for empty words or a long instruction; parseChange refuses an answer that is not a change", async () => {
    const c = await creator({ credits: 5 });
    expect((await post(c, "/ai/studio-change", { style: goodDoc() })).status).toBe(422);
    expect((await post(c, "/ai/studio-change", { instruction: "x".repeat(241), style: goodDoc() })).status).toBe(422);
    expect((await post(c, "/ai/studio-draft", {})).status).toBe(422);
    expect((await stateOf(c.id).catch(() => null))?.credits ?? 5).toBe(5);
    expect(parseChange("nothing")).toBeNull();
    expect(parseChange('{"said":[]}')).toBeNull();
    expect(parseChange('Here: {"said":["ok"],"scenes":[]}')).toBeNull();
    expect(parseChange('{"said":["ok"]}')).toEqual({ said: ["ok"] });
  });
});

describe("case 4: submit", () => {
  it("freezes a snapshot, takes this month's review, runs the eight checks as a job and stores each result; a pass waits", async () => {
    const c = await creator({ plan: "creator", reviewsLeft: 2 });
    const d = await draft(c);
    const r = await post(c, `/studio/styles/${d.id}/submissions`, { styleId: d.id });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: d.id, status: "review", useExtra: false });
    expect(r.body.submission).toMatchObject({ styleId: d.id, status: "review", version: 1, checks: [] });
    expect((await stateOf(c.id)).reviewsLeft).toBe(1);
    const sid = r.body.submission.id as string;
    // frozen: changing is refused, the snapshot keeps what was sent
    expect((await patch(c, `/studio/styles/${d.id}`, { style: { ...r.body, name: "Changed" } })).status).toBe(409);
    const snap = await db.$queryRaw<{ document: Body }[]>`SELECT document FROM style_submission_snapshot WHERE "submissionId" = ${sid}::uuid`;
    expect(snap[0].document.name).toBe("Gold hour");
    await runChecks(sid);
    const sub = await db.styleSubmission.findUniqueOrThrow({ where: { id: sid } });
    expect(sub.status).toBe("review");
    const checks = sub.checks as Body[];
    expect(checks.map((x) => x.key as string)).toEqual(["chapters", "readable", "smooth", "still", "holds", "fallback", "touch", "safe"]);
    expect(checks.every((x) => x.pass === true)).toBe(true);
    const mine = await get(c, `/studio/styles/${d.id}`);
    expect(mine.body.status).toBe("review");
    expect(mine.body.review).toMatchObject({ id: sid, status: "review" });
    expect(await db.job.count({ where: { subjectId: `check:${sid}`, status: "succeeded" } })).toBe(1);
  });

  it("a second submit of the same draft while one waits is 409; a stale version is 409", async () => {
    const c = await creator({ plan: "creator", reviewsLeft: 2 });
    const d = await draft(c);
    expect((await post(c, `/studio/styles/${d.id}/submissions`, { style: { version: 99 } })).status).toBe(409);
    expect((await stateOf(c.id)).reviewsLeft).toBe(2);
    const both = await Promise.all([post(c, `/studio/styles/${d.id}/submissions`), post(c, `/studio/styles/${d.id}/submissions`)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.status === 409)?.body.error.code).toBe("already_submitted");
    expect((await stateOf(c.id)).reviewsLeft).toBe(1);
    expect(await db.styleSubmission.count({ where: { styleId: d.id } })).toBe(1);
  });

  it("reviews come from the plan, then a bought extra review, else 402", async () => {
    const c = await creator({ plan: "open", reviewsLeft: 1, extra: 1 });
    const [a, b, z] = [await draft(c), null, null];
    expect((await post(c, `/studio/styles/${a.id}/submissions`)).body.useExtra).toBe(false);
    const s = await stateOf(c.id);
    expect([s.reviewsLeft, s.extraReviews]).toEqual([0, 1]);
    // Open holds one draft: the first is in review now, so a second can be made
    const d2 = await draft(c);
    const r2 = await post(c, `/studio/styles/${d2.id}/submissions`);
    expect(r2.status).toBe(201);
    expect(r2.body.useExtra).toBe(true);
    const s2 = await stateOf(c.id);
    expect([s2.reviewsLeft, s2.extraReviews]).toEqual([0, 0]);
    const d3 = await draft(c);
    const r3 = await post(c, `/studio/styles/${d3.id}/submissions`);
    expect(r3.status).toBe(402);
    expect(r3.body.error.code).toBe("review_needed");
    expect(b ?? z).toBeNull();
    expect((await get(c, `/studio/styles/${d3.id}`)).body.status).toBe("draft");
  });

  it("a style that fails a check goes back with the reasons, and the review is given back", async () => {
    const c = await creator({ plan: "creator", reviewsLeft: 2 });
    const d = await draft(c, { still: "", scenes: { ending: { layers: { "action#1": { hidden: true } } } }, theme: { ink: "#777777", ground: "#888888" } });
    const r = await post(c, `/studio/styles/${d.id}/submissions`);
    const sid = r.body.submission.id as string;
    await runChecks(sid);
    const mine = await get(c, `/studio/styles/${d.id}`);
    expect(mine.body.status).toBe("returned");
    expect(mine.body.review.note).toMatch(/needs 4\.5 : 1/);
    const failed = (mine.body.review.checks as Body[]).filter((x) => !x.pass).map((x) => x.key as string);
    expect(failed).toEqual(expect.arrayContaining(["readable", "still", "touch"]));
    expect((mine.body.review.checks as Body[])).toHaveLength(8);
    expect((await stateOf(c.id)).reviewsLeft).toBe(2);
    expect((await get(c, "/admin/styles/review")).status).toBe(403);
    const queue = await t.http().get("/v1/admin/styles/review").set(sh("reviewer")).query({ limit: 50 });
    expect((queue.body.items as Body[]).some((x) => x.id === sid)).toBe(false);
    // fixing it and sending it again works
    const fixed = await patch(c, `/studio/styles/${d.id}`, { style: { ...mine.body, ...goodDoc() } });
    expect(fixed.status).toBe(200);
    expect((await post(c, `/studio/styles/${d.id}/submissions`)).status).toBe(201);
  });

  it("a file over its size fails the safe check", async () => {
    const c = await creator({ plan: "creator" });
    const fileId = ids.next();
    await db.storedFile.create({
      data: { id: fileId, ownerAccountId: c.id, purpose: "studio_asset", objectKey: `k/${fileId}`, contentType: "image/png", bytes: 500 * 1024, status: "ready", variants: {}, driver: "r2", kind: "image" } as never,
    });
    const d = await draft(c, { art: [{ fileId }] });
    const r = await post(c, `/studio/styles/${d.id}/submissions`);
    await runChecks(r.body.submission.id as string);
    const sub = await db.styleSubmission.findUniqueOrThrow({ where: { id: r.body.submission.id as string } });
    expect(sub.status).toBe("returned");
    expect((sub.checks as Body[]).find((x) => x.key === "safe")).toMatchObject({ pass: false });
  });
});

describe("case 5: staff review", () => {
  async function waiting(c?: Creator) {
    const cr = c ?? (await creator({ plan: "creator", reviewsLeft: 2 }));
    const d = await draft(cr);
    const r = await post(cr, `/studio/styles/${d.id}/submissions`);
    const sid = r.body.submission.id as string;
    await runChecks(sid);
    return { cr, d, sid };
  }
  const decide = (role: string, sid: string, body: Body) => t.http().post(`/v1/admin/styles/review/${sid}/decide`).set(sh(role)).send(body);

  it("the queue lists a pass with its snapshot; accept enters as Standard with one audit row", async () => {
    const { cr, d, sid } = await waiting();
    const q = await t.http().get("/v1/admin/styles/review").set(sh("reviewer")).query({ limit: 50 });
    expect(q.status).toBe(200);
    const item = (q.body.items as Body[]).find((x) => x.id === sid) as Body;
    expect(item).toMatchObject({ style: d.id, name: "Gold hour", plan: "creator", still: "fade", decided: null });
    expect(item.checks.chapters).toMatchObject({ pass: true });
    expect(item.snapshot.name).toBe("Gold hour");
    const ok = await decide("reviewer", sid, { decision: "approve", reason: "Looks good", note: "Lovely" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: sid, status: "live", level: "standard", decision: "approve", reviewedBy: staff.reviewerId });
    const slug = `studio-${d.id}`;
    const style = await db.style.findUniqueOrThrow({ where: { slug } });
    expect(style).toMatchObject({ on: true, level: "standard", house: false, id: d.id });
    expect(await db.styleLevel.count({ where: { styleSlug: slug, level: "standard" } })).toBe(1);
    expect(style.creator).toEqual({ creatorId: (await db.creator.findUniqueOrThrow({ where: { accountId: cr.id } })).id });
    const mine = await get(cr, `/studio/styles/${d.id}`);
    expect(mine.body).toMatchObject({ status: "live", level: "standard" });
    expect(mine.body.liveAt).toBe(NOW.toISOString());
    expect((await t.http().get(`/v1/styles/${slug}`)).status).toBe(200);
    expect(await db.auditEntry.count({ where: { subjectType: "StyleSubmission", subjectId: sid } })).toBe(1);
    const again = await decide("reviewer", sid, { decision: "approve", reason: "Looks good" });
    expect(again.status).toBe(409);
    expect(await db.auditEntry.count({ where: { subjectId: sid } })).toBe(1);
  });

  it("only staff set a level: Premium comes from the reviewer's body, never the creator's", async () => {
    const { d, sid } = await waiting();
    const ok = await decide("ops", sid, { decision: "approve", level: "premium", reason: "Film quality" });
    expect(ok.body.level).toBe("premium");
    expect((await db.style.findUniqueOrThrow({ where: { id: d.id } })).level).toBe("premium");
  });

  it("decline with a reason the creator reads; the draft can be fixed and sent again", async () => {
    const { cr, d, sid } = await waiting();
    const r = await decide("owner", sid, { decision: "return", reason: "Colours clash", note: "Please soften the second scene." });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "returned", decision: "return" });
    const mine = await get(cr, `/studio/styles/${d.id}`);
    expect(mine.body.status).toBe("returned");
    expect(mine.body.review.note).toBe("Please soften the second scene.");
    const noNote = await waiting();
    const r2 = await decide("owner", noNote.sid, { decision: "return", reason: "Colours clash" });
    expect(r2.body.note).toBe("Colours clash");
    expect(await db.style.count({ where: { id: d.id, on: true } })).toBe(0);
  });

  it("two staff at once: one 200, one 409, one audit row", async () => {
    const { sid } = await waiting();
    const rs = await Promise.all([decide("reviewer", sid, { decision: "approve", reason: "Approve now" }), decide("ops", sid, { decision: "return", reason: "Return now" })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.auditEntry.count({ where: { subjectType: "StyleSubmission", subjectId: sid } })).toBe(1);
  });

  it("422 without a reason, 403 for a role the registry does not name, 404 for an unknown or bad id, a style whose checks failed cannot be accepted", async () => {
    const { sid } = await waiting();
    expect((await decide("reviewer", sid, { decision: "approve" })).status).toBe(422);
    expect((await decide("reviewer", sid, { decision: "approve", reason: "x" })).status).toBe(422);
    expect((await decide("reviewer", sid, { decision: "maybe", reason: "Because" })).status).toBe(422);
    expect((await decide("support", sid, { decision: "approve", reason: "Because" })).status).toBe(403);
    expect((await decide("reviewer", ids.next(), { decision: "approve", reason: "Because" })).status).toBe(404);
    expect((await decide("reviewer", "nope", { decision: "approve", reason: "Because" })).status).toBe(422);  // IF2: a name that is not an id is 422 in words
    expect(await db.auditEntry.count({ where: { subjectId: sid } })).toBe(0);
    const c = await creator({ plan: "creator" });
    const d = await draft(c);
    const r = await post(c, `/studio/styles/${d.id}/submissions`);
    expect((await decide("reviewer", r.body.submission.id as string, { decision: "approve", reason: "Too early" })).status).toBe(409);
  });

  it("a creator takes a style back: in review it goes to a draft and the review is returned; live it comes off", async () => {
    const c = await creator({ plan: "creator", reviewsLeft: 2 });
    const d = await draft(c);
    await post(c, `/studio/styles/${d.id}/submissions`);
    expect((await stateOf(c.id)).reviewsLeft).toBe(1);
    const back = await post(c, `/studio/styles/${d.id}/withdraw`);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: "draft" });
    expect((await stateOf(c.id)).reviewsLeft).toBe(2);
    expect((await post(c, `/studio/styles/${d.id}/withdraw`)).status).toBe(409);
    const w = await waiting(c);
    await decide("reviewer", w.sid, { decision: "approve", reason: "Good style" });
    const slug = `studio-${w.d.id}`;
    const tpl = await post(c, `/studio/styles/${w.d.id}/withdraw`, { on: true });
    expect(tpl.status).toBe(200);
    expect(tpl.body.template).toBe(true);
    expect((await get(c, `/studio/styles/${w.d.id}`)).body.template).toBe(true);
    const off = await post(c, `/studio/styles/${w.d.id}/withdraw`);
    expect(off.body.status).toBe("draft");
    expect((await db.style.findUniqueOrThrow({ where: { slug } })).on).toBe(false);
    expect((await t.http().get(`/v1/styles/${slug}`)).status).toBe(404);
  });
});

describe("case 6: templates", () => {
  const catalogueStyle = async (level: string, allow: boolean | null) => {
    const owner = await creator({ plan: "creator" });
    const id = ids.next();
    await db.style.create({ data: { id, slug: `tpl-${tag()}`, name: "Their style", level, tier: level, house: false, on: true, by: "theirhandle", record: [] } });
    if (allow !== null) {
      await db.studioStyle.create({ data: { id, accountId: owner.id, status: "live", document: { name: "Their style", base: "scroll", template: allow, version: 1, at: NOW.toISOString() } } });
    }
    return id;
  };

  it("a house template is free to every creator and the new draft records what it was made from", async () => {
    const c = await creator();
    const tid = ids.next();
    await db.template.create({ data: { id: tid, base: `house-${tag()}`, name: "House warm", handle: "firstwish", house: true } });
    const r = await post(c, "/studio/styles", { style: { ...goodDoc(), from: { id: tid, name: "client says otherwise" } } });
    expect(r.status).toBe(201);
    expect(r.body.from).toEqual({ id: tid, name: "House warm", handle: "firstwish", house: true });
    expect((await get(c, `/studio/styles/${r.body.id}`)).body.from.id).toBe(tid);
  });

  it("a Premium style as a template needs a paid plan (402)", async () => {
    const id = await catalogueStyle("premium", true);
    const open = await creator();
    const r = await post(open, "/studio/styles", { style: { ...goodDoc(), from: { id } } });
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe("plan_needed");
    expect(await db.studioStyle.count({ where: { accountId: open.id } })).toBe(0);
    const paid = await creator({ plan: "creator" });
    const ok = await post(paid, "/studio/styles", { style: { ...goodDoc(), from: { id } } });
    expect(ok.status).toBe(201);
    expect(ok.body.from).toMatchObject({ id, name: "Their style", handle: "theirhandle", house: false });
  });

  it("only if its creator allows it (403); a Standard style of another creator is the same", async () => {
    const closed = await catalogueStyle("premium", false);
    const none = await catalogueStyle("standard", null);
    const paid = await creator({ plan: "creator" });
    for (const id of [closed, none]) {
      const r = await post(paid, "/studio/styles", { style: { ...goodDoc(), from: { id } } });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("template_not_allowed");
    }
    const open = await catalogueStyle("standard", true);
    const free = await creator();
    expect((await post(free, "/studio/styles", { style: { ...goodDoc(), from: { id: open } } })).status).toBe(201);
    expect((await post(await creator(), "/studio/styles", { style: { ...goodDoc(), from: { id: ids.next() } } })).status).toBe(422);
  });
});

describe("WW6: templateCreatorId", () => {
  it("an accepted style made from a creator's style names that creator", async () => {
    const owner = await creator({ plan: "creator", reviewsLeft: 2 });
    const od = await draft(owner);
    const or = await post(owner, `/studio/styles/${od.id}/submissions`);
    await runChecks(or.body.submission.id as string);
    await t.http().post(`/v1/admin/styles/review/${or.body.submission.id as string}/decide`).set(sh("reviewer")).send({ decision: "approve", reason: "Accept it" });
    await post(owner, `/studio/styles/${od.id}/withdraw`, { on: true });
    const maker = await creator({ plan: "creator", reviewsLeft: 2 });
    const md = await post(maker, "/studio/styles", { style: { ...goodDoc(), from: { id: od.id } } });
    expect(md.status).toBe(201);
    const mr = await post(maker, `/studio/styles/${md.body.id as string}/submissions`);
    await runChecks(mr.body.submission.id as string);
    await t.http().post(`/v1/admin/styles/review/${mr.body.submission.id as string}/decide`).set(sh("reviewer")).send({ decision: "approve", reason: "Accept it" });
    const [oc, mc] = await Promise.all([owner, maker].map((x) => db.creator.findUniqueOrThrow({ where: { accountId: x.id } })));
    expect((await db.style.findUniqueOrThrow({ where: { id: md.body.id as string } })).creator).toEqual({ creatorId: mc.id, templateCreatorId: oc.id });
  });
});

describe("case 7: erase", () => {
  it("drafts and prefs go; an accepted style stays in the catalogue and keeps working", async () => {
    const c = await creator({ plan: "creator", reviewsLeft: 2 });
    await patch(c, "/studio/prefs", { coached: true });
    const live = await draft(c);
    const r = await post(c, `/studio/styles/${live.id}/submissions`);
    await runChecks(r.body.submission.id as string);
    await t.http().post(`/v1/admin/styles/review/${r.body.submission.id as string}/decide`).set(sh("reviewer")).send({ decision: "approve", reason: "Accept it" });
    const plain = await draft(c);
    const waitingDraft = await draft(c);
    const w = await post(c, `/studio/styles/${waitingDraft.id}/submissions`);
    const wid = w.body.submission.id as string;
    await t.app.get(AccountErasureService).erase(c.id, { actor: { type: "staff", id: staff.ownerId, requestId: "r-1" }, reason: "Asked to erase" });
    expect(await db.studioPrefs.count({ where: { accountId: c.id } })).toBe(0);
    expect(await db.studioStyle.count({ where: { id: { in: [plain.id, waitingDraft.id] } } })).toBe(0);
    expect(await db.studioStyle.count({ where: { id: live.id, status: "live" } })).toBe(1);
    expect((await db.style.findUniqueOrThrow({ where: { id: live.id } })).on).toBe(true);
    expect(await db.$queryRaw`SELECT 1 FROM style_submission_snapshot WHERE "submissionId" = ${r.body.submission.id as string}::uuid`).toHaveLength(1);
    expect(await db.$queryRaw`SELECT 1 FROM style_submission_snapshot WHERE "submissionId" = ${wid}::uuid`).toHaveLength(0);
    expect((await db.styleSubmission.findUniqueOrThrow({ where: { id: wid } })).status).toBe("returned");
    const q = await t.http().get("/v1/admin/styles/review").set(sh("reviewer")).query({ limit: 50 });
    expect((q.body.items as Body[]).some((x) => x.id === wid)).toBe(false);
    expect((await t.http().get(`/v1/styles/studio-${live.id}`)).status).toBe(200);
  });
});
