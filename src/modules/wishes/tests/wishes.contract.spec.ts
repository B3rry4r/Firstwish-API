import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { lockAccount } from "../../../common/db/account-lock";
import { PrismaService } from "../../../common/db/prisma.service";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { JobsService } from "../../jobs/jobs.service";
import { StoragePort } from "../../../common/ports/storage.port";
import { SavedWishesService } from "../../saved-wishes/saved-wishes.service";
import { WishLifecycleService } from "../wish-lifecycle.service";
import { WishesService } from "../wishes.service";
import { RUN } from "../../../../test/kit/unique";

const ROOT = join(__dirname, "../../../..");
// A start no other spec uses (the dates below need 2027); every runDue names the keys it means.
const NOW = new Date("2027-01-09T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("wishes E-221 E-222 E-224 E-225 E-229 E-231 (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let wishes: WishesService;
  let life: WishLifecycleService;
  let jobs: JobsService;
  let nid: () => string;
  let seq = 0;
  const run = RUN;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    wishes = t.app.get(WishesService);
    life = t.app.get(WishLifecycleService);
    jobs = t.app.get(JobsService);
    const ids = t.app.get(IdGenerator);
    nid = () => ids.id();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  async function user(sides: ("person" | "business")[] = ["person"]) {
    const accountId = nid();
    await db.account.create({ data: { id: accountId, contact: `b06-${run}-${++seq}@example.com`, sides: ["person", ...sides.filter((s) => s !== "person")] as never, lastSide: "person" } });
    const token = `tok-${accountId}`;
    t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...sides.filter((s) => s !== "person")] as never });
    return { accountId, token };
  }
  const draftBody = { from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: "noir" };
  async function draft(u: { token: string }, over: Record<string, unknown> = {}) {
    const r = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ ...draftBody, ...over });
    expect(r.status).toBe(201);
    return r.body as { id: string; version: number };
  }
  const save = (u: { token: string }, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send(body);
  /** Seals with the wish's current version; no extras means "open now". */
  async function sealIt(u: { token: string }, id: string, extra: Record<string, unknown> = { openNow: true }) {
    const row = await db.wish.findUniqueOrThrow({ where: { id }, select: { version: true } });
    return t.http().post(`/v1/wishes/${id}/seal`).set(bearer(u.token)).send({ version: row.version, ...extra });
  }
  const letter = { letter: { paras: ["Happy birthday."] } };
  async function ready(u: { token: string; accountId: string }, ticket: "moment" | "keepsake" | "signature" | "premiere" = "moment") {
    const w = await draft(u);
    expect((await save(u, w.id, { version: w.version, content: letter })).status).toBe(200);
    await wishes.fulfilTicket(w.id, ticket);
    return w.id;
  }
  async function file(accountId: string, status: "ready" | "pending" = "ready") {
    const id = nid();
    await db.storedFile.create({
      data: { id, ownerAccountId: accountId, purpose: "wish_photo", objectKey: `k/${id}`, contentType: "image/jpeg", bytes: 10n, status, variants: {}, driver: "r2" },
    });
    return id;
  }

  it("J4 (LL5) the owner's wish detail shows what receivers did; another account's wish stays 404", async () => {
    const u = await user();
    const id = await ready(u, "moment");
    const other = await user();
    const empty = await t.http().get(`/v1/wishes/${id}`).set(bearer(u.token));
    expect(empty.status).toBe(200);
    expect(empty.body.activity).toEqual({ opens: 0, plays: 0, reactions: {}, favourites: 0, shares: 0 });
    await db.$executeRaw`INSERT INTO wish_open (id, slug, "wishId", kind, first, session, "createdAt") VALUES (${nid()}::uuid, 'j4', ${id}::uuid, 'read', true, 's1-aaaaaaaa', ${NOW}), (${nid()}::uuid, 'j4', ${id}::uuid, 'read', false, 's2-aaaaaaaa', ${NOW}), (${nid()}::uuid, 'j4', ${id}::uuid, 'play', false, 's1-aaaaaaaa', ${NOW})`;
    await db.$executeRaw`INSERT INTO wish_reaction (id, "wishId", session, reaction, "createdAt", "updatedAt") VALUES (${nid()}::uuid, ${id}::uuid, 's1-aaaaaaaa', 'Yes.', ${NOW}, ${NOW}), (${nid()}::uuid, ${id}::uuid, 's2-aaaaaaaa', 'Yes.', ${NOW}, ${NOW})`;
    await db.$executeRaw`INSERT INTO wish_favourite (id, "wishId", session, hearts, "updatedAt") VALUES (${nid()}::uuid, ${id}::uuid, 's1-aaaaaaaa', ARRAY[0, 2]::int[], ${NOW})`;
    const shown = await t.http().get(`/v1/wishes/${id}`).set(bearer(u.token));
    expect(shown.status).toBe(200);
    expect(shown.body.activity).toMatchObject({ opens: 2, plays: 1, reactions: { "Yes.": 2 }, favourites: 1, shares: 0 });
    expect((await t.http().get(`/v1/wishes/${id}`).set(bearer(other.token))).status).toBe(404);
    expect((await t.http().get(`/v1/wishes/${id}`)).status).toBe(401);
  });

  it("E-222 makes a draft owned by the caller, normalising what was typed", async () => {
    const u = await user();
    const r = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ ...draftBody, kind: "  Love ", name: "  Chidi  " });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ accountId: u.accountId, status: "draft", state: "draft", kind: "love", name: "Chidi", style: "noir", version: 0, no: null, link: null });
    expect(r.body.content).toEqual({ cover: { from: "Ada" } });
    expect(await db.wish.count({ where: { id: r.body.id, accountId: u.accountId } })).toBe(1);
  });

  it("E-222 is 401 without a token, 403 for staff, 422 with fields for a bad body or a style that is not offered", async () => {
    expect((await t.http().post("/v1/wishes").send(draftBody)).status).toBe(401);
    t.tokens.set("staff-1", { kind: "staff", staffId: nid(), roles: ["owner"] });
    expect((await t.http().post("/v1/wishes").set(bearer("staff-1")).send(draftBody)).status).toBe(403);
    const u = await user();
    const bad = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ ...draftBody, style: "nope" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.style).toBeDefined();
    const bad2 = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ kind: "love" });
    expect(bad2.status).toBe(422);
    expect(Object.keys(bad2.body.error.fields)).toEqual(expect.arrayContaining(["from", "name"]));
  });

  it("E-225 saves parts, answers 200 with the new version (CC1), and a stale write is 409 with the current version", async () => {
    const u = await user();
    const w = await draft(u);
    const r1 = await save(u, w.id, { version: 0, name: "Chidi O", occasion: "Anniversary", opensAt: "2027-02-14T09:00", timeZone: "Africa/Lagos", content: letter });
    expect(r1.status).toBe(200);
    expect(Object.keys(r1.body).sort()).toEqual(["updatedAt", "version"]);
    expect(r1.body.version).toBe(1);
    const r2 = await save(u, w.id, { version: 1, content: { memory: { title: "Lagos", text: "The beach." }, letter: null } });
    expect(r2.body.version).toBe(2);
    const got = (await t.http().get(`/v1/wishes/${w.id}`).set(bearer(u.token))).body;
    expect(got).toMatchObject({ name: "Chidi O", occasion: "anniversary", version: 2, opensAt: "2027-02-14T08:00:00.000Z", timeZone: "Africa/Lagos" });
    expect(got.content).toEqual({ cover: { from: "Ada" }, memory: { title: "Lagos", text: "The beach." } });
    const stale = await save(u, w.id, { version: 0, name: "Overwrite" });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "stale_version", fields: { version: "2" } });
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).name).toBe("Chidi O");
  });

  it("E-225 saved at once with one version: exactly one wins", async () => {
    const u = await user();
    const w = await draft(u);
    const all = await Promise.all(Array.from({ length: 20 }, (_, i) => save(u, w.id, { version: 0, name: `N${i}` })));
    expect(all.filter((r) => r.status === 200)).toHaveLength(1);
    expect(all.filter((r) => r.status === 409)).toHaveLength(19);
  });

  it("CC3 E-225 refuses a bad document (the size limit is the lifecycle config's): unknown parts, a passcode in content, too large, not an object (422), a bad version, someone else's wish (404)", async () => {
    const u = await user();
    const w = await draft(u);
    const unknown = await save(u, w.id, { version: 0, content: { extra: 1 } });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.fields.content).toMatch(/extra/);
    expect((await save(u, w.id, { version: 0, content: { note: { text: "x", passcode: "1234" } } })).status).toBe(422);
    const cfg = await db.lifecycleConfig.findFirstOrThrow({ orderBy: { id: "desc" } });
    await db.lifecycleConfig.update({ where: { id: cfg.id }, data: { wishContentMaxBytes: 2048 } });
    const big = await save(u, w.id, { version: 0, content: { letter: { paras: ["x".repeat(3000)] } } });
    await db.lifecycleConfig.update({ where: { id: cfg.id }, data: { wishContentMaxBytes: cfg.wishContentMaxBytes } });
    expect(big.status).toBe(422);
    expect(big.body.error.fields.content).toMatch(/2048/);
    expect((await save(u, w.id, { version: 0, content: "text" })).status).toBe(422);
    expect((await save(u, w.id, { name: "no version" })).status).toBe(422);
    expect((await save(u, w.id, { version: 0, opensAt: "tomorrow" })).status).toBe(422);
    expect((await save(u, w.id, { version: 0, timeZone: "Mars/Base" })).status).toBe(422);
    const other = await user();
    expect((await save(other, w.id, { version: 0, name: "x" })).status).toBe(404);
    expect((await save(u, "not-a-uuid", { version: 0 })).status).toBe(404);
    expect((await t.http().patch(`/v1/wishes/${w.id}`).send({ version: 0 })).status).toBe(401);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).version).toBe(0);
  });

  it("the passcode is hashed into Wish.passcodeHash, never into content or the answer", async () => {
    const u = await user();
    const w = await draft(u);
    expect((await save(u, w.id, { version: 0, passcode: "2468" })).status).toBe(200);
    const row = await db.wish.findUniqueOrThrow({ where: { id: w.id } });
    expect(row.passcodeHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(row.content)).not.toContain("2468");
    const got = (await t.http().get(`/v1/wishes/${w.id}`).set(bearer(u.token))).body;
    expect(got.hasPasscode).toBe(true);
    expect(JSON.stringify(got)).not.toContain("scrypt");
  });

  it("files named in the content are written to the join table; another's file or an unconfirmed one is 422", async () => {
    const u = await user();
    const other = await user();
    const w = await draft(u);
    const mine = await file(u.accountId);
    const ok = await save(u, w.id, { version: 0, content: { story: { photos: [{ photoId: mine }] } } });
    expect(ok.status).toBe(200);
    expect(await db.wishFile.findMany({ where: { wishId: w.id } })).toEqual([expect.objectContaining({ fileId: mine, role: "photo" })]);
    expect((await save(u, w.id, { version: 1, content: { story: { photos: [{ photoId: await file(other.accountId) }] } } })).status).toBe(422);
    expect((await save(u, w.id, { version: 1, content: { story: { photos: [{ photoId: await file(u.accountId, "pending") }] } } })).status).toBe(422);
    expect((await save(u, w.id, { version: 1, content: { story: { photos: [{ photoId: nid() }] } } })).status).toBe(422);
    expect((await save(u, w.id, { version: 1, content: { story: { photos: [{ photoId: "x" }] } } })).status).toBe(422);
    // the failed saves left the join table as it was; removing the file from the content removes the row
    expect(await db.wishFile.count({ where: { wishId: w.id } })).toBe(1);
    expect((await save(u, w.id, { version: 1, content: { story: null } })).status).toBe(200);
    expect(await db.wishFile.count({ where: { wishId: w.id } })).toBe(0);
    await expect(db.storedFile.delete({ where: { id: mine } })).resolves.toBeDefined();
  });

  it("a file in a wish cannot be deleted while the wish names it (foreign key)", async () => {
    const u = await user();
    const w = await draft(u);
    const mine = await file(u.accountId);
    await save(u, w.id, { version: 0, content: { cover: { coverId: mine } } });
    await expect(db.storedFile.delete({ where: { id: mine } })).rejects.toBeDefined();
  });

  it("limits come from the ticket: over the photo limit is 422 naming it; a paid ticket raises it; a draft is free within Starter", async () => {
    const u = await user();
    const w = await draft(u);
    const photos = async (n: number) => ({ story: { photos: await Promise.all(Array.from({ length: n }, async () => ({ photoId: await file(u.accountId) }))) } });
    expect((await save(u, w.id, { version: 0, content: await photos(6) })).status).toBe(200);
    const over = await save(u, w.id, { version: 1, content: await photos(7) });
    expect(over.status).toBe(422);
    expect(over.body.error.fields.photos).toMatch(/6 photos/);
    await wishes.fulfilTicket(w.id, "keepsake");
    const v = (await db.wish.findUniqueOrThrow({ where: { id: w.id } })).version;
    expect((await save(u, w.id, { version: v, content: await photos(15) })).status).toBe(200);
    const v2 = (await db.wish.findUniqueOrThrow({ where: { id: w.id } })).version;
    const over2 = await save(u, w.id, { version: v2, content: await photos(16) });
    expect(over2.status).toBe(422);
    const voices = await save(u, w.id, { version: v2, content: { voices: { items: Array.from({ length: 13 }, () => ({ name: "A friend", text: "Hi" })) } } });
    expect(voices.status).toBe(422);
    expect(voices.body.error.fields.voices).toMatch(/voices/);
  });

  it("E-231 refuses an unpaid wish (402) and one with nothing written (422)", async () => {
    const u = await user();
    const w = await draft(u);
    await save(u, w.id, { version: 0, content: letter });
    const unpaid = await sealIt(u, w.id);
    expect(unpaid.status).toBe(402);
    expect(unpaid.body.error.code).toBe("payment_required");
    const w2 = await draft(u);
    await wishes.fulfilTicket(w2.id, "moment");
    const empty = await sealIt(u, w2.id);
    expect(empty.status).toBe(422);
    expect(empty.body.error.fields.content).toBeDefined();
    expect((await db.wish.findUniqueOrThrow({ where: { id: w2.id } })).status).toBe("draft");
  });

  it("E-231 seals a paid wish: number, link, transition, the open time in UTC from the local time and zone; sealed words are locked", async () => {
    const u = await user();
    const id = await ready(u);
    const r = await sealIt(u, id, { opensAt: "2027-02-14T09:00", timeZone: "Africa/Lagos" });
    expect(r.status).toBe(200);
    expect(r.body.payment).toBeNull(); // VV1: {payment, item}; no money moves at the seal
    const item = r.body.item;
    expect(item).toMatchObject({ status: "sealed", state: "sealed", opensAt: "2027-02-14T08:00:00.000Z", timeZone: "Africa/Lagos" });
    expect(item.no).toMatch(/^\d{4,}$/);
    expect(item.link).toMatch(/^\/w\/[a-z0-9-]{8,32}$/);
    const slug = (item.link as string).slice(3);
    expect(slug.length).toBeGreaterThanOrEqual(8);
    expect(slug.length).toBeLessThanOrEqual(32);
    const tr = await db.wishTransition.findMany({ where: { wishId: id } });
    expect(tr).toEqual([expect.objectContaining({ from: "draft", to: "sealed", cause: "owner.seal" })]);
    expect(await db.job.count({ where: { subjectId: id, type: "open_wish", status: "scheduled" } })).toBe(1);
    expect((await t.http().get(`/v1/wishes/${id}/link`).set(bearer(u.token))).body).toEqual({ link: `/w/${slug}`, slug });
    expect((await save(u, id, { version: item.version, name: "Late" })).status).toBe(409);
    expect((await sealIt(u, id)).status).toBe(409);
  });

  it("50 wishes sealed at once get 50 different, gapless numbers and 50 different links", async () => {
    const us: Awaited<ReturnType<typeof user>>[] = [];
    for (let i = 0; i < 50; i++) us.push(await user());
    const idsOf: string[] = [];
    for (const u of us) idsOf.push(await ready(u));
    const out = await Promise.all(us.map((u, i) => sealIt(u, idsOf[i])));
    expect(out.every((r) => r.status === 200)).toBe(true);
    const nums = out.map((r) => Number(r.body.item.no)).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(50);
    // Gapless: every number from the lowest to the highest of these 50 is held by some wish. Other specs share this database and seal wishes
    // at the same moment, taking numbers from the same sequence, so the range may hold numbers of theirs (INT-6: a range of exactly 49 failed once in three
    // full runs for that reason); a number held by no wish at all would be a real gap.
    const range = Array.from({ length: nums[49] - nums[0] + 1 }, (_, i) => String(nums[0] + i).padStart(4, "0"));
    expect(await db.wish.count({ where: { no: { in: range } } })).toBe(range.length);
    expect(await db.wish.count({ where: { id: { in: idsOf }, no: { not: null } } })).toBe(50);
    expect(new Set(out.map((r) => (r.body as { item: { link: string } }).item.link)).size).toBe(50);
    const seqRow = await db.wishNumberSequence.findMany();
    expect(seqRow).toHaveLength(1);
    expect(seqRow[0].next).toBeGreaterThanOrEqual(nums[49] + 1);
  }, 30_000);

  it("the state machine refuses any move that is not in its table, and every move writes a transition with its cause", async () => {
    const u = await user();
    const id = await ready(u);
    const lock = (to: "live" | "resting" | "erased") =>
      db.$transaction(async (tx) => life.move(tx, await life.lock(tx, id), to, { cause: "test" }));
    await expect(lock("live")).rejects.toMatchObject({ response: { code: "not_allowed" } });
    await expect(lock("resting")).rejects.toMatchObject({ response: { code: "not_allowed" } });
    expect(await db.wishTransition.count({ where: { wishId: id } })).toBe(0);
    await sealIt(u, id);
    await lock("live");
    await lock("resting");
    await lock("erased");
    await expect(lock("live")).rejects.toMatchObject({ response: { code: "not_allowed" } });
    const tr = await db.wishTransition.findMany({ where: { wishId: id }, orderBy: { id: "asc" } });
    expect(tr.map((x) => `${x.from}>${x.to}:${x.cause}`)).toEqual(["draft>sealed:owner.seal", "sealed>live:test", "live>resting:test", "resting>erased:test"]);
  });

  it("time moves a wish by jobs on the clock port: opens at its time, rests at term end, is erased after the hold; a restore within the window brings it back", async () => {
    const u = await user();
    const id = await ready(u, "moment");
    const open = new Date(NOW.getTime() + 2 * DAY);
    await sealIt(u, id, { opensAt: open.toISOString() });
    await jobs.runDue(100, [id]);
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).status).toBe("sealed");
    t.clock.set(new Date(open.getTime() + 1000));
    // EE7: the open time only makes it openable; the receiver's first read starts the term
    await jobs.runDue(100, [id]);
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).status).toBe("sealed");
    await db.$transaction((tx) => life.markOpened(tx, id, t.clock.now()));
    let w = await db.wish.findUniqueOrThrow({ where: { id } });
    expect(w.status).toBe("live");
    expect(w.endsAt?.getTime()).toBe(w.openedAt!.getTime() + 7 * DAY);
    expect(await db.job.count({ where: { subjectId: id, type: "send_notice", status: "scheduled" } })).toBe(1);
    t.clock.set(new Date(w.endsAt!.getTime() + 1000));
    await jobs.runDue(100, [id]);
    w = await db.wish.findUniqueOrThrow({ where: { id } });
    expect(w.status).toBe("resting");
    expect(w.eraseAfter?.getTime()).toBe(w.restingSince!.getTime() + 365 * DAY);
    // restore inside the window
    const back = await t.http().post(`/v1/wishes/${id}/restore`).set(bearer(u.token)).send({});
    expect(back.status).toBe(200);
    expect(back.body.state).toBe("live");
    t.clock.advance(31 * DAY);
    await jobs.runDue(100, [id]);
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).status).toBe("resting");
    // the window is over
    t.clock.advance(31 * DAY);
    const late = await t.http().post(`/v1/wishes/${id}/restore`).set(bearer(u.token)).send({});
    expect(late.status).toBe(409);
    t.clock.advance(366 * DAY);
    await jobs.runDue(100, [id]);
    w = await db.wish.findUniqueOrThrow({ where: { id } });
    expect(w).toMatchObject({ status: "removed", content: null, name: null, passcodeHash: null });
    expect(w.erasedAt).not.toBeNull();
    expect(w.no).toMatch(/^\d{4,}$/);
    expect(w.kind).toBe("love");
    const causes = (await db.wishTransition.findMany({ where: { wishId: id }, orderBy: { id: "asc" } })).map((x) => `${x.from}>${x.to}:${x.cause}`);
    expect(causes).toEqual([
      "draft>sealed:owner.seal", "sealed>live:receiver.open", "live>resting:job.rest", "resting>live:owner.restore", "live>resting:job.rest", "resting>erased:job.erase",
    ]);
    const jobMoves = await db.wishTransition.count({ where: { wishId: id, jobRunId: { not: null } } });
    expect(jobMoves).toBe(3);
    t.clock.set(NOW);
  });

  it("taking a wish down clears its saves, makes its link answer gone and removes its files from the join table on erase, in one go", async () => {
    const u = await user();
    const fan = await user();
    const id = await ready(u);
    await sealIt(u, id, { opensAt: new Date(NOW.getTime() + DAY).toISOString() });
    await db.savedWish.create({ data: { id: nid(), wish: id, accountId: fan.accountId } });
    await life.takeDown(id, "staff.take-down");
    expect(await db.savedWish.count({ where: { wish: id } })).toBe(0);
    expect(await db.wishLink.count({ where: { wishId: id, active: true } })).toBe(0);
    expect(await db.job.count({ where: { subjectId: id, status: "scheduled" } })).toBe(0);
    expect((await t.http().get(`/v1/wishes/${id}/link`).set(bearer(u.token))).status).toBe(404);
    await expect(life.takeDown(id, "again")).rejects.toMatchObject({ response: { code: "not_allowed" } });
    // erase now by the owner
    const id2 = await ready(u);
    const mine = await file(u.accountId);
    const w2 = await db.wish.findUniqueOrThrow({ where: { id: id2 } });
    await save(u, id2, { version: w2.version, content: { cover: { coverId: mine }, letter: { paras: ["x"] } } });
    expect((await t.http().post(`/v1/wishes/${id2}/erase`).set(bearer(u.token)).send({})).status).toBe(409);
    expect((await sealIt(u, id2)).status).toBe(200);
    await db.savedWish.create({ data: { id: nid(), wish: id2, accountId: fan.accountId } });
    expect((await t.http().post(`/v1/wishes/${id2}/erase`).set(bearer(u.token)).send({})).status).toBe(204);
    expect(await db.savedWish.count({ where: { wish: id2 } })).toBe(0);
    expect(await db.wishFile.count({ where: { wishId: id2 } })).toBe(0);
    expect((await db.wish.findUniqueOrThrow({ where: { id: id2 } })).content).toBeNull();
    expect((await t.http().post(`/v1/wishes/${id2}/erase`).set(bearer(u.token)).send({})).status).toBe(409);
  });

  it("the owner removes a wish and brings it back to the state it left; an erased account cannot write", async () => {
    const u = await user();
    const id = await ready(u);
    const gone = await t.http().delete(`/v1/wishes/${id}`).set(bearer(u.token)).send({});
    expect(gone.status).toBe(200);
    expect(gone.body.state).toBe("taken_down");
    const back = await t.http().post(`/v1/wishes/${id}/restore`).set(bearer(u.token)).send({});
    expect(back.body.state).toBe("draft");
    await db.account.update({ where: { id: u.accountId }, data: { erasedAt: NOW } });
    expect((await save(u, id, { version: back.body.version, name: "x" })).status).toBe(401);
  });

  it("erasing the account races each wish write 10 times: nothing lands after the erase (AA1)", async () => {
    for (let i = 0; i < 10; i++) {
      const u = await user();
      const id = (await draft(u)).id;
      const erase = db.$transaction(async (tx) => {
        await lockAccount(tx, u.accountId, { allowErased: true });
        await tx.account.update({ where: { id: u.accountId }, data: { erasedAt: NOW } });
      });
      const [a, b] = await Promise.all([
        t.http().post("/v1/wishes").set(bearer(u.token)).send(draftBody),
        save(u, id, { version: 0, name: "Racing" }),
        erase,
      ]);
      expect([201, 401]).toContain(a.status);
      expect([200, 401]).toContain(b.status);
      expect((await t.http().post("/v1/wishes").set(bearer(u.token)).send(draftBody)).status).toBe(401);
      expect((await save(u, id, { version: 5, name: "After" })).status).toBe(401);
      expect((await sealIt(u, id)).status).toBe(401);
    }
  });

  it("E-221 and E-224 are the owner's: a list holds only the caller's wishes, newest first, in pages; another account's wish is 404; a business sees its own", async () => {
    const a = await user();
    const b = await user();
    const ids3 = [await draft(a), await draft(a), await draft(a)];
    await draft(b);
    const p1 = await t.http().get("/v1/wishes?limit=2").set(bearer(a.token));
    expect(p1.status).toBe(200);
    expect((p1.body as { items: { id: string }[] }).items.map((x) => x.id)).toEqual([ids3[2].id, ids3[1].id]);
    const p2 = await t.http().get(`/v1/wishes?limit=2&cursor=${p1.body.nextCursor}`).set(bearer(a.token));
    expect((p2.body as { items: { id: string }[] }).items.map((x) => x.id)).toEqual([ids3[0].id]);
    expect(p2.body.nextCursor).toBeNull();
    expect((await t.http().get(`/v1/wishes/${ids3[0].id}`).set(bearer(b.token))).status).toBe(404);
    expect((await t.http().get("/v1/wishes/not-a-uuid").set(bearer(a.token))).status).toBe(404);
    expect((await t.http().get("/v1/wishes")).status).toBe(401);
    expect((await t.http().get("/v1/wishes?limit=99").set(bearer(a.token))).status).toBe(422);
    const owner = await user(["business"]);
    const businessId = nid();
    await db.business.create({ data: { id: businessId, accountId: owner.accountId, name: "Shop" } });
    const mine = await draft(a);
    await db.wish.update({ where: { id: mine.id }, data: { businessId } });
    const seen = await t.http().get("/v1/wishes").set(bearer(owner.token));
    expect((seen.body as { items: { id: string }[] }).items.map((x) => x.id)).toEqual([mine.id]);
    expect((await t.http().get(`/v1/wishes/${ids3[0].id}`).set(bearer(owner.token))).status).toBe(404);
  });

  // ---- the patch: rulings EE1 to EE9, CC1 to CC4, BB6, E-226 ----

  const sealOn = async (u: { token: string; accountId: string }, opensAt: Date, ticket: "moment" | "keepsake" = "moment") => {
    const id = await ready(u, ticket);
    const r = await sealIt(u, id, { opensAt: opensAt.toISOString() });
    expect(r.status).toBe(200);
    return id;
  };
  const opened = (id: string, at: Date) => db.$transaction((tx) => life.markOpened(tx, id, at));

  it("EE7 the open time only makes a wish openable; ten first reads at once set openedAt once: one transition, one rest job", async () => {
    const u = await user();
    const open = new Date(NOW.getTime() + DAY);
    const id = await sealOn(u, open);
    t.clock.set(new Date(open.getTime() + 5000));
    await jobs.runDue(100, [id]);
    let got = (await t.http().get(`/v1/wishes/${id}`).set(bearer(u.token))).body;
    expect(got).toMatchObject({ state: "sealed", openable: true, openedAt: null, endsAt: null });
    expect((await t.http().get(`/v1/wishes/${id}`).set(bearer(u.token))).body.openable).toBe(true);
    const before = await opened(id, new Date(open.getTime() - 1000));
    expect(before.opened).toBe(false);
    const ats = Array.from({ length: 10 }, (_, i) => new Date(open.getTime() + 10_000 + i * 1000));
    const all = await Promise.all(ats.map((at) => opened(id, at)));
    expect(all.filter((r) => r.opened)).toHaveLength(1);
    const row = await db.wish.findUniqueOrThrow({ where: { id } });
    expect(ats.map((a) => a.getTime())).toContain(row.openedAt!.getTime());
    expect(new Set(all.map((r) => r.openedAt!.getTime())).size).toBe(1);
    expect(row.status).toBe("live");
    expect(row.endsAt!.getTime()).toBe(row.openedAt!.getTime() + 7 * DAY);
    expect(await db.wishTransition.count({ where: { wishId: id, to: "live" } })).toBe(1);
    const rest = await db.job.findMany({ where: { subjectId: id, type: "rest_wish" } });
    expect(rest).toHaveLength(1);
    expect(rest[0].runAt.getTime()).toBe(row.endsAt!.getTime());
    got = (await t.http().get(`/v1/wishes/${id}`).set(bearer(u.token))).body;
    expect(got).toMatchObject({ state: "live", openable: true, openedAt: row.openedAt!.toISOString(), endsAt: row.endsAt!.toISOString() });
    // the database keeps openedAt from moving, even for a direct write
    await expect(db.wish.update({ where: { id }, data: { openedAt: new Date(row.openedAt!.getTime() + 1) } })).rejects.toBeDefined();
    t.clock.set(NOW);
  });

  it("EE8 a wedding wish ends at its wedding date plus the term, whenever it was opened", async () => {
    const u = await user();
    const open = new Date(NOW.getTime() + DAY);
    const w = await draft(u);
    expect((await save(u, w.id, { version: 0, content: letter, makerNote: { wedding: "2027-06-12" }, timeZone: "Africa/Lagos" })).status).toBe(200);
    expect((await save(u, w.id, { version: 1, makerNote: { wedding: "2027-13-45" } })).status).toBe(422);
    await wishes.fulfilTicket(w.id, "moment");
    expect((await sealIt(u, w.id, { opensAt: open.toISOString() })).status).toBe(200);
    t.clock.set(new Date(open.getTime() + 1000));
    const r = await opened(w.id, t.clock.now());
    expect(r.endsAt!.toISOString()).toBe(new Date(Date.UTC(2027, 5, 11, 23, 0, 0) + 7 * DAY).toISOString());
    expect((await db.job.findFirstOrThrow({ where: { subjectId: w.id, type: "rest_wish" } })).runAt.getTime()).toBe(r.endsAt!.getTime());
    t.clock.set(NOW);
  });

  it("EE9 a sealed wish nobody opens rests 365 days after its open time", async () => {
    const u = await user();
    const open = new Date(NOW.getTime() + DAY);
    const id = await sealOn(u, open);
    t.clock.set(new Date(open.getTime() + 364 * DAY));
    await jobs.runDue(100, [id]);
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).status).toBe("sealed");
    t.clock.set(new Date(open.getTime() + 365 * DAY + 1000));
    await jobs.runDue(100, [id]);
    const w = await db.wish.findUniqueOrThrow({ where: { id } });
    expect(w.status).toBe("resting");
    expect(w.openedAt).toBeNull();
    expect((await db.wishTransition.findMany({ where: { wishId: id, to: "resting" } })).map((x) => x.cause)).toEqual(["job.rest-unopened"]);
    t.clock.set(NOW);
  });

  it("EE3 content is checked against a closed shape at every level; a file is named only under the known keys", async () => {
    const u = await user();
    const w = await draft(u);
    const mine = await file(u.accountId);
    const bad: Record<string, unknown>[] = [
      { story: { photos: [{ photoId: mine, src: mine }] } },
      { story: { photos: [{ url: mine }] } },
      { story: { fileIds: [mine] } },
      { cover: { photo: { fileId: mine, role: "photo" } } },
      { voices: { items: [{ name: "A", text: "x", voiceFileId: mine }] } },
      { note: { text: "x", extra: { deep: { id: mine } } } },
      { letter: { paras: [mine, 5] } },
      { links: { files: ["a"] } },
      { memory: "text" },
      { ending: { id: "a", scene: "b", values: { k: 1 } } },
    ];
    for (const content of bad) {
      const r = await save(u, w.id, { version: 0, content });
      expect([JSON.stringify(content), r.status]).toEqual([JSON.stringify(content), 422]);
      expect(r.body.error.fields.content).toBeDefined();
    }
    expect(await db.wishFile.count({ where: { wishId: w.id } })).toBe(0);
    const voice = await file(u.accountId);
    const ok = await save(u, w.id, { version: 0, content: { cover: { photoId: mine, more: ["Ada"] }, voices: { ask: "q", items: [{ name: "A", text: "x", voiceId: voice }] } } });
    expect(ok.status).toBe(200);
    expect((await db.wishFile.findMany({ where: { wishId: w.id } })).map((r) => `${r.role}`).sort()).toEqual(["photo", "voice"]);
  });

  it("EE4 erasing a wish queues the removal of the file objects no other wish names", async () => {
    const u = await user();
    const alone = await file(u.accountId);
    const shared = await file(u.accountId);
    const first = await sealOn(u, new Date(NOW.getTime() + DAY));
    const second = await ready(u);
    const named = (fileA: string, fileB?: string) => ({ story: { photos: [{ photoId: fileA }, ...(fileB ? [{ photoId: fileB }] : [])] }, ...letter });
    const v1 = (await db.wish.findUniqueOrThrow({ where: { id: second } })).version;
    expect((await save(u, second, { version: v1, content: named(shared) })).status).toBe(200);
    // the first wish is sealed, so name the files in a draft first, then seal
    const third = await ready(u);
    const v3 = (await db.wish.findUniqueOrThrow({ where: { id: third } })).version;
    expect((await save(u, third, { version: v3, content: named(alone, shared) })).status).toBe(200);
    expect((await sealIt(u, third)).status).toBe(200);
    void first;
    const storage = t.app.get(StoragePort);
    const del = jest.spyOn(storage, "delete");
    expect((await t.http().post(`/v1/wishes/${third}/erase`).set(bearer(u.token)).send({})).status).toBe(204);
    const queued = await db.job.findMany({ where: { type: "upload_cleanup", subjectId: { startsWith: "erase-wish-file:" }, status: "scheduled" } });
    const mineQueued = queued.filter((j) => [alone, shared].some((f) => j.subjectId.endsWith(f)));
    expect(mineQueued.map((j) => j.subjectId)).toEqual([`erase-wish-file:${alone}`]);
    await jobs.runDue(100, [`erase-wish-file:${alone}`]);
    expect(del).toHaveBeenCalledWith(`k/${alone}`);
    expect(await db.storedFile.count({ where: { id: alone } })).toBe(0);
    expect(await db.storedFile.count({ where: { id: shared } })).toBe(1);
    del.mockRestore();
  });

  it("EE5 seal needs an open time a minute ahead or openNow; past, missing or over 5 years is 422; a new zone moves the instant", async () => {
    const u = await user();
    const id = await ready(u);
    const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
    for (const extra of [{}, { opensAt: at(-DAY) }, { opensAt: at(30_000) }, { opensAt: at(5 * 366 * DAY) }, { opensAt: "soon" }, { opensAt: 12 }]) {
      const r = await sealIt(u, id, extra);
      expect([JSON.stringify(extra), r.status]).toEqual([JSON.stringify(extra), 422]);
      expect(r.body.error.fields.opensAt).toBeDefined();
    }
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).status).toBe("draft");
    // a stored time in the past is refused too
    const w = await draft(u);
    await save(u, w.id, { version: 0, content: letter, opensAt: "2020-01-01T09:00", timeZone: "Africa/Lagos" });
    await wishes.fulfilTicket(w.id, "moment");
    expect((await sealIt(u, w.id, {})).status).toBe(422);
    const ok = await sealIt(u, w.id, { openNow: true });
    expect(ok.status).toBe(200);
    expect(ok.body.item.opensAt).toBe(NOW.toISOString());
    // a zone change recomputes the instant from the stored local time, in the draft and at the seal
    const z = await draft(u);
    await save(u, z.id, { version: 0, content: letter, opensAt: "2027-03-01T09:00", timeZone: "Africa/Lagos" });
    expect((await db.wish.findUniqueOrThrow({ where: { id: z.id } })).opensAt!.toISOString()).toBe("2027-03-01T08:00:00.000Z");
    await save(u, z.id, { version: 1, timeZone: "Asia/Tokyo" });
    expect((await db.wish.findUniqueOrThrow({ where: { id: z.id } })).opensAt!.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    await wishes.fulfilTicket(z.id, "moment");
    const sealed = await sealIt(u, z.id, { timeZone: "Europe/London" });
    expect(sealed.body.item).toMatchObject({ timeZone: "Europe/London", opensAt: "2027-03-01T09:00:00.000Z" });
    // nothing else moves a sealed wish's open time: another seal, a save, a header, a zone
    const row = await db.wish.findUniqueOrThrow({ where: { id: z.id } });
    expect((await t.http().post(`/v1/wishes/${z.id}/seal`).set(bearer(u.token)).set("x-opens-at", at(DAY)).send({ version: row.version, opensAt: at(DAY), timeZone: "Asia/Tokyo" })).status).toBe(409);
    expect((await save(u, z.id, { version: row.version, opensAt: at(DAY), timeZone: "Asia/Tokyo" })).status).toBe(409);
    expect((await t.http().post(`/v1/wishes/${z.id}/seal`).set(bearer(u.token)).send({ version: row.version, opensAt: at(DAY), ticket: "premiere", status: "live" })).status).toBe(422);
    expect((await db.wish.findUniqueOrThrow({ where: { id: z.id } })).opensAt!.toISOString()).toBe("2027-03-01T09:00:00.000Z");
  });

  it("EE6 a draft cannot be erased, only removed by its owner", async () => {
    const u = await user();
    const w = await draft(u);
    const e = await t.http().post(`/v1/wishes/${w.id}/erase`).set(bearer(u.token)).send({});
    expect(e.status).toBe(409);
    expect(e.body.error.code).toBe("not_allowed");
    await expect(db.$transaction(async (tx) => life.move(tx, await life.lock(tx, w.id), "erased", { cause: "test" }))).rejects.toMatchObject({ response: { code: "not_allowed" } });
    const gone = await t.http().delete(`/v1/wishes/${w.id}`).set(bearer(u.token)).send({});
    expect(gone.status).toBe(200);
    expect(gone.body.state).toBe("taken_down");
  });

  it("CC1 CC2 save and seal take the contract's body: version is required, keep is null, month, half or year, a zone must be a zone", async () => {
    const u = await user();
    const w = await draft(u);
    expect((await save(u, w.id, { version: 0, keep: "week" })).status).toBe(422);
    const k = await save(u, w.id, { version: 0, keep: "half", content: letter });
    expect(k.body.version).toBe(1);
    expect((await save(u, w.id, { version: 1, keep: null })).status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id: w.id } })).keep).toBeNull();
    await wishes.fulfilTicket(w.id, "moment");
    expect((await t.http().post(`/v1/wishes/${w.id}/seal`).set(bearer(u.token)).send({ openNow: true })).status).toBe(422);
    const stale = await t.http().post(`/v1/wishes/${w.id}/seal`).set(bearer(u.token)).send({ version: 0, openNow: true });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("stale_version");
    expect((await sealIt(u, w.id, { openNow: true, timeZone: "Mars/Base" })).status).toBe(422);
    expect((await sealIt(u, w.id, { openNow: true })).status).toBe(200);
  });

  it("BB6 every move that takes a wish out of sight calls SavedWishesService.forgetForWishes in its transaction", async () => {
    const saved = t.app.get(SavedWishesService);
    const spy = jest.spyOn(saved, "forgetForWishes");
    const u = await user();
    const fan = await user();
    const fanSave = (wish: string) => db.savedWish.create({ data: { id: nid(), wish, accountId: fan.accountId } });
    const removed = await ready(u);
    await fanSave(removed);
    expect((await t.http().delete(`/v1/wishes/${removed}`).set(bearer(u.token)).send({})).status).toBe(200);
    const erased = await sealOn(u, new Date(NOW.getTime() + DAY));
    await fanSave(erased);
    expect((await t.http().post(`/v1/wishes/${erased}/erase`).set(bearer(u.token)).send({})).status).toBe(204);
    const down = await sealOn(u, new Date(NOW.getTime() + DAY));
    await fanSave(down);
    await life.takeDown(down, "staff.take-down");
    const rested = await sealOn(u, new Date(NOW.getTime() + DAY));
    await db.$transaction((tx) => life.markOpened(tx, rested, new Date(NOW.getTime() + DAY)));
    await fanSave(rested);
    t.clock.set(new Date(NOW.getTime() + 400 * DAY));
    await jobs.runDue(100, [rested]);
    expect((await db.wish.findUniqueOrThrow({ where: { id: rested } })).status).toBe("resting");
    t.clock.set(new Date(NOW.getTime() + 800 * DAY));
    await jobs.runDue(100, [rested]);
    expect((await db.wish.findUniqueOrThrow({ where: { id: rested } })).erasedAt).not.toBeNull();
    for (const id of [removed, erased, down, rested]) {
      expect(spy.mock.calls.some((c) => (c[1]).includes(id))).toBe(true);
      expect(await db.savedWish.count({ where: { wish: id } })).toBe(0);
    }
    spy.mockRestore();
    t.clock.set(NOW);
  });

  it("E-226 adds confirmed photos to a draft under the ticket's limit; a sealed wish refuses (409)", async () => {
    const u = await user();
    const other = await user();
    const w = await draft(u);
    const add = (id: string, files: unknown[], who = u) => t.http().post(`/v1/wishes/${id}/add-photos`).set(bearer(who.token)).send({ files, result: null });
    const a = await file(u.accountId);
    const b = await file(u.accountId);
    const r = await add(w.id, [a, b]);
    expect(r.status).toBe(200);
    expect(r.body.content.story.photos).toEqual([{ photoId: a }, { photoId: b }]);
    expect(r.body.version).toBe(1);
    expect((await add(w.id, [a])).body.content.story.photos).toHaveLength(2);
    expect((await db.wishFile.findMany({ where: { wishId: w.id } })).map((x) => x.fileId).sort()).toEqual([a, b].sort());
    expect((await add(w.id, [await file(other.accountId)])).status).toBe(422);
    expect((await add(w.id, [await file(u.accountId, "pending")])).status).toBe(422);
    expect((await add(w.id, ["x"])).status).toBe(422);
    expect((await add(w.id, [])).status).toBe(422);
    expect((await add(w.id, [a], other)).status).toBe(404);
    expect((await t.http().post(`/v1/wishes/${w.id}/add-photos`).send({ files: [a], result: null })).status).toBe(401);
    const many = await Promise.all(Array.from({ length: 5 }, () => file(u.accountId)));
    const over = await add(w.id, many);
    expect(over.status).toBe(422);
    expect(over.body.error.fields.photos).toMatch(/6 photos/);
    await save(u, w.id, { version: 1, content: letter });
    await wishes.fulfilTicket(w.id, "moment");
    expect((await sealIt(u, w.id)).status).toBe(200);
    expect((await add(w.id, [await file(u.accountId)])).status).toBe(409);
  });
});
