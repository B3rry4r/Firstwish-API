import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RUN, testSlug } from "../../../../test/kit/unique";
import { EntitlementsService } from "../../price-book/entitlements.service";
import { occasionsOfKind } from "../kind-occasions";
import { allowedLevel, levelRank, offeredForWish } from "../style-rule";
import { isLevel } from "../../styles/style-view";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-06-14T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const KINDS = ["love", "celebration", "group", "wedding", "teams", "photographers", "planners", "vendors"];

/** API-BASE-20 case 4 (IL4): a kind or occasion move that sends no style: the server picks one by the one rule; the web needs no rule of its own. */
describe("API-BASE-20 case 4: a move with no style picks the style by the server's rule", () => {
  let t: TestApp;
  let db: PrismaService;
  let book: Awaited<ReturnType<EntitlementsService["row"]>>;
  let only: string;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    book = await t.app.get(EntitlementsService).row();
    only = testSlug("only");
    // a style made for the teams kind alone (all occasions): a teams wish holds it; any other cell must pick another
    await db.style.create({ data: { id: ids.next(), slug: only, name: `Teams only ${only}`, on: true, level: "starter", kinds: ["teams"], house: false, creator: { handle: "ada", name: "Ada" }, by: "Ada" } as never });
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  const person = async () => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab20m-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab20m-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, auth: `Bearer ${token}` };
  };
  const wish = async (accountId: string, over: Record<string, unknown> = {}) => {
    const id = ids.next();
    await db.wish.create({ data: { id, accountId, status: "draft", kind: "teams", occasion: occasionsOfKind("teams")[0], styleSlug: only, styleTakenLevel: "starter", timeZone: "Africa/Lagos", name: "Ada", content: { letter: { paras: ["Hello."] } }, ...over } as never });
    return id;
  };
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const patch = async (auth: string, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set("Authorization", auth).send({ version: (await row(id)).version, ...body });

  it("4a: all 204 cells (68 kind and occasion pairs, with no ticket, a Keepsake and a Signature): no style sent; saved, with a style that is on, offered for the cell and at a level the ticket allows", async () => {
    const u = await person();
    const styles = await db.style.findMany({ select: { slug: true, level: true, kinds: true, occasions: true, on: true } });
    const out: string[] = [];
    let cells = 0;
    for (const ticket of [null, "keepsake", "signature"] as const) {
      for (const kind of KINDS) {
       for (const occasion of occasionsOfKind(kind)) {
        cells += 1;
        const w = await wish(u.id, { ticket });
        const r = await patch(u.auth, w, { kind, occasion });
        const now = await row(w);
        const s = styles.find((x) => x.slug === now.styleSlug);
        const ok = r.status === 200 && !!s && s.on === true && offeredForWish(s.kinds, s.occasions, kind, occasion) && (kind === "teams" ? now.styleSlug === only : levelRank(isLevel(s.level) ? s.level : "starter") <= levelRank(allowedLevel(book, ticket, []) ?? "starter"));
        if (!ok) out.push(`${kind}/${occasion}|${r.status}|${now.styleSlug}|${r.body?.error?.fields?.style ?? ""}`);
       }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`AB20-MOVE cells=${cells} notSaved=${out.length}\n${out.join("\n")}`);
    expect(cells).toBe(204);
    expect(out).toEqual([]);
  }, 600_000);

  it("4b: an occasion move alone, a ticket on the wish (the level its ticket allows), a style named stays judged as before, and none fits keeps the words", async () => {
    const u = await person();
    // occasion only: the held style names occasions (apology only) and the wish moves to another occasion of the kind
    const a = await wish(u.id, { kind: "love", occasion: "apology", styleSlug: "quiet", styleTakenLevel: "starter" });
    const moved = await patch(u.auth, a, { occasion: "birthday" });
    expect(moved.status).toBe(200);
    const styleA = await db.style.findUniqueOrThrow({ where: { slug: (await row(a)).styleSlug } });
    expect(offeredForWish(styleA.kinds, styleA.occasions, "love", "birthday")).toBe(true);
    expect((await row(a)).styleSlug).not.toBe("quiet");
    // a Keepsake draft: the pick is at the Keepsake level or below (premium style only with the extra)
    const k = await wish(u.id, { ticket: "keepsake" });
    expect((await patch(u.auth, k, { kind: "love", occasion: "birthday" })).status).toBe(200);
    const sk = await db.style.findUniqueOrThrow({ where: { slug: (await row(k)).styleSlug } });
    expect(levelRank(isLevel(sk.level) ? sk.level : "starter")).toBeLessThanOrEqual(levelRank(allowedLevel(book, "keepsake", []) ?? "starter"));
    // the same style named again is still refused, in the old words
    const c = await wish(u.id);
    const named = await patch(u.auth, c, { kind: "group", occasion: occasionsOfKind("group")[0], style: only });
    expect(named.status).toBe(422);
    expect(named.body.error.fields.style).toMatch(/not made for the group kind/);
    expect((await row(c)).kind).toBe("teams");
    // the style kept where still offered
    const same = await wish(u.id);
    expect((await patch(u.auth, same, { occasion: occasionsOfKind("teams")[1] ?? occasionsOfKind("teams")[0] })).status).toBe(200);
    expect((await row(same)).styleSlug).toBe(only);
  });
});
