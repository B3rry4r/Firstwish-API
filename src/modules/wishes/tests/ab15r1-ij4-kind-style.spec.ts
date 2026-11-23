import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { RUN, testSlug } from "../../../../test/kit/unique";
import { EntitlementsService } from "../../price-book/entitlements.service";
import { occasionsOfKind } from "../kind-occasions";
import { allowedLevel, firstStyleFor, levelRank, offeredForKind } from "../style-rule";
import { WishesService } from "../wishes.service";
import { isLevel } from "../../styles/style-view";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2027-06-14T09:00:00.000Z");
const ids = new UuidV7Maker();
let seq = 0;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const KINDS = ["love", "celebration", "group", "wedding", "teams", "photographers"] as const;
const TICKETS = [null, "moment", "keepsake", "signature", "premiere"] as const;

/** API-BASE-15 round 1, H2 to H4 (IJ4): the kind rule where the kind changes, where the server picks a style, and in the list of styles a wish may take. */
describe("API-BASE-15 round 1 (IJ4): the kind rule for a kind change, the server's own pick and allowedStyles", () => {
  let t: TestApp;
  let db: PrismaService;
  let wishes: WishesService;
  let entitlements: EntitlementsService;

  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    wishes = t.app.get(WishesService);
    entitlements = t.app.get(EntitlementsService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  beforeEach(() => t.clock.set(NOW));

  type U = { id: string; token: string };
  const person = async (): Promise<U> => {
    const id = ids.next();
    await db.account.create({ data: { id, contact: `ab15r1k-${RUN}-${++seq}@example.com`, name: "Ada Obi", sides: ["person"], lastSide: "person" } });
    const token = `ab15r1k-${id}`;
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

  describe("H2: changing the kind with a style held", () => {
    it("a love-only style on a love wish, kind changed to group: refused in words, the wish is unchanged", async () => {
      const u = await person();
      const w = await wish(u, { styleSlug: "letter" });
      // API-BASE-20 (IL4): a move that sends no style picks one by the rule (the held style is not made for the group kind); a style NAMED, the held one too, is refused as before
      const named = await patch(u, w, { kind: "group", occasion: occasionsOfKind("group")[0], style: "letter" });
      expect(named.status).toBe(422);
      expect(named.body.error.fields.style).toMatch(/not made for the group kind/);
      expect(await row(w)).toMatchObject({ kind: "love", styleSlug: "letter" });
      const r = await patch(u, w, { kind: "group", occasion: occasionsOfKind("group")[0] });
      expect(r.status).toBe(200);
      const picked = await db.style.findUniqueOrThrow({ where: { slug: (await row(w)).styleSlug } });
      expect(await row(w)).toMatchObject({ kind: "group" });
      expect(offeredForKind(picked.kinds, "group")).toBe(true);
      // a creator's style: the move sends a style by name and is refused
      const slug = testSlug("cs");
      await db.style.create({ data: { id: ids.next(), slug, name: `Studio ${slug}`, on: true, level: "starter", kinds: ["love"], house: false, creator: { handle: "ada", name: "Ada" }, by: "Ada" } as never });
      const c = await wish(u, { styleSlug: slug });
      expect((await patch(u, c, { kind: "celebration", occasion: "birthday", style: slug })).status).toBe(422);
      expect((await row(c)).kind).toBe("love");
    });

    it("allowed when the held style is offered for the new kind, or is replaced in the same save", async () => {
      const u = await person();
      const a = await wish(u, { styleSlug: "noir" }); // made for love, celebration and photographers
      expect((await patch(u, a, { kind: "celebration", occasion: "birthday" })).status).toBe(200);
      expect(await row(a)).toMatchObject({ kind: "celebration", styleSlug: "noir" });
      const b = await wish(u, { styleSlug: "letter" });
      const same = await patch(u, b, { kind: "group", occasion: occasionsOfKind("group")[0], style: "banter" });
      expect(same.status).toBe(200);
      expect(await row(b)).toMatchObject({ kind: "group", styleSlug: "banter" });
      // the same style named again does not get round the rule
      const c = await wish(u, { styleSlug: "letter" });
      expect((await patch(u, c, { kind: "group", occasion: occasionsOfKind("group")[0], style: "letter" })).status).toBe(422);
      // the same kind sent again is not a change
      const d = await wish(u, { styleSlug: "letter" });
      expect((await patch(u, d, { kind: "love", occasion: "birthday" })).status).toBe(200);
      // a new style that is wrong for the new kind is refused as before
      const e = await wish(u, { styleSlug: "letter" });
      expect((await patch(u, e, { kind: "group", occasion: occasionsOfKind("group")[0], style: "cinema" })).status).toBe(422);
    });
  });

  describe("H3: the style the server picks", () => {
    it("a start with no style, by kind: the style is on, offered for the kind and starter; a ticket start after it is accepted", async () => {
      const u = await person();
      for (const kind of KINDS) {
        const r = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ kind, occasion: occasionsOfKind(kind)[0], name: "Ada", from: "Bola", studio: "" });
        expect([kind, r.status]).toEqual([kind, 201]);
        const w = await row(r.body.id);
        const s = await db.style.findUniqueOrThrow({ where: { slug: w.styleSlug } });
        expect([kind, s.on, offeredForKind(s.kinds, kind), s.level]).toEqual([kind, true, true, "starter"]);
        expect(w.styleTakenLevel).toBe("starter");
        const pay = await t.http().post("/v1/payments").set(bearer(u.token)).send({ purpose: "ticket", id: "moment", subjectId: w.id });
        expect([kind, pay.status]).toEqual([kind, 201]);
      }
    });

    it("a bare start (love by default) and the Concierge and business pick: on, offered for the kind, allowed by a Signature ticket, for every kind", async () => {
      const u = await person();
      const bare = await t.http().post("/v1/wishes").set(bearer(u.token)).send({ name: "Ada", from: "Bola", studio: "" });
      expect(bare.status).toBe(201);
      const bs = await db.style.findUniqueOrThrow({ where: { slug: (await row(bare.body.id)).styleSlug } });
      expect([bs.on, offeredForKind(bs.kinds, "love"), bs.level]).toEqual([true, true, "starter"]);
      const book = await entitlements.row();
      const pick = (wishes as unknown as { pickStyle(db: PrismaService, book: unknown, kind: string, ticket: string | null): Promise<{ slug: string; level: string | null }> }).pickStyle.bind(wishes);
      for (const kind of KINDS) {
        const got = await pick(db, book, kind, "signature");
        const s = await db.style.findUniqueOrThrow({ where: { slug: got.slug } });
        const allowed = allowedLevel(book, "signature", []);
        expect([kind, s.on, offeredForKind(s.kinds, kind), allowed !== null && levelRank(isLevel(s.level) ? s.level : "starter") <= levelRank(allowed)]).toEqual([kind, true, true, true]);
        // a wish made with that style takes a ticket start without a 422 (a Signature wish has the ticket already: Premiere is the upgrade)
        const w = await wish(u, { kind, styleSlug: got.slug, styleTakenLevel: got.level });
        const pay = await t.http().post("/v1/payments").set(bearer(u.token)).send({ purpose: "ticket", id: "premiere", subjectId: w });
        expect([kind, pay.status]).toEqual([kind, 201]);
      }
    });

    it("a kind with no style that fits: the pick answers no style, and a wish with no style cannot be sealed until the maker chooses one", async () => {
      const rows = [
        { slug: "only-love", level: "starter", kinds: ["love"], on: true },
        { slug: "only-premium-group", level: "premium", kinds: ["group"], on: true },
        { slug: "off-group", level: "starter", kinds: ["group"], on: false },
      ];
      expect(firstStyleFor(rows, "group", "starter")).toBeUndefined();
      expect(firstStyleFor(rows, "group", null)?.slug).toBe("only-premium-group");
      expect(firstStyleFor(rows, "love", "starter")?.slug).toBe("only-love");
      const fake = { style: { findMany: () => Promise.resolve(rows.filter((r) => r.on)) } } as unknown as PrismaService;
      const pick = (wishes as unknown as { pickStyle(db: unknown, book: unknown, kind: string, ticket: string | null): Promise<{ slug: string; level: string | null }> }).pickStyle.bind(wishes);
      expect(await pick(fake, await entitlements.row(), "group", null)).toEqual({ slug: "", level: null });
      expect((await pick(fake, await entitlements.row(), "love", null)).slug).toBe("only-love");
      await expect(pick({ style: { findMany: () => Promise.resolve([]) } }, await entitlements.row(), "love", null)).rejects.toMatchObject({ response: { code: "no_style" } });
      // the wish that started with no style: its read says nothing is offered by accident, a ticket may be bought, and the seal asks for the style step
      const u = await person();
      const w = await wish(u, { styleSlug: "", ticket: "keepsake" });
      const s = await t.http().post(`/v1/wishes/${w}/seal`).set(bearer(u.token)).send({ version: (await row(w)).version, openNow: true });
      expect(s.status).toBe(422);
      expect(s.body.error.fields.style).toBe("Choose a style before sealing.");
      expect((await patch(u, w, { style: "noir" })).status).toBe(200);
    });
  });

  describe("H4: allowedStyles lists exactly what a save would accept (level and kind)", () => {
    it("every kind by ticket: every listed style is accepted by the PATCH (200) and one unlisted style is refused (422)", async () => {
      const u = await person();
      const on = await db.style.findMany({ where: { on: true, slug: { not: null } }, select: { slug: true } });
      let listedTotal = 0;
      for (const kind of KINDS) {
        for (const ticket of TICKETS) {
          const w = await wish(u, { kind, ticket });
          const r = await read(u, w);
          expect(r.status).toBe(200);
          const listed: string[] = r.body.allowedStyles;
          listedTotal += listed.length;
          expect(listed.length).toBeGreaterThan(0);
          for (const slug of listed) {
            const p = await patch(u, w, { style: slug });
            if (p.status !== 200) throw new Error(`${kind} ${ticket} ${slug}: ${p.status} ${JSON.stringify(p.body.error)}`);
          }
          const held = (await row(w)).styleSlug;
          const unlisted = on.map((s) => String(s.slug)).find((s) => !listed.includes(s) && s !== held);
          if (unlisted) {
            const p = await patch(u, w, { style: unlisted });
            if (p.status !== 422) throw new Error(`${kind} ${ticket} ${unlisted}: ${p.status}`);
          }
        }
      }
      expect(listedTotal).toBeGreaterThan(100);
    }, 240_000);
  });
});
