import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { ownDatabase } from "../../../../test/kit/own-db";
import { testSlug } from "../../../../test/kit/unique";
import { uniqueHandle } from "../../accounts/tests/sides.kit";
import { account, B12App, b13App } from "../../showing/tests/b13-kit";

const DAY = 86_400_000;

/** API-BASE-12 case 3 (IF8): the migration that gives creatorId to the older styles, and E-285 after it. */
describe("IF8 a creator's styles follow the account", () => {
  let t: B12App;
  let db: PrismaService;
  const own = ownDatabase("if8");
  const sql = readFileSync(join(__dirname, "../../../../prisma/migrations/20261204090000_style_creator_ab12/migration.sql"), "utf8");
  beforeAll(async () => {
    own.use();
    t = await b13App();
    db = t.db;
  });
  afterAll(async () => {
    await t.close();
    own.drop();
  });

  async function creator(createdAt = new Date(Date.now() - 30 * DAY)) {
    const who = await account(t, ["creator"]);
    const handle = uniqueHandle("c");
    await db.account.update({ where: { id: who.accountId }, data: { handle, name: "Maker", createdAt } });
    const row = await db.creator.create({ data: { id: t.id(), accountId: who.accountId, name: "Maker" } });
    return { handle, creatorId: row.id, accountId: who.accountId };
  }
  async function style(creatorJson: unknown, over: Record<string, unknown> = {}) {
    const slug = testSlug("st");
    const row = await db.style.create({ data: { id: t.id(), slug, name: slug, level: "standard", tier: "standard", house: false, on: true, by: "x", get: "", record: [], addedAt: new Date(Date.now() - 10 * DAY), creator: creatorJson as never, ...over } as never });
    return { slug, id: row.id };
  }
  const migrate = () => db.$executeRawUnsafe(sql);
  const stored = async (id: string) => (await db.style.findUniqueOrThrow({ where: { id } })).creator as Record<string, unknown> | null;
  const listed = async (handle: string) => ((await t.http().get(`/v1/creators/${handle}/styles`)).body.items as { slug: string }[]).map((s) => s.slug);

  it("3a. a style with a handle and no creatorId gets the creatorId of the creator who held the handle; E-285 then lists it under them", async () => {
    const c = await creator();
    const other = await creator();
    const older = await style({ handle: c.handle, name: "Maker" });
    const shouty = await style({ handle: `@${c.handle.toUpperCase()}`, name: "Maker" });
    const already = await style({ creatorId: other.creatorId, handle: c.handle, name: "Maker" });
    expect(await listed(c.handle)).toEqual([]);
    await migrate();
    expect(await stored(older.id)).toEqual({ handle: c.handle, name: "Maker", creatorId: c.creatorId });
    expect((await stored(shouty.id))?.creatorId).toBe(c.creatorId);
    expect((await stored(already.id))?.creatorId).toBe(other.creatorId); // one that has an id is not touched
    expect((await listed(c.handle)).sort()).toEqual([older.slug, shouty.slug].sort());
    expect(await listed(other.handle)).toEqual([already.slug]);
    // a second run changes nothing
    const before = await stored(older.id);
    await migrate();
    expect(await stored(older.id)).toEqual(before);
  });

  it("3b. a handle that matches nobody is left as it was: no account, an account made after the style, a review of another creator, no handle at all", async () => {
    const none = await style({ handle: `nobody-${testSlug("h")}`, name: "Ghost" });
    const late = await creator(new Date());
    const tooLate = await style({ handle: late.handle, name: "Late" }, { addedAt: new Date(Date.now() - 40 * DAY) });
    const mine = await creator();
    const theirs = await creator();
    const reviewed = await style({ handle: mine.handle, name: "Reviewed" });
    await db.styleSubmission.create({ data: { id: t.id(), styleId: reviewed.id, creatorId: theirs.creatorId, version: 1, checks: [], status: "live" } as never });
    const noHandle = await style({ name: "Plain" });
    const blank = await style(null);
    const noCreatorRow = await account(t, ["person"]);
    const bare = uniqueHandle("b");
    await db.account.update({ where: { id: noCreatorRow.accountId }, data: { handle: bare } });
    const orphan = await style({ handle: bare, name: "Bare" });
    await migrate();
    expect(await stored(none.id)).toEqual({ handle: expect.any(String), name: "Ghost" });
    expect(await stored(tooLate.id)).toEqual({ handle: late.handle, name: "Late" });
    expect(await stored(reviewed.id)).toEqual({ handle: mine.handle, name: "Reviewed" });
    expect(await stored(noHandle.id)).toEqual({ name: "Plain" });
    expect(await stored(blank.id)).toBeNull();
    expect(await stored(orphan.id)).toEqual({ handle: bare, name: "Bare" });
    expect(await listed(mine.handle)).toEqual([]);
  });
});
