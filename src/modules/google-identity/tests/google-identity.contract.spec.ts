import { bearer, refreshCookieOf, signIn, SignInApp, signInApp, staffToken, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { GOOGLE_ISSUERS, StandinGoogle } from "../google.adapters";
import { GoogleIdentityPort } from "../google.port";
import { STANDIN_GOOGLE_CLIENT_ID } from "../google-identity.service";

describe("Google sign-in E-53..E-56 (contract)", () => {
  let t: SignInApp;
  let google: StandinGoogle;
  let sub = 0;
  beforeAll(async () => {
    t = await signInApp();
    google = t.app.get<GoogleIdentityPort, StandinGoogle>(GoogleIdentityPort);
  });
  afterAll(() => t.close());

  const claims = (email: string, over: Record<string, unknown> = {}) => ({
    iss: GOOGLE_ISSUERS[0],
    aud: STANDIN_GOOGLE_CLIENT_ID,
    sub: `g-${process.pid}-${++sub}`,
    email,
    email_verified: true,
    exp: Math.floor(t.clock.now().getTime() / 1000) + 600,
    ...over,
  });
  const start = async (returnTo = "/app/wishes") => {
    const res = await t.http().post("/v1/auth/google/start").send({ returnTo });
    expect(res.status).toBe(200);
    return new URL(res.body.url as string).searchParams.get("state")!;
  };
  const callback = (code: string, state: string) => t.http().get("/v1/auth/google/callback").query({ code, state });

  describe("E-54 start", () => {
    it("answers Google's page with state and a PKCE challenge", async () => {
      const res = await t.http().post("/v1/auth/google/start").send({});
      expect(res.status).toBe(200);
      const url = new URL(res.body.url as string);
      expect(url.searchParams.get("state")).toBeTruthy();
      expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
      expect(url.searchParams.get("client_id")).toBe(STANDIN_GOOGLE_CLIENT_ID);
    });

    it("422 for a return path off the site or an unknown field", async () => {
      for (const body of [{ returnTo: "//evil.example" }, { returnTo: "https://evil.example/x" }, { returnTo: "/\\evil" }, { other: 1 }]) {
        const res = await t.http().post("/v1/auth/google/start").send(body);
        expect(res.status).toBe(422);
      }
    });
  });

  describe("E-53 callback", () => {
    it("a new Google email makes the account, records the identity and signs in", async () => {
      const email = uniqueEmail("g");
      const c = claims(email.toUpperCase());
      const state = await start();
      const res = await callback(google.issueCode(c), state);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ isNew: true, contact: email, returnTo: "/app/wishes", accessToken: expect.any(String) });
      expect(refreshCookieOf(res)).toBeTruthy();
      expect(google.exchanged[google.exchanged.length - 1].codeVerifier).toMatch(/^[\w-]{40,}$/);
      const ext = await t.db.externalIdentity.findMany({ where: { subject: c.sub } });
      expect(ext).toHaveLength(1);
      expect(ext[0]).toMatchObject({ accountId: res.body.accountId, provider: "google", email, emailVerified: true });
      const me = await t.http().get("/v1/me").set(bearer(res.body.accessToken as string));
      expect(me.body.email).toBe(email);
    });

    it("an email that already has an account signs into THAT account (one account per email)", async () => {
      const email = uniqueEmail("both");
      const coded = await signIn(t, email);
      const c = claims(email);
      const res = await callback(google.issueCode(c), await start());
      expect(res.status).toBe(200);
      expect(res.body.accountId).toBe(coded.accountId);
      expect(res.body.isNew).toBe(false);
      expect(await t.db.account.count({ where: { contact: email } })).toBe(1);
      expect(await t.db.externalIdentity.count({ where: { subject: c.sub, accountId: coded.accountId } })).toBe(1);
      const again = await callback(google.issueCode(c), await start());
      expect(again.body.accountId).toBe(coded.accountId);
      expect(await t.db.externalIdentity.count({ where: { subject: c.sub } })).toBe(1);
    });

    it("refuses an unverified email, a wrong audience, an expired token, a bad signature", async () => {
      const cases = [
        claims(uniqueEmail("u"), { email_verified: false }),
        claims(uniqueEmail("a"), { aud: "someone-else" }),
        claims(uniqueEmail("e"), { exp: Math.floor(t.clock.now().getTime() / 1000) - 1 }),
        claims(uniqueEmail("i"), { iss: "https://issuer.example" }),
      ];
      for (const c of cases) {
        const res = await callback(google.issueCode(c), await start());
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("google_refused");
        expect(await t.db.account.count({ where: { contact: c.email } })).toBe(0);
      }
      const forged = await callback(google.issueCode(claims(uniqueEmail("f")), "another-key"), await start());
      expect(forged.status).toBe(400);
    });

    it("a state is used once; an unknown state or code refuses", async () => {
      const state = await start();
      expect((await callback(google.issueCode(claims(uniqueEmail("s"))), state)).status).toBe(200);
      expect((await callback(google.issueCode(claims(uniqueEmail("s"))), state)).status).toBe(400);
      expect((await callback(google.issueCode(claims(uniqueEmail("s"))), "made-up")).status).toBe(400);
      expect((await callback("no-such-code", await start())).status).toBe(400);
      expect((await t.http().get("/v1/auth/google/callback").query({ code: "x" })).status).toBe(422);
    });
  });

  describe("E-56 link, E-55 unlink", () => {
    it("links a Google account to the signed-in account, then unlinks it", async () => {
      const s = await signIn(t, uniqueEmail("link"));
      const c = claims(uniqueEmail("gmail"));
      const res = await t.http().post("/v1/me/google").set(bearer(s.accessToken)).send({ code: google.issueCode(c), state: await start() });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ accountId: s.accountId, provider: "google", subject: c.sub, emailVerified: true });
      const signedIn = await callback(google.issueCode(c), await start());
      expect(signedIn.body.accountId).toBe(s.accountId);

      const other = await signIn(t, uniqueEmail("other"));
      const clash = await t.http().post("/v1/me/google").set(bearer(other.accessToken)).send({ code: google.issueCode(c), state: await start() });
      expect(clash.status).toBe(409);

      expect((await t.http().delete("/v1/me/google").set(bearer(other.accessToken)).send({ id: res.body.id as string })).status).toBe(404);
      const del = await t.http().delete("/v1/me/google").set(bearer(s.accessToken)).send({ id: res.body.id as string });
      expect(del.status).toBe(200);
      expect(del.body).toEqual({});
      expect((await t.http().delete("/v1/me/google").set(bearer(s.accessToken)).send({ id: res.body.id as string })).status).toBe(404);
    });

    it("401 without a token, 403 for staff, 422 for a bad body", async () => {
      expect((await t.http().post("/v1/me/google").send({ code: "x", state: "y" })).status).toBe(401);
      expect((await t.http().delete("/v1/me/google").send({ id: "x" })).status).toBe(401);
      const staff = await staffToken(t);
      expect((await t.http().post("/v1/me/google").set(bearer(staff)).send({ code: "x", state: "y" })).status).toBe(403);
      const s = await signIn(t, uniqueEmail("v"));
      expect((await t.http().post("/v1/me/google").set(bearer(s.accessToken)).send({ code: "x" })).status).toBe(422);
      expect((await t.http().delete("/v1/me/google").set(bearer(s.accessToken)).send({})).status).toBe(422);
    });
  });
});
