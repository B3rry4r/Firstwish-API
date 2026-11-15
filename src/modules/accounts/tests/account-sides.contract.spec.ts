import { bearer, signIn, SignInApp, signInApp, staffToken, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { newCreator, uniqueHandle } from "./sides.kit";

describe("account sides E-5, E-8 to E-11 and the handle (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const me = (token: string) => t.http().get("/v1/me").set(bearer(token));
  const patchMe = (token: string, body: object) => t.http().patch("/v1/me").set(bearer(token)).send(body);
  const creatorOn = (token: string, body: object) => t.http().post("/v1/me/creator").set(bearer(token)).send(body);
  const businessOn = (token: string, body: object) => t.http().post("/v1/me/business").set(bearer(token)).send(body);
  const check = (token: string, h: string) => t.http().get(`/v1/handles/${encodeURIComponent(h)}`).set(bearer(token));

  describe("E-11 creator on, E-10 creator off", () => {
    it("turns the side on with a normalised handle; /v1/me shows sides as an array", async () => {
      const s = await signIn(t, uniqueEmail("con"));
      const handle = uniqueHandle("ada");
      const res = await creatorOn(s.accessToken, { handle: `  @${handle.toUpperCase()}`, name: " Ada ", bio: " Weddings ", creator: true, here: "styles", space: "creator" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ handle, sides: ["person", "creator"], creator: true, bio: "Weddings", space: "creator", lastSide: "creator" });
      expect((await me(s.accessToken)).body.sides).toEqual(["person", "creator"]);
      const row = await t.db.creator.findUniqueOrThrow({ where: { accountId: s.accountId } });
      expect(row.name).toBe("Ada");
    });

    it("on twice in a row and twice at once: one creator row", async () => {
      const s = await signIn(t, uniqueEmail("ctw"));
      const handle = uniqueHandle("tw");
      const both = await Promise.all([creatorOn(s.accessToken, { handle }), creatorOn(s.accessToken, { handle })]);
      expect(both.map((r) => r.status)).toEqual([200, 200]);
      expect((await creatorOn(s.accessToken, { handle })).status).toBe(200);
      expect(await t.db.creator.count({ where: { accountId: s.accountId } })).toBe(1);
      expect((await me(s.accessToken)).body.sides).toEqual(["person", "creator"]);
    });

    it("off keeps the row and handle; on again reuses the row", async () => {
      const c = await newCreator(t, "off");
      const before = await t.db.creator.findUniqueOrThrow({ where: { accountId: c.accountId } });
      const off = await t.http().delete("/v1/me/creator").set(bearer(c.accessToken));
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({ sides: ["person"], creator: false, handle: c.handle, space: "me", lastSide: "person" });
      expect((await t.http().delete("/v1/me/creator").set(bearer(c.accessToken))).status).toBe(200);
      expect(await t.db.creator.findUnique({ where: { accountId: c.accountId } })).toMatchObject({ id: before.id });
      expect((await creatorOn(c.accessToken, { handle: c.handle })).body.sides).toEqual(["person", "creator"]);
      expect(await t.db.creator.count({ where: { accountId: c.accountId } })).toBe(1);
    });

    it("422 with the reason in fields for a bad, short or reserved handle, and for a missing one", async () => {
      const s = await signIn(t, uniqueEmail("cbad"));
      for (const [h, why] of [["ab", "Three or more characters."], ["a..b", "No two dots or underscores together."], ["_abc", "Start and end with a letter or a number."], ["Admin", "@admin is taken."], ["a b c", "Only letters, numbers, dots and underscores."]]) {
        const res = await creatorOn(s.accessToken, { handle: h });
        expect(res.status).toBe(422);
        expect(res.body.error.fields.handle).toBe(why);
      }
      expect((await creatorOn(s.accessToken, {})).status).toBe(422);
      expect((await creatorOn(s.accessToken, { handle: uniqueHandle(), creator: false })).status).toBe(422);
      expect((await creatorOn(s.accessToken, { handle: uniqueHandle(), sides: ["creator"] })).body.error.fields.sides).toBe("Not a known field.");
      expect((await me(s.accessToken)).body.sides).toEqual(["person"]);
    });
  });

  describe("the handle: one namespace on Account (Q7)", () => {
    it("a handle taken in any case is 409, through PATCH /v1/me and POST /v1/me/creator", async () => {
      const a = await newCreator(t, "own");
      const b = await signIn(t, uniqueEmail("thief"));
      const viaCreator = await creatorOn(b.accessToken, { handle: a.handle.toUpperCase() });
      expect(viaCreator.status).toBe(409);
      expect(viaCreator.body.error.code).toBe("handle_taken");
      expect((await patchMe(b.accessToken, { handle: `@${a.handle}` })).status).toBe(409);
      expect((await me(b.accessToken)).body).toMatchObject({ handle: null, sides: ["person"] });
    });

    it("two accounts taking one handle at the same moment: one wins, the other is 409", async () => {
      const handle = uniqueHandle("race");
      const people = await Promise.all([signIn(t, uniqueEmail("r1")), signIn(t, uniqueEmail("r2")), signIn(t, uniqueEmail("r3"))]);
      const res = await Promise.all(people.map((p, i) => (i === 0 ? patchMe(p.accessToken, { handle }) : creatorOn(p.accessToken, { handle: handle.toUpperCase() }))));
      expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect(await t.db.account.count({ where: { handle } })).toBe(1);
    });

    it("changing the handle moves the follows that point at it", async () => {
      const c = await newCreator(t, "mv");
      const f = await signIn(t, uniqueEmail("fan"));
      expect((await t.http().put(`/v1/creators/${c.handle}/follow`).set(bearer(f.accessToken))).status).toBe(200);
      const next = uniqueHandle("mv2");
      expect((await patchMe(c.accessToken, { handle: next })).body.handle).toBe(next);
      expect(await t.db.follow.findMany({ where: { accountId: f.accountId }, select: { handle: true } })).toEqual([{ handle: next }]);
    });

    it("E-5: free, taken, the caller's own, and rule problems; normalised", async () => {
      const a = await newCreator(t, "chk");
      const b = await newCreator(t, "chk");
      expect((await check(a.accessToken, `@${a.handle.toUpperCase()}`)).body).toEqual({ free: true });
      expect((await check(a.accessToken, b.handle.toUpperCase())).body).toEqual({ free: false, problem: `@${b.handle} is taken.` });
      expect((await check(a.accessToken, uniqueHandle("free"))).body).toEqual({ free: true });
      expect((await check(a.accessToken, "support")).body).toEqual({ free: false, problem: "@support is taken." });
      expect((await check(a.accessToken, "x")).body).toEqual({ free: false, problem: "Three or more characters." });
    });
  });

  describe("E-9 business on, E-8 business off", () => {
    it("on makes the business row once (twice at once too); off keeps it", async () => {
      const s = await signIn(t, uniqueEmail("biz"));
      const body = { business: "  Lagos Frames ", name: "Ada Obi", here: "business", space: "business", pro: { plan: "pack", business: "Lagos Frames" } };
      const both = await Promise.all([businessOn(s.accessToken, body), businessOn(s.accessToken, body)]);
      expect(both.map((r) => r.status)).toEqual([200, 200]);
      expect(both[0].body).toMatchObject({ business: "Lagos Frames", sides: ["person", "business"], space: "business" });
      const rows = await t.db.business.findMany({ where: { accountId: s.accountId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: "Lagos Frames", business: "Lagos Frames", ownerName: "Ada Obi", plan: null });
      const off = await t.http().delete("/v1/me/business").set(bearer(s.accessToken)).send({ side: "business" });
      expect(off.status).toBe(200);
      expect(off.body.sides).toEqual(["person"]);
      expect(await t.db.business.count({ where: { accountId: s.accountId } })).toBe(1);
      const again = await businessOn(s.accessToken, {});
      expect(again.body).toMatchObject({ business: "Lagos Frames", sides: ["person", "business"] });
      expect(await t.db.business.count({ where: { accountId: s.accountId } })).toBe(1);
    });

    it("both sides at once: /v1/me lists person, then the sides in the order they were turned on", async () => {
      const c = await newCreator(t, "both");
      expect((await businessOn(c.accessToken, { business: "Both Co" })).body.sides).toEqual(["person", "creator", "business"]);
    });

    it("422 without a business name, for a long one, a bad plan and a bad phone", async () => {
      const s = await signIn(t, uniqueEmail("bbad"));
      expect((await businessOn(s.accessToken, {})).body.error.fields.business).toBeDefined();
      expect((await businessOn(s.accessToken, { business: "x".repeat(49) })).status).toBe(422);
      expect((await businessOn(s.accessToken, { business: "Co", pro: { plan: "free" } })).body.error.fields["pro.plan"]).toBe("Must be pack.");
      expect((await businessOn(s.accessToken, { business: "Co", contact: "nope" })).body.error.fields.contact).toBeDefined();
      expect((await businessOn(s.accessToken, { business: "Co", side: "business" })).status).toBe(422);
      expect((await t.http().delete("/v1/me/business").set(bearer(s.accessToken)).send({ side: "creator" })).status).toBe(422);
      expect((await me(s.accessToken)).body.sides).toEqual(["person"]);
      expect(await t.db.business.count({ where: { accountId: s.accountId } })).toBe(0);
    });

    it("a phone given as contact is stored E.164", async () => {
      const s = await signIn(t, uniqueEmail("bph"));
      expect((await businessOn(s.accessToken, { business: "Phone Co", contact: "0803 147 2093" })).body.phone).toBe("+2348031472093");
    });
  });

  it("401 without a token, 403 for staff, 403 on E-5 without the creator side", async () => {
    const routes: [string, string][] = [["post", "/v1/me/creator"], ["delete", "/v1/me/creator"], ["post", "/v1/me/business"], ["delete", "/v1/me/business"], ["get", "/v1/handles/abcd"]];
    const staff = await staffToken(t);
    for (const [m, path] of routes) {
      const call = (t.http() as unknown as Record<string, (p: string) => import("supertest").Test>)[m](path);
      expect((await call).status).toBe(401);
      const asStaff = (t.http() as unknown as Record<string, (p: string) => import("supertest").Test>)[m](path).set(bearer(staff));
      expect((await asStaff).status).toBe(403);
    }
    const person = await signIn(t, uniqueEmail("nocr"));
    expect((await check(person.accessToken, "abcd")).status).toBe(403);
  });
});
