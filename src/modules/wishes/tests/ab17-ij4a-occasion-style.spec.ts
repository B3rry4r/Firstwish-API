import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { ownDatabase } from "../../../../test/kit/own-db";
import { RUN, testSlug } from "../../../../test/kit/unique";
import { EntitlementsService } from "../../price-book/entitlements.service";
import { occasionsOfKind } from "../kind-occasions";
import { firstStyleFor, offeredForWish } from "../style-rule";
import { WishesService } from "../wishes.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-06-14T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const LEVEL_OF: Record<string, number> = { starter: 0, standard: 1, premium: 2 };
/** The ticket level each ticket takes (null: no ticket yet, every level). */
const TICKETS: [string | null, number][] = [[null, 2], ["moment", 0], ["keepsake", 1], ["signature", 2]];

type Cat = { slug: string; level: string | null; kinds: string[]; occasions: Record<string, string[]> };

/** API-BASE-17 case 1 to 4 (IJ4a): a style is offered for a wish by its kind AND, where it names occasions for that kind, by the wish's occasion. */
describe("API-BASE-17 IJ4a: a style is offered by kind and occasion; the style reads cache like the other public reads", () => {
  // This spec reads the whole style and sample-wish lists twice and compares them: a style another spec adds in between moves the answer, so it has a database of its own.
  const own = ownDatabase("ij4a");
  let t: TestApp;
  let db: PrismaService;
  let wishes: WishesService;
  let entitlements: EntitlementsService;
  let cat: Cat[];
  let kinds: string[];
  let seeded: Set<string>;

  beforeAll(async () => {
    own.use();
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    wishes = t.app.get(WishesService);
    entitlements = t.app.get(EntitlementsService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    seeded = new Set((JSON.parse(readFileSync(join(ROOT, "prisma/seed-data/Style.json"), "utf8")).rows as { slug: string }[]).map((r) => r.slug));
    await refresh();
    kinds = [...new Set(cat.flatMap((s) => s.kinds))].sort();
  }, 120_000);
  afterAll(async () => {
    await t.close();
    own.drop();
  });
  beforeEach(() => t.clock.set(NOW));

  /** The public styles list, read as the web reads it (every page of GET /v1/styles), the house catalogue only: other specs add and switch styles beside this one. */
  const refresh = async (): Promise<void> => {
    const got: Cat[] = [];
    let cursor: string | undefined;
    do {
      const page = await t.http().get("/v1/styles").query({ limit: 50, ...(cursor ? { cursor } : {}) });
      expect(page.status).toBe(200);
      for (const s of page.body.items) if (seeded.has(s.slug)) got.push({ slug: s.slug, level: s.level, kinds: s.kinds ?? [], occasions: s.occasions ?? {} });
      cursor = page.body.nextCursor ?? undefined;
    } while (cursor);
    cat = got;
  };
  const house = (list: string[]): string[] => list.filter((s) => seeded.has(s));

  /** The public list's own rule (lib/offers.ts: startStyle): the style names the kind and, if it limits occasions for it, the occasion. */
  const listed = (kind: string, occasion: string): string[] =>
    cat.filter((s) => s.kinds.includes(kind) && ((s.occasions[kind] ?? []).length === 0 || (s.occasions[kind] ?? []).includes(occasion))).map((s) => s.slug);

  type U = { id: string; token: string };
  const person = async (): Promise<U> => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab17-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab17-${id}`;
    t.tokens.set(token, { kind: "user", accountId: id, sides: ["person"] });
    return { id, token };
  };
  const wish = async (u: U, over: Record<string, unknown> = {}) => {
    const kind = typeof over.kind === "string" ? over.kind : "love";
    const id = ids.next();
    await db.wish.create({ data: { id, accountId: u.id, status: "draft", kind, occasion: occasionsOfKind(kind)[0], styleSlug: "noir", timeZone: "Africa/Lagos", name: "Ada", content: { letter: { paras: ["Hello."] } }, ...over } as never });
    return id;
  };
  const row = (id: string) => db.wish.findUniqueOrThrow({ where: { id } });
  const patch = async (u: U, id: string, body: Record<string, unknown>) => t.http().patch(`/v1/wishes/${id}`).set(bearer(u.token)).send({ version: (await row(id)).version, ...body });
  const read = (u: U, id: string) => t.http().get(`/v1/wishes/${id}`).set(bearer(u.token));
  const pick = (kind: string, occasion: string | null, ticket: string | null) =>
    entitlements.row().then((book) => (wishes as unknown as { pickStyle(db: unknown, book: unknown, kind: string, ticket: string | null, occasion?: string | null): Promise<{ slug: string }> }).pickStyle(db, book, kind, ticket, occasion));

  it("the seen case: a new love birthday wish is not given Quiet (apology only); the pick is offered for the kind and occasion, for every kind by occasion", async () => {
    const u = await person();
    const r = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ kind: "love", occasion: "birthday", name: "Ada", from: "Bola", studio: "" });
    expect(r.status).toBe(201);
    const got = (await row(r.body.id)).styleSlug;
    expect(got).not.toBe("quiet");
    expect(listed("love", "birthday")).toContain(got);
    expect(listed("love", "birthday")).not.toContain("quiet");
    let walked = 0;
    for (const kind of kinds) {
      for (const occasion of occasionsOfKind(kind)) {
        const a = await pick(kind, occasion, null); // a new wish
        const b = await pick(kind, occasion, "signature"); // a business draft, a Concierge wish
        for (const s of [a.slug, b.slug]) if (s !== "") expect([kind, occasion, listed(kind, occasion)]).toEqual([kind, occasion, expect.arrayContaining([s])]);
        walked += 1;
      }
    }
    expect(walked).toBeGreaterThan(40);
    // a kind with no style that fits an occasion starts with no style (the rule never picks one the save would refuse)
    const rows = [{ slug: "quiet-like", level: "starter", kinds: ["love"], occasions: { love: ["apology"] }, on: true }];
    expect(firstStyleFor(rows, "love", "starter", "birthday")).toBeUndefined();
    expect(firstStyleFor(rows, "love", "starter", "apology")?.slug).toBe("quiet-like");
    expect(firstStyleFor(rows, "love", "starter")).toBeUndefined(); // no occasion yet: only styles with no occasion limit
  }, 120_000);

  it("the rule: kind, then occasion where the style names occasions for that kind; no occasion yet means only unlimited styles; borrowed kinds follow the kind they borrow", () => {
    const quiet = { kinds: ["love"], occasions: { love: ["apology"] } };
    expect(offeredForWish(quiet.kinds, quiet.occasions, "love", "apology")).toBe(true);
    expect(offeredForWish(quiet.kinds, quiet.occasions, "love", "birthday")).toBe(false);
    expect(offeredForWish(quiet.kinds, quiet.occasions, "love", "")).toBe(false);
    expect(offeredForWish(quiet.kinds, quiet.occasions, "group", "apology")).toBe(false);
    expect(offeredForWish(["love", "celebration"], { celebration: ["mothers-day"] }, "love", "birthday")).toBe(true); // names none for love
    expect(offeredForWish(["love", "celebration"], { celebration: ["mothers-day"] }, "celebration", "birthday")).toBe(false);
    expect(offeredForWish(["wedding"], { wedding: ["save-the-date"] }, "planners", "save-the-date")).toBe(true);
    expect(offeredForWish(["wedding"], { wedding: ["save-the-date"] }, "planners", "our-story")).toBe(false);
    expect(offeredForWish(["love"], null, "love", "")).toBe(true);
  });

  it("allowedStyles equals the public list for every kind by occasion and ticket level; each listed style saves 200; unlisted ones are 422 in words that name the rule", async () => {
    const u = await person();
    let saved = 0;
    let refused = 0;
    for (const kind of kinds) {
      // one wish per kind, moved by occasion and ticket (a few wishes only: other specs count wishes beside this one)
      const w = await wish(u, { kind });
      for (const occasion of occasionsOfKind(kind)) {
        await refresh();
        const base = new Set(listed(kind, occasion));
        for (const [ticket, top] of TICKETS) {
          await db.wish.update({ where: { id: w }, data: { occasion, ticket: ticket as never, styleSlug: "noir" } });
          const r = await read(u, w);
          expect(r.status).toBe(200);
          const want = [...base].filter((s) => LEVEL_OF[cat.find((c) => c.slug === s)?.level ?? "starter"] <= top).sort();
          expect([kind, occasion, ticket, house(r.body.allowedStyles).sort()]).toEqual([kind, occasion, ticket, want]);
        }
        await db.wish.update({ where: { id: w }, data: { occasion, ticket: "signature", styleSlug: "noir" } });
        const all: string[] = house((await read(u, w)).body.allowedStyles);
        for (const slug of all) {
          const p = await patch(u, w, { style: slug });
          if (p.status !== 200) throw new Error(`${kind} ${occasion} ${slug}: ${p.status} ${JSON.stringify(p.body.error)}`);
          saved += 1;
        }
        const no = cat.map((c) => c.slug).filter((s) => !all.includes(s));
        for (const slug of no.slice(0, 3)) {
          const p = await patch(u, w, { style: slug });
          if (p.status !== 422) throw new Error(`${kind} ${occasion} ${slug}: ${p.status}`);
          expect(p.body.error.fields.style).toMatch(new RegExp(`not made for the (${kind} kind|${occasion} occasion of the ${kind} kind)`));
          refused += 1;
        }
      }
    }
    expect(saved).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(100);
  }, 600_000);

  it("the save, a kind change and an occasion change with a style held, in words; a held style replaced in the same save is fine", async () => {
    const u = await person();
    const w = await wish(u, { kind: "love", occasion: "birthday" });
    const bad = await patch(u, w, { style: "quiet" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.style).toBe("Quiet is not made for the birthday occasion of the love kind. Choose a style made for it.");
    expect((await row(w)).styleSlug).toBe("noir");
    // a wish of the apology occasion takes Quiet; the occasion then moves away with it held: refused, unchanged
    const a = await wish(u, { kind: "love", occasion: "apology", styleSlug: "quiet" });
    // API-BASE-20 (IL4): with a style named (Quiet again) the move is refused in these words; with none sent the server picks one (the next block)
    const moved = await patch(u, a, { occasion: "birthday", style: "quiet" });
    expect(moved.status).toBe(422);
    expect(moved.body.error.fields.style).toMatch(/Quiet is not made for the birthday occasion of the love kind\. Choose a style made for it\. Send a style made for the birthday occasion in the same save\./);
    expect(await row(a)).toMatchObject({ occasion: "apology", styleSlug: "quiet" });
    const picked = await patch(u, a, { occasion: "birthday" });
    expect(picked.status).toBe(200);
    expect(await row(a)).toMatchObject({ occasion: "birthday" });
    expect((await row(a)).styleSlug).not.toBe("quiet");
    await db.wish.update({ where: { id: a }, data: { occasion: "apology", styleSlug: "quiet" } });
    expect((await patch(u, a, { occasion: "birthday", style: "noir" })).status).toBe(200);
    expect(await row(a)).toMatchObject({ occasion: "birthday", styleSlug: "noir" });
    // an occasion the style is made for stays fine, a kind change with the occasion refused the same way
    const b = await wish(u, { kind: "love", occasion: "apology", styleSlug: "quiet" });
    expect((await patch(u, b, { occasion: "apology" })).status).toBe(200);
    const k = await patch(u, b, { kind: "celebration", occasion: "birthday", style: "quiet" });
    expect(k.status).toBe(422);
    expect(k.body.error.fields.style).toMatch(/not made for the celebration kind/);
    // a wish with no occasion yet is offered only styles with no occasion limit
    const e = await wish(u, { kind: "love", occasion: "" });
    await refresh();
    const list: string[] = house((await read(u, e)).body.allowedStyles);
    expect(list).toContain("noir");
    expect(list).not.toContain("quiet");
    expect(list.sort()).toEqual(cat.filter((s) => s.kinds.includes("love") && (s.occasions.love ?? []).length === 0).map((s) => s.slug).sort());
  });

  it("the ticket start and the settle use the same rule", async () => {
    const u = await person();
    const bad = await wish(u, { kind: "love", occasion: "birthday", styleSlug: "quiet" }); // a draft the old pick could have made
    const start = await t.http().post("/v1/payments").set(bearer(u.token)).send({ purpose: "ticket", id: "moment", subjectId: bad });
    expect(start.status).toBe(422);
    expect(start.body.error.fields.subjectId).toMatch(/Quiet is not made for the birthday occasion of the love kind/);
    const ok = await wish(u, { kind: "love", occasion: "apology", styleSlug: "quiet" });
    const good = await t.http().post("/v1/payments").set(bearer(u.token)).send({ purpose: "ticket", id: "moment", subjectId: ok });
    expect(good.status).toBe(201);
    // the occasion moved under a started payment (a direct change, as a late staff edit would be): the settle refuses it
    await db.wish.update({ where: { id: ok }, data: { occasion: "birthday" } });
    const { assessTicketStyle, readWish } = await import("../../purchases/wish-rules");
    const facts = await readWish(db, ok);
    const why = await assessTicketStyle(db, facts as never, "moment", await entitlements.row());
    expect(why).toMatchObject({ reason: "style_wrong_kind" });
    expect(why?.words).toMatch(/Quiet is not made for the birthday occasion of the love kind/);
  });

  it("a PATCH that sets a switched-off style, a creator's or a house one, is 422 in the style rule's words", async () => {
    const u = await person();
    const slug = testSlug("cs");
    await db.style.create({ data: { id: ids.next(), slug, name: "Studio Off", on: false, level: "starter", kinds: ["love"], house: false, creator: { handle: "ada", name: "Ada" }, by: "Ada" } as never });
    const w = await wish(u);
    const r = await patch(u, w, { style: slug });
    expect(r.status).toBe(422);
    expect(r.body.error.message).toBe("Some fields need fixing.");
    expect(r.body.error.fields.style).toBe("Studio Off is switched off. Choose another style.");
    const none = await patch(u, w, { style: "no-such-style" });
    expect(none.status).toBe(422);
    expect(none.body.error.fields.style).toBe("That style is not offered.");
    expect((await row(w)).styleSlug).toBe("noir");
  });

  it("the public style read (E-196) carries the same Cache-Control as the styles levels read, with an ETag", async () => {
    const levels = await t.http().get("/v1/styles/levels");
    const one = await t.http().get("/v1/styles/noir");
    expect(one.status).toBe(200);
    expect(one.headers["cache-control"]).toBe(levels.headers["cache-control"]);
    expect(one.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect(String(one.headers.etag).length).toBeGreaterThan(2);
    const again = await t.http().get("/v1/styles/noir").set("if-none-match", String(one.headers.etag));
    expect(again.status).toBe(304);
  });

  it("a trailing slash on the two sample-wish reads answers 200, as the other public reads answer it (nothing changed)", async () => {
    for (const [plain, slashed] of [["/v1/styles/levels", "/v1/styles/levels/"], ["/v1/styles/noir", "/v1/styles/noir/"], ["/v1/sample-wishes", "/v1/sample-wishes/"], ["/v1/sample-wishes/love/birthday", "/v1/sample-wishes/love/birthday/"]]) {
      const a = await t.http().get(plain);
      const b = await t.http().get(slashed);
      expect([slashed, b.status]).toEqual([slashed, a.status]);
      expect(a.status).toBe(200);
      expect(b.body).toEqual(a.body);
    }
  });
});
