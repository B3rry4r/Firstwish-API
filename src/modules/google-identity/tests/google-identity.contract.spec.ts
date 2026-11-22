import { bearer, refreshCookieOf, signIn, SignInApp, signInApp, staffToken, subOf, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { StandinGoogle } from "../../../common/ports/adapters/standins";
import { GOOGLE_ISSUERS, GoogleIdentityPort } from "../../../common/ports/google.port";
import { STANDIN_GOOGLE_CLIENT_ID } from "../google-identity.service";
import { RUN } from "../../../../test/kit/unique";

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
    sub: `g-${RUN}-${++sub}`,
    email,
    email_verified: true,
    exp: Math.floor(t.clock.now().getTime() / 1000) + 600,
    ...over,
  });
  // V3: start sets the nonce cookie; the browser that started sends it back.
  const nonces = new Map<string, string>();
  const start = async (returnTo = "/app/wishes") => {
    const res = await t.http().post("/v1/auth/google/start").send({ returnTo });
    expect(res.status).toBe(200);
    const state = new URL(res.body.url as string).searchParams.get("state")!;
    const set = ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[]) ?? []);
    const nonce = /fw_google=([^;]+)/.exec(set.find((c) => c.startsWith("fw_google=")) ?? "")?.[1];
    if (nonce) nonces.set(state, nonce);
    return state;
  };
  const nonceCookie = (state: string) => `fw_google=${nonces.get(state) ?? "none"}`;
  const callback = (code: string, state: string) => t.http().get("/v1/auth/google/callback").set("Cookie", nonceCookie(state)).query({ code, state });

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
      expect(res.body).toMatchObject({ isNew: true, returnTo: "/app/wishes", accessToken: expect.any(String), session: { id: expect.any(String) } });
      expect(refreshCookieOf(res)).toBeTruthy();
      expect(google.exchanged[google.exchanged.length - 1].codeVerifier).toMatch(/^[\w-]{40,}$/);
      const ext = await t.db.externalIdentity.findMany({ where: { subject: c.sub } });
      expect(ext).toHaveLength(1);
      expect(ext[0]).toMatchObject({ accountId: subOf(res.body.accessToken as string), provider: "google", email, emailVerified: true });
      const me = await t.http().get("/v1/me").set(bearer(res.body.accessToken as string));
      expect(me.body.email).toBe(email);
    });

    it("an email that already has an account signs into THAT account (one account per email)", async () => {
      const email = uniqueEmail("both");
      const coded = await signIn(t, email);
      const c = claims(email);
      const res = await callback(google.issueCode(c), await start());
      expect(res.status).toBe(200);
      expect(subOf(res.body.accessToken as string)).toBe(coded.accountId);
      expect(res.body.isNew).toBe(false);
      expect(await t.db.account.count({ where: { contact: email } })).toBe(1);
      expect(await t.db.externalIdentity.count({ where: { subject: c.sub, accountId: coded.accountId } })).toBe(1);
      const again = await callback(google.issueCode(c), await start());
      expect(subOf(again.body.accessToken as string)).toBe(coded.accountId);
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
      const stres = await start();
      const res = await t.http().post("/v1/me/google").set(bearer(s.accessToken)).set("Cookie", nonceCookie(stres)).send({ code: google.issueCode(c), state: stres });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ accountId: s.accountId, provider: "google", subject: c.sub, emailVerified: true });
      const signedIn = await callback(google.issueCode(c), await start());
      expect(subOf(signedIn.body.accessToken as string)).toBe(s.accountId);

      const other = await signIn(t, uniqueEmail("other"));
      const stclash = await start();
      const clash = await t.http().post("/v1/me/google").set(bearer(other.accessToken)).set("Cookie", nonceCookie(stclash)).send({ code: google.issueCode(c), state: stclash });
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
