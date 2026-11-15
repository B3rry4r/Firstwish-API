import { bearer, refreshCookieOf, signIn, SignInApp, signInApp, staffToken, uniqueEmail } from "./sign-in.kit";

describe("sessions E-159..E-162 (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const refresh = (cookie?: string) => {
    const r = t.http().post("/v1/auth/refresh");
    return cookie ? r.set("Cookie", `other=1; fw_refresh=${cookie}`) : r;
  };
  const me = (token: string) => t.http().get("/v1/me").set(bearer(token));

  describe("E-159 refresh", () => {
    it("rotates: a new access token and cookie; the old cookie is dead after use", async () => {
      const s = await signIn(t, uniqueEmail("rot"));
      t.clock.advance(60_000);
      const res = await refresh(s.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ accountId: s.accountId, familyId: s.body.familyId, isNew: false, accessToken: expect.any(String) });
      expect(res.body).not.toHaveProperty("refreshTokenHash");
      const next = refreshCookieOf(res)!;
      expect(next).toBeTruthy();
      expect(next).not.toBe(s.cookie);
      expect((await me(res.body.accessToken as string)).status).toBe(200);
      const old = await t.db.session.findUniqueOrThrow({ where: { id: s.body.id as string } });
      expect(old.rotatedAt).not.toBeNull();
    });

    it("a dead refresh token used again ends the whole session family (theft)", async () => {
      const email = uniqueEmail("theft");
      const s = await signIn(t, email);
      const other = await signIn(t, email);
      const r1 = await refresh(s.cookie);
      expect(r1.status).toBe(200);
      const stolen = await refresh(s.cookie);
      expect(stolen.status).toBe(401);
      expect(stolen.body.error.code).toBe("unauthorized");
      expect((await refresh(refreshCookieOf(r1)!)).status).toBe(401);
      expect((await me(r1.body.accessToken as string)).status).toBe(401);
      const family = await t.db.session.findMany({ where: { familyId: s.body.familyId as string } });
      expect(family.every((f) => f.revokedAt !== null)).toBe(true);
      expect((await me(other.accessToken)).status).toBe(200);
    });

    it("401 without a cookie, with a made-up cookie, or after 30 days", async () => {
      expect((await refresh()).status).toBe(401);
      expect((await refresh("not-a-cookie")).status).toBe(401);
      const s = await signIn(t, uniqueEmail("old"));
      const forged = `${s.cookie.split(".")[0]}.${"A".repeat(43)}`;
      expect((await refresh(forged)).status).toBe(401);
      t.clock.advance(30 * 24 * 3600 * 1000 + 1000);
      const res = await refresh(s.cookie);
      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("the access token lasts 15 minutes", async () => {
      const s = await signIn(t, uniqueEmail("exp"));
      t.clock.advance(15 * 60 * 1000 - 1000);
      expect((await me(s.accessToken)).status).toBe(200);
      t.clock.advance(2000);
      expect((await me(s.accessToken)).status).toBe(401);
    });

    it("refuses a body field", async () => {
      expect((await t.http().post("/v1/auth/refresh").send({ token: "x" })).status).toBe(422);
    });
  });

  describe("E-160 sign out, E-161 sign out everywhere", () => {
    it("sign out ends this session only and clears the cookie", async () => {
      const email = uniqueEmail("out");
      const a = await signIn(t, email);
      const b = await signIn(t, email);
      const res = await t.http().post("/v1/auth/sign-out").set(bearer(a.accessToken));
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect((res.headers["set-cookie"] as unknown as string[])[0]).toContain("fw_refresh=; Max-Age=0");
      expect((await me(a.accessToken)).status).toBe(401);
      expect((await refresh(a.cookie)).status).toBe(401);
      expect((await me(b.accessToken)).status).toBe(200);
      expect((await refresh(b.cookie)).status).toBe(200);
    });

    it("sign out everywhere ends every session of the account", async () => {
      const email = uniqueEmail("all");
      const a = await signIn(t, email);
      const b = await signIn(t, email);
      const res = await t.http().post("/v1/auth/sign-out-everywhere").set(bearer(a.accessToken));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      for (const s of [a, b]) {
        expect((await me(s.accessToken)).status).toBe(401);
        expect((await refresh(s.cookie)).status).toBe(401);
      }
      expect(await t.db.account.count({ where: { contact: email } })).toBe(1);
    });

    it("401 without a token, 403 for staff, 422 for a body field", async () => {
      for (const path of ["/v1/auth/sign-out", "/v1/auth/sign-out-everywhere"]) {
        const res = await t.http().post(path);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("unauthorized");
      }
      const staff = await staffToken(t);
      expect((await t.http().post("/v1/auth/sign-out").set(bearer(staff))).status).toBe(403);
      const s = await signIn(t, uniqueEmail("body"));
      expect((await t.http().post("/v1/auth/sign-out-everywhere").set(bearer(s.accessToken)).send({ all: true })).status).toBe(422);
    });
  });

  describe("E-162 GET /v1/sessions", () => {
    it("lists live sessions, marks this one, pages by cursor, never shows the token hash", async () => {
      const email = uniqueEmail("list");
      const a = await signIn(t, email);
      t.clock.advance(1000);
      const b = await signIn(t, email);
      t.clock.advance(1000);
      const c = await signIn(t, email);
      await t.http().post("/v1/auth/sign-out").set(bearer(a.accessToken));
      const res = await t.http().get("/v1/sessions").set(bearer(b.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.nextCursor).toBeNull();
      expect((res.body.items as { id: string }[]).map((i) => i.id)).toEqual([c.body.id, b.body.id]);
      expect(res.body.items[1].current).toBe(true);
      expect(res.body.items[0].current).toBe(false);
      expect(res.body.items[0]).not.toHaveProperty("refreshTokenHash");
      const p1 = await t.http().get("/v1/sessions?limit=1").set(bearer(b.accessToken));
      expect(p1.body.items).toHaveLength(1);
      const p2 = await t.http().get(`/v1/sessions?limit=1&cursor=${p1.body.nextCursor as string}`).set(bearer(b.accessToken));
      expect(p2.body.items[0].id).toBe(b.body.id);
      expect(p2.body.nextCursor).toBeNull();
    });

    it("401 without a token, 403 for staff, 422 for a bad limit or cursor", async () => {
      expect((await t.http().get("/v1/sessions")).status).toBe(401);
      expect((await t.http().get("/v1/sessions").set(bearer(await staffToken(t)))).status).toBe(403);
      const s = await signIn(t, uniqueEmail("q"));
      expect((await t.http().get("/v1/sessions?limit=0").set(bearer(s.accessToken))).status).toBe(422);
      const bad = await t.http().get("/v1/sessions?cursor=zzz").set(bearer(s.accessToken));
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields.cursor).toBeDefined();
    });
  });
});
