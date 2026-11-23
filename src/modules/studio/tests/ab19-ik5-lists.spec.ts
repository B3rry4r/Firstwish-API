import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { RUN } from "../../../../test/kit/unique";
import { tag } from "../../staff-accounts/tests/staff-kit";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-02T09:00:00.000Z");
const ids = new UuidV7Maker();
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const doc = (over: Body = {}): Body => ({
  name: "Gold hour", base: "noir", brief: "Warm light.", theme: {}, scenes: { letter: { layers: {} } }, art: [],
  made: { kinds: ["love"], occasions: {}, best: "portrait" }, tags: { mood: ["warm"], palette: "gold", family: "noir" }, still: "fade",
  poster: { frame: "cover" }, holds: { portrait: "bars", landscape: "fills" }, ...over,
});
const ADDED = ["shape", "artwork", "effect", "text", "model", "photo", "element", "three"];

/** API-BASE-19 task 3 (IK5): the Studio's save and send-in take no base, layout or added kind the server does not know. */
describe("API-BASE-19 IK5: the Studio's lists", () => {
  const own = ownDatabase("ab19s");
  let t: TestApp;
  let db: PrismaService;
  let n = 0;
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
  async function creator() {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab19-${RUN}-${++n}@example.com`, handle: `ab19${tag()}`, sides: ["person", "creator"], lastSide: "creator" } });
    await db.creator.create({ data: { id: ids.next(), accountId: id, name: `Maker ${n}` } });
    await db.creatorState.create({ data: { id: ids.next(), accountId: id, plan: "creator", credits: 3, reviewsLeft: 2, extraReviews: 0, packs: 0, renews: new Date(NOW.getTime() + 20 * 86_400_000), periodEndsAt: new Date(NOW.getTime() + 20 * 86_400_000), on: true, signed: false } });
    const token = `c-${tag()}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person", "creator"] });
    return { id, h: { Authorization: `Bearer ${token}` } };
  }
  type C = Awaited<ReturnType<typeof creator>>;
  const create = (c: C, style: Body) => t.http().post("/v1/studio/styles").set(c.h).send({ style });
  const save = (c: C, id: string, style: Body) => t.http().patch(`/v1/studio/styles/${id}`).set(c.h).send({ style });
  const send = (c: C, id: string) => t.http().post(`/v1/studio/styles/${id}/submissions`).set(c.h).send({});

  const bad: [string, Body, string][] = [
    ["an unknown base look", { base: "zzz-not-a-look" }, "style.base"],
    ["a layout that is a word", { scenes: { letter: { layers: {}, layout: "nonsense" } } }, "style.scenes.letter.layout"],
    ["a layout mode outside the list", { scenes: { letter: { layers: {}, layout: { mode: "nonsense" } } } }, "style.scenes.letter.layout"],
    ["a layout board outside the list", { scenes: { letter: { layers: {}, layout: { mode: "free", board: "sideways" } } } }, "style.scenes.letter.layout.board"],
    ["an added kind outside the list", { scenes: { letter: { layers: {}, added: [{ id: "a", kind: "text", what: "x", name: "x", x: 1, y: 1, w: 1 }, { id: "b", kind: "bogus", what: "x", name: "x", x: 1, y: 1, w: 1 }] } } }, "style.scenes.letter.added[1].kind"],
  ];

  it("a save and a first save refuse each, 422 naming the field; nothing is stored", async () => {
    const c = await creator();
    const made = await create(c, doc());
    expect(made.status).toBe(201);
    for (const [what, over, field] of bad) {
      const first = await create(c, doc(over));
      expect([what, first.status, Object.keys(first.body.error?.fields ?? {})]).toEqual([what, 422, expect.arrayContaining([field])]);
      const patched = await save(c, made.body.id, { ...doc(over), version: made.body.version });
      expect([what, patched.status, Object.keys(patched.body.error?.fields ?? {})]).toEqual([what, 422, expect.arrayContaining([field])]);
    }
    expect((await db.studioStyle.findUniqueOrThrow({ where: { id: made.body.id } })).document).toMatchObject({ version: 1, base: "noir" });
    expect(await db.studioStyle.count({ where: { accountId: c.id } })).toBe(1);
  });

  it("a send-in refuses a style saved before the rule, naming the field, and takes no review", async () => {
    for (const [what, over, field] of bad) {
      const c = await creator();
      const made = await create(c, doc());
      const row = await db.studioStyle.findUniqueOrThrow({ where: { id: made.body.id } });
      await db.studioStyle.update({ where: { id: row.id }, data: { document: { ...(row.document as Body), ...over } } });
      const r = await send(c, made.body.id);
      expect([what, r.status, Object.keys(r.body.error?.fields ?? {})]).toEqual([what, 422, expect.arrayContaining([field])]);
      expect(await db.styleSubmission.count({ where: { styleId: made.body.id } })).toBe(0);
      expect((await db.creatorState.findFirstOrThrow({ where: { accountId: c.id } })).reviewsLeft).toBe(2);
    }
  });

  it("everything the editor makes still saves: every scene set of the catalogue as a base, the blank base, both layout modes and every added kind", async () => {
    const c = await creator();
    const made = await create(c, doc());
    let version = made.body.version as number;
    const bases = (JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/Template.json"), "utf8")).rows as { base: string }[]).map((r) => r.base);
    expect(bases.length).toBeGreaterThan(40);
    const stack = { dir: "column", gap: 8, align: "center", justify: "start" };
    const scenes = {
      opening: { layers: {}, layout: { mode: "auto", stack, groups: { g1: { stack, flow: { grow: 0 } } } }, added: ADDED.map((kind, i) => ({ id: `a${i}`, kind, what: "x", name: kind, x: 50, y: 50, w: 30 })) },
      letter: { layers: {}, layout: { mode: "free", board: "portrait", fit: "contain" } },
      ending: { layers: {}, layout: { mode: "free", board: "landscape", fit: "cover" }, added: [] },
    };
    for (const base of [...bases, "blank"]) {
      const r = await save(c, made.body.id, { ...doc({ base, scenes }), version });
      expect([base, r.status]).toEqual([base, 200]);
      version = r.body.version;
    }
    // and the document most specs use (no layout, no added) is the plain case
    expect((await save(c, made.body.id, { ...doc(), version })).status).toBe(200);
  }, 120000);
});
