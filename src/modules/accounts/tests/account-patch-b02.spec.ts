import { IdGenerator } from "../../../common/ports/ids.port";
import { bearer, signIn, SignInApp, signInApp, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { AccountErasureService, FRESH_SIGN_IN_MS } from "../account-erasure.service";
import { newCreator, uniqueHandle } from "./sides.kit";

/* Patch B02: AA1 (the account lock against erase), AA2 (nothing left in the database), AA3 (NUL is 422), X7, X10, X11, X12. */

describe("patch B02 on the account modules", () => {
  let t: SignInApp;
  let erasure: AccountErasureService;
  beforeAll(async () => {
    t = await signInApp();
    erasure = t.app.get(AccountErasureService);
  });
  afterAll(() => t.close());
  const actor = { type: "account" as const, id: null, requestId: "test-b02" };
  const ids = () => t.app.get(IdGenerator);

  async function person(tag: string) {
    const s = await signIn(t, uniqueEmail(tag));
    return s;
  }
  async function business(tag: string) {
    const s = await person(tag);
    const res = await t.http().post("/v1/me/business").set(bearer(s.accessToken)).send({ business: `${tag} Co`, name: `${tag} Owner` });
    expect(res.status).toBe(200);
    return s;
  }

  /** Nothing is left on the erased account, and what it held is free. */
  async function expectNothingSurvives(accountId: string, handle: string | null) {
    const a = await t.db.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(a).toMatchObject({ name: null, bio: null, handle: null, contact: null, phone: null, business: null, sides: ["person"] });
    expect(a.erasedAt).not.toBeNull();
    expect(await t.db.follow.count({ where: { accountId } })).toBe(0);
    expect(await t.db.dateRow.count({ where: { accountId, name: { not: null } } })).toBe(0);
    const c = await t.db.creator.findUnique({ where: { accountId } });
    if (c) expect(c).toMatchObject({ name: null, line: null, href: null, img: null });
    for (const b of await t.db.business.findMany({ where: { accountId } })) expect(b).toMatchObject({ business: null, name: null, ownerName: null, brand: null });
    if (handle) {
      const taker = await signIn(t, uniqueEmail("taker"));
      expect((await t.http().patch("/v1/me").set(bearer(taker.accessToken)).send({ handle })).status).toBe(200);
    }
  }

  async function race(label: string, setup: () => Promise<{ accountId: string; handle: string | null; write: () => Promise<{ status: number }> }>) {
    for (let i = 0; i < 10; i++) {
      const c = await setup();
      const [w] = await Promise.all([c.write(), erasure.erase(c.accountId, { actor: { ...actor, id: c.accountId }, reason: null })]);
      expect({ label, i, ok: [200, 401, 404].includes(w.status) }).toEqual({ label, i, ok: true });
      await expectNothingSurvives(c.accountId, c.handle);
    }
  }

  describe("AA1 every write goes through the account lock: erase races it 10 times each", () => {
    it("AA1 PATCH /v1/me (name, bio, handle)", () =>
      race("patch me", async () => {
        const s = await person("aa1p");
        const handle = uniqueHandle("aa1");
        return { accountId: s.accountId, handle, write: () => t.http().patch("/v1/me").set(bearer(s.accessToken)).send({ name: "Race Name", bio: "Race bio", handle }) };
      }));
    it("AA1 handle change", () =>
      race("handle change", async () => {
        const c = await newCreator(t, "aa1h");
        const handle = uniqueHandle("aa1n");
        return { accountId: c.accountId, handle, write: () => t.http().patch("/v1/me").set(bearer(c.accessToken)).send({ handle }) };
      }));
    it("AA1 side on (creator and business)", async () => {
      await race("creator on", async () => {
        const s = await person("aa1c");
        const handle = uniqueHandle("aa1c");
        return { accountId: s.accountId, handle, write: () => t.http().post("/v1/me/creator").set(bearer(s.accessToken)).send({ handle, name: "Race Creator", bio: "x" }) };
      });
      await race("business on", async () => {
        const s = await person("aa1b");
        return { accountId: s.accountId, handle: null, write: () => t.http().post("/v1/me/business").set(bearer(s.accessToken)).send({ business: "Race Biz", name: "Race Owner" }) };
      });
    });
    it("AA1 side off (creator and business)", async () => {
      await race("creator off", async () => {
        const c = await newCreator(t, "aa1x");
        return { accountId: c.accountId, handle: c.handle, write: () => t.http().delete("/v1/me/creator").set(bearer(c.accessToken)) };
      });
      await race("business off", async () => {
        const s = await business("aa1y");
        return { accountId: s.accountId, handle: null, write: () => t.http().delete("/v1/me/business").set(bearer(s.accessToken)) };
      });
    });
    it("AA1 follow (the follower erased)", async () => {
      const target = await newCreator(t, "aa1t");
      await race("follow", async () => {
        const s = await person("aa1f");
        return { accountId: s.accountId, handle: null, write: () => t.http().put(`/v1/creators/${target.handle}/follow`).set(bearer(s.accessToken)) };
      });
    });
    it("AA1 follow (the creator erased: nobody keeps a follow on its handle)", async () => {
      for (let i = 0; i < 10; i++) {
        const target = await newCreator(t, "aa1u");
        const fan = await person("aa1g");
        const [w] = await Promise.all([
          t.http().put(`/v1/creators/${target.handle}/follow`).set(bearer(fan.accessToken)),
          erasure.erase(target.accountId, { actor: { ...actor, id: target.accountId }, reason: null }),
        ]);
        expect([200, 404]).toContain(w.status);
        expect(await t.db.follow.count({ where: { handle: target.handle } })).toBe(0);
      }
    });
    it("AA1 brand patch", () =>
      race("brand", async () => {
        const s = await business("aa1r");
        return { accountId: s.accountId, handle: null, write: () => t.http().patch("/v1/business").set(bearer(s.accessToken)).send({ brand: { line: "Race line", booking: "https://example.com/book" } }) };
      }));
  });

  it("AA2 erase leaves no trace of the person: schema-map walked, the whole database searched", async () => {
    const email = uniqueEmail("aa2").toLowerCase();
    const s = await signIn(t, email);
    const tag = Math.random().toString(36).slice(2, 10);
    const handle = uniqueHandle("aa2");
    const name = `Zeta Quillson ${tag}`;
    const bio = `Bio words ${tag} for the page`;
    const phoneDigits = `80${Math.floor(10000000 + Math.random() * 89999999)}`;
    const bizName = `Quill Studio ${tag}`;
    const brandLine = `Line of ${tag}`;
    const bearerTok = bearer(s.accessToken);
    expect((await t.http().post("/v1/me/creator").set(bearerTok).send({ handle, name, bio, contact: `0${phoneDigits}` })).status).toBe(200);
    expect((await t.http().post("/v1/me/business").set(bearerTok).send({ business: bizName, name })).status).toBe(200);
    expect((await t.http().patch("/v1/business").set(bearerTok).send({ brand: { business: bizName, line: brandLine, booking: `https://example.com/${handle}` } })).status).toBe(200);
    expect((await t.http().patch("/v1/me").set(bearerTok).send({ dates: [{ name: `Mum ${tag}`, who: `Aunt ${tag}`, what: `Cake ${tag}`, date: "2027-03-14" }] })).status).toBe(200);
    await t.db.creator.update({ where: { accountId: s.accountId }, data: { line: `Creator line ${tag}`, person: `Person ${tag}` } });
    await t.db.person.create({ data: { id: ids().id(), businessId: (await t.db.business.findFirstOrThrow({ where: { accountId: s.accountId } })).id, name: `Client ${tag}`, phone: `0${phoneDigits}` } });

    const needles = [email, name, handle, phoneDigits, bio, bizName, brandLine, `Mum ${tag}`, `Aunt ${tag}`, `Cake ${tag}`, `Client ${tag}`, `Creator line ${tag}`, `Person ${tag}`];
    const hits = async () => {
      const cols = await t.db.$queryRaw<{ t: string; c: string }[]>`
        SELECT table_name AS t, column_name AS c FROM information_schema.columns
        WHERE table_schema = 'public' AND (data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY'))`;
      const found: string[] = [];
      for (const { t: table, c } of cols) {
        if (table.startsWith("_") || table === "audit_entry") continue;
        for (const n of needles) {
          const rows = await t.db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}" WHERE "${c}"::text ILIKE $1`, `%${n}%`);
          if (Number(rows[0].n) > 0) found.push(`${table}.${c} holds ${n}`);
        }
      }
      return found;
    };
    expect((await hits()).length).toBeGreaterThan(5);
    await erasure.erase(s.accountId, { actor: { ...actor, id: s.accountId }, reason: null });
    expect(await hits()).toEqual([]);
    // The audit row holds ids and field names, never the values.
    const audits = await t.db.auditEntry.findMany({ where: { subjectId: s.accountId } });
    expect(JSON.stringify(audits)).not.toContain(email);
  });

  describe("AA3 a NUL byte is 422 on every text field here, never a 500", () => {
    const NUL = "ab\u0000cd";
    const cases: [string, string, (tok: string) => object | Promise<object>, string][] = [
      ["PATCH /v1/me name", "patch /v1/me", () => ({ name: NUL }), "name"],
      ["PATCH /v1/me bio", "patch /v1/me", () => ({ bio: NUL }), "bio"],
      ["PATCH /v1/me contact", "patch /v1/me", () => ({ contact: NUL }), "contact"],
      ["PATCH /v1/me handle", "patch /v1/me", () => ({ handle: NUL }), "handle"],
      ["PATCH /v1/me dates.name", "patch /v1/me", () => ({ dates: [{ name: NUL, date: "2027-01-01" }] }), "dates"],
      ["PATCH /v1/me dates.what", "patch /v1/me", () => ({ dates: [{ name: "a", what: NUL, date: "2027-01-01" }] }), "dates"],
      ["POST /v1/me/creator name", "post /v1/me/creator", () => ({ handle: uniqueHandle("nu"), name: NUL }), "name"],
      ["POST /v1/me/creator bio", "post /v1/me/creator", () => ({ handle: uniqueHandle("nu"), bio: NUL }), "bio"],
      ["POST /v1/me/creator handle", "post /v1/me/creator", () => ({ handle: NUL }), "handle"],
      ["POST /v1/me/business business", "post /v1/me/business", () => ({ business: NUL }), "business"],
      ["POST /v1/me/business name", "post /v1/me/business", () => ({ business: "Ok Co", name: NUL }), "name"],
      ["POST /v1/me/business pro.business", "post /v1/me/business", () => ({ pro: { business: NUL } }), "pro"],
      ["PATCH /v1/business brand.business", "patch /v1/business", () => ({ brand: { business: NUL } }), "brand"],
      ["PATCH /v1/business brand.line", "patch /v1/business", () => ({ brand: { line: NUL } }), "brand"],
      ["PATCH /v1/business brand.booking", "patch /v1/business", () => ({ brand: { booking: `https://a.example/${NUL}` } }), "brand"],
    ];
    it.each(cases)("AA3 %s", async (_label, route, body, field) => {
      const s = await business("aa3");
      const [method, path] = route.split(" ");
      const res = await (t.http() as unknown as Record<string, (p: string) => import("supertest").Test>)[method](path).set(bearer(s.accessToken)).send(await body(s.accessToken));
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body.error.fields)).toContain(field);
    });
    it("AA3 a NUL byte in a path (handle check, public page, follow) is 422", async () => {
      const s = await person("aa3p");
      expect((await t.http().get("/v1/handles/ab%00cd").set(bearer(s.accessToken))).status).toBe(422);
      expect((await t.http().get("/v1/creators/ab%00cd")).status).toBe(422);
      expect((await t.http().put("/v1/creators/ab%00cd/follow").set(bearer(s.accessToken))).status).toBe(422);
    });
  });

  describe("X7 POST /v1/me/erase", () => {
    it("X7 erases the signed-in account, answers 204 and ends every session", async () => {
      const s = await newCreator(t, "x7a");
      const second = await signIn(t, (await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } })).contact as string);
      const res = await t.http().post("/v1/me/erase").set(bearer(s.accessToken)).send({ confirm: "erase" });
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect((await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } })).erasedAt).not.toBeNull();
      expect((await t.http().get("/v1/me").set(bearer(s.accessToken))).status).toBe(401);
      expect((await t.http().get("/v1/me").set(bearer(second.accessToken))).status).toBe(401);
      expect(await t.db.session.count({ where: { accountId: s.accountId, revokedAt: null } })).toBe(0);
    });
    it("X7 a session family older than 10 minutes gets 403 fresh_sign_in_needed and nothing is erased", async () => {
      const s = await person("x7b");
      t.clock.advance(FRESH_SIGN_IN_MS + 1000);
      const res = await t.http().post("/v1/me/erase").set(bearer(s.accessToken)).send({ confirm: "erase" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("fresh_sign_in_needed");
      expect((await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } })).erasedAt).toBeNull();
    });
    it("X7 the body must be {confirm: 'erase'}, else 422; 401 without a token", async () => {
      const s = await person("x7c");
      for (const body of [{}, { confirm: "yes" }, { confirm: "ERASE" }, { confirm: true }]) {
        expect((await t.http().post("/v1/me/erase").set(bearer(s.accessToken)).send(body)).status).toBe(422);
      }
      expect((await t.http().post("/v1/me/erase").send({ confirm: "erase" })).status).toBe(401);
      expect((await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } })).erasedAt).toBeNull();
    });
  });

  it("X10 erase makes the account's wishes' links gone", async () => {
    const s = await person("x10");
    const wishId = ids().id();
    await t.db.wish.create({ data: { id: wishId, accountId: s.accountId, status: "live", kind: "birthday", occasion: "birthday", styleSlug: "x", timeZone: "Africa/Lagos" } });
    await t.db.wishLink.create({ data: { id: ids().id(), slug: `x10${Math.random().toString(36).slice(2, 12)}`, wishId, active: true } });
    await erasure.erase(s.accountId, { actor: { ...actor, id: s.accountId }, reason: null });
    expect(await t.db.wishLink.count({ where: { wishId, active: true } })).toBe(0);
    expect(await t.db.wishLink.count({ where: { wishId } })).toBe(1);
  });

  it("X11 any signed-in person can check a handle; 401 without a token", async () => {
    const s = await person("x11");
    const free = uniqueHandle("fr");
    expect((await t.http().get(`/v1/handles/${free}`).set(bearer(s.accessToken))).body).toEqual({ free: true });
    const c = await newCreator(t, "x11c");
    expect((await t.http().get(`/v1/handles/${c.handle}`).set(bearer(s.accessToken))).body).toMatchObject({ free: false });
    expect((await t.http().get(`/v1/handles/${free}`)).status).toBe(401);
  });

  it("X12 Business carries no kind: the row has no such column and a kind in the request is refused", async () => {
    const s = await person("x12");
    const res = await t.http().post("/v1/me/business").set(bearer(s.accessToken)).send({ business: "No Kind Co", kind: "studio" });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields)).toContain("kind");
    const ok = await business("x12b");
    const row = await t.db.business.findFirstOrThrow({ where: { accountId: ok.accountId } });
    expect(Object.keys(row)).not.toContain("kind");
  });
});
