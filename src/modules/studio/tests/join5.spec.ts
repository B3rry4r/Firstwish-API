import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { AiWritingPort } from "../../../common/ports/ai.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { cleanDoc, shapeParts } from "../studio-doc";
import { parseChange } from "../studio-ai.service";
import { RUN } from "../../../../test/kit/unique";

/* Wave 5 join J8: the AI answer's `art` is checked as a save checks it; a draft wish saved again with its own current style is accepted after that style went off. */
const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-03T09:00:00.000Z");
const ids = new UuidV7Maker();
const tag = `j5s${RUN}`;
let seq = 0;

describe("wave 5 join: Studio re-check (J8)", () => {
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

  const person = async (sides: ("person" | "creator")[] = ["person"]) => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `${tag}-${++seq}@example.com`, handle: `${tag}${seq}`.slice(0, 20), sides, lastSide: sides[sides.length - 1] } });
    const token = `j5s-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides });
    return { id, h: { Authorization: `Bearer ${token}` } };
  };

  it("shapeParts checks art as a save does: a non-list or more than 200 things is named, a list passes", () => {
    const out: Record<string, unknown> = {};
    expect(shapeParts({ art: "no" }, "answer", out)).toEqual({ "answer.art": expect.any(String) });
    expect(shapeParts({ art: new Array(201).fill({}) }, "answer", {})).toHaveProperty(["answer.art"]);
    expect(shapeParts({ art: [{}] }, "answer", out)).toEqual({});
    expect(out.art).toEqual([{}]);
    expect(() => cleanDoc({ name: "A", base: "noir", art: "no" })).toThrow();
    expect(cleanDoc({ name: "A", base: "noir", art: [{}] }).art).toEqual([{}]);
    expect(parseChange('{"said":["ok"],"art":"no"}')).toBeNull();
    expect(parseChange('{"said":["ok"],"art":[{}]}')).toEqual({ said: ["ok"] });
  });

  it("an AI answer with a bad art is 502 ai_failed with the credits back, and the request is marked failed", async () => {
    const c = await person(["person", "creator"]);
    await db.creator.create({ data: { id: ids.next(), accountId: c.id, name: "Maker" } });
    await db.creatorState.create({ data: { id: ids.next(), accountId: c.id, plan: "open", credits: 5, reviewsLeft: 1, extraReviews: 0, packs: 0, periodEndsAt: new Date(NOW.getTime() + 86_400_000), on: true, signed: false } });
    const spy = jest.spyOn(t.app.get(AiWritingPort), "write");
    try {
      spy.mockResolvedValueOnce({ text: JSON.stringify({ said: ["Made it warmer."], art: "not a list" }), model: "standin" });
      const bad = await t.http().post("/v1/ai/studio-change").set(c.h).send({ instruction: "warmer", style: { name: "Gold", base: "noir", art: [] } });
      expect(bad.status).toBe(502);
      expect(bad.body.error.code).toBe("ai_failed");
      expect((await db.creatorState.findUniqueOrThrow({ where: { accountId: c.id } })).credits).toBe(5);
      spy.mockResolvedValueOnce({ text: JSON.stringify({ said: ["Made it warmer."], art: [] }), model: "standin" });
      const good = await t.http().post("/v1/ai/studio-change").set(c.h).send({ instruction: "warmer", style: { name: "Gold", base: "noir", art: [] } });
      expect(good.status).toBe(200);
      expect((await db.creatorState.findUniqueOrThrow({ where: { accountId: c.id } })).credits).toBe(4);
    } finally {
      spy.mockRestore();
    }
    const rows = await db.aiRequest.findMany({ where: { accountId: c.id }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["failed", expect.any(String)]);
  });

  it("a draft saved again with its own current style is accepted after that style went off; a change to an off style is 422; to a style that is on, 200", async () => {
    const u = await person();
    const mk = async (slug: string, on: boolean) => {
      await db.style.create({ data: { id: ids.next(), slug: `${tag}-${slug}`, level: "standard", tier: "standard", name: slug, house: false, on } });
      return `${tag}-${slug}`;
    };
    const mine = await mk("mine", true);
    const other = await mk("other", true);
    const gone = await mk("gone", false);
    const made = await t.http().post("/v1/wishes").set(u.h).send({ from: "Ada", kind: "love", name: "Chidi", occasion: "birthday", studio: "", style: mine });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    await db.style.update({ where: { slug: mine }, data: { on: false } });
    const same = await t.http().patch(`/v1/wishes/${id}`).set(u.h).send({ version: 0, style: `  ${mine.toUpperCase()} `, name: "Chidi O" });
    expect(same.status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).styleSlug).toBe(mine);
    const toOff = await t.http().patch(`/v1/wishes/${id}`).set(u.h).send({ version: same.body.version, style: gone });
    expect(toOff.status).toBe(422);
    expect(toOff.body.error.fields.style).toBeDefined();
    const toOn = await t.http().patch(`/v1/wishes/${id}`).set(u.h).send({ version: same.body.version, style: other });
    expect(toOn.status).toBe(200);
    expect((await db.wish.findUniqueOrThrow({ where: { id } })).styleSlug).toBe(other);
    // the style it left is off now: going back to it is a change, so it is refused
    const back = await t.http().patch(`/v1/wishes/${id}`).set(u.h).send({ version: toOn.body.version, style: mine });
    expect(back.status).toBe(422);
  });
});
