import { codeFor, refreshCookieOf, signIn, SignInApp, signInApp, subOf, uniqueEmail, uniqueIp } from "../../sessions/tests/sign-in.kit";

describe("auth codes E-19, E-20 (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const ask = (contact: unknown, ip: string, extra: Record<string, unknown> = {}) =>
    t.http().post("/v1/auth/codes").set("X-Forwarded-For", ip).send({ contact, ...extra });
  const verify = (contact: string, code: string, ip: string) => t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", ip).send({ contact, code });

  describe("E-19 ask for a code", () => {
    it("normalises the email, sends one email, stores only a hash with an expiry", async () => {
      const base = uniqueEmail("ada");
      const typed = ` ${base.replace("ada", "ADA").replace("example.com", "Example.com")}`;
      const before = t.email.sent.length;
      const res = await ask(typed, uniqueIp(), { mode: "up", via: "email" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: true, resendAfter: 60, destination: `a***@example.com` });
      expect(t.email.sent.length).toBe(before + 1);
      const mail = t.email.lastTo(base);
      expect(mail).toBeDefined();
      const code = codeFor(t, base);
      const row = await t.db.authCode.findFirstOrThrow({ where: { destination: base } });
      expect(row.codeHash).not.toContain(code);
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.expiresAt.getTime() - t.clock.now().getTime()).toBe(10 * 60 * 1000);
      expect(row.attempts).toBe(0);
      expect(row.channel).toBe("email");
    });

    it("answers the same whether or not the email has an account", async () => {
      const known = uniqueEmail("b");
      await signIn(t, known);
      t.clock.advance(61_000);
      const fresh = uniqueEmail("b");
      const a = await ask(known, uniqueIp());
      const b = await ask(fresh, uniqueIp());
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(Object.keys(a.body as object).sort()).toEqual(Object.keys(b.body as object).sort());
      expect(a.body).toEqual(b.body);
    });

    it("422 for a contact that is not an email, a phone, an unknown field or another channel", async () => {
      for (const body of [{ contact: "not-an-email" }, { contact: "+2348031472093" }, { contact: uniqueEmail("x"), via: "sms" }, { contact: uniqueEmail("x"), phone: "1" }]) {
        const res = await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send(body);
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("validation_failed");
        expect(Object.keys(res.body.error.fields as object).length).toBeGreaterThan(0);
      }
    });

    it("waits 60 seconds before another code to the same email: 429 with the envelope and Retry-After", async () => {
      const email = uniqueEmail("wait");
      expect((await ask(email, uniqueIp())).status).toBe(200);
      t.clock.advance(15_000);
      const res = await ask(email, uniqueIp());
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("too_many_requests");
      expect(typeof res.body.error.requestId).toBe("string");
      expect(res.headers["retry-after"]).toBe("45");
      t.clock.advance(45_000);
      expect((await ask(email, uniqueIp())).status).toBe(200);
    });

    it("a new code ends the earlier one", async () => {
      const email = uniqueEmail("new");
      const ip = uniqueIp();
      await ask(email, ip);
      const first = codeFor(t, email);
      t.clock.advance(61_000);
      t.codes.queueDigits(first === "999999" ? "888888" : "999999");
      await ask(email, ip);
      const res = await verify(email, first, ip);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("code_wrong");
    });

    it("5 codes per email per hour, then 429 until the oldest is an hour old", async () => {
      const email = uniqueEmail("hour");
      for (let i = 0; i < 5; i++) {
        expect((await ask(email, uniqueIp())).status).toBe(200);
        t.clock.advance(61_000);
      }
      const res = await ask(email, uniqueIp());
      expect(res.status).toBe(429);
      expect(Number(res.headers["retry-after"])).toBe(3600 - 5 * 61);
      t.clock.advance(3600_000);
      expect((await ask(email, uniqueIp())).status).toBe(200);
    });

    it("20 codes per IP per hour, then 429", async () => {
      const ip = uniqueIp();
      for (let i = 0; i < 20; i++) expect((await ask(uniqueEmail("ip"), ip)).status).toBe(200);
      const res = await ask(uniqueEmail("ip"), ip);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("too_many_requests");
      expect(Number(res.headers["retry-after"])).toBe(3600);
    });

    it("a failed email send stores and counts nothing", async () => {
      const email = uniqueEmail("fail");
      const spy = jest.spyOn(t.email, "send").mockRejectedValueOnce(new Error("provider down"));
      const res = await ask(email, uniqueIp());
      expect(res.status).toBe(500);
      spy.mockRestore();
      expect(await t.db.authCode.count({ where: { destination: email } })).toBe(0);
      expect((await ask(email, uniqueIp())).status).toBe(200);
    });
  });

  describe("E-20 verify", () => {
    it("makes the account once, returns a 15-minute access token and sets the refresh cookie", async () => {
      const email = uniqueEmail("ada");
      const ip = uniqueIp();
      await ask(email, ip);
      const res = await verify(` ${email.toUpperCase()} `, codeFor(t, email), ip);
      expect(res.status).toBe(200);
      // T1: AuthResult {accessToken, accessExpiresAt, isNew, session: {id, expiresAt}}, nothing else.
      expect(Object.keys(res.body as object).sort()).toEqual(["accessExpiresAt", "accessToken", "isNew", "session"]);
      expect(res.body).toMatchObject({ isNew: true, session: { id: expect.any(String), expiresAt: expect.any(String) } });
      expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(new Date(res.body.accessExpiresAt as string).getTime() - t.clock.now().getTime()).toBe(15 * 60 * 1000);
      expect(new Date(res.body.session.expiresAt as string).getTime() - t.clock.now().getTime()).toBe(30 * 24 * 3600 * 1000);
      expect(res.body).not.toHaveProperty("refreshTokenHash");
      const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("fw_refresh="))!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/v1/auth/refresh");
      expect(cookie).toContain(`Max-Age=${30 * 24 * 3600}`);
      expect(await t.db.account.count({ where: { contact: email } })).toBe(1);

      t.clock.advance(61_000);
      const again = await signIn(t, email);
      expect(again.body.isNew).toBe(false);
      expect(again.accountId).toBe(subOf(res.body.accessToken as string));
      expect(await t.db.account.count({ where: { contact: email } })).toBe(1);
      const me = await t.http().get("/v1/me").set("Authorization", `Bearer ${again.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(email);
    });

    it("a wrong code counts a try; after 5 the code is dead even when right", async () => {
      const email = uniqueEmail("tries");
      const ip = uniqueIp();
      await ask(email, ip);
      const code = codeFor(t, email);
      const wrong = code === "000000" ? "111111" : "000000";
      const first = await verify(email, wrong, ip);
      expect(first.status).toBe(400);
      expect(first.body.error.code).toBe("code_wrong");
      expect((await t.db.authCode.findFirstOrThrow({ where: { destination: email } })).attempts).toBe(1);
      for (let i = 0; i < 3; i++) expect((await verify(email, wrong, ip)).body.error.code).toBe("code_wrong");
      expect((await verify(email, wrong, ip)).body.error.code).toBe("code_expired");
      const right = await verify(email, code, ip);
      expect(right.status).toBe(400);
      expect(right.body.error.code).toBe("code_expired");
      expect(await t.db.account.count({ where: { contact: email } })).toBe(0);
    });

    it("an expired code refuses", async () => {
      const email = uniqueEmail("exp");
      const ip = uniqueIp();
      await ask(email, ip);
      t.clock.advance(10 * 60 * 1000 + 1);
      const res = await verify(email, codeFor(t, email), ip);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("code_expired");
    });

    it("a used code refuses", async () => {
      const email = uniqueEmail("used");
      const ip = uniqueIp();
      await ask(email, ip);
      const code = codeFor(t, email);
      expect((await verify(email, code, ip)).status).toBe(200);
      const res = await verify(email, code, ip);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("code_expired");
    });

    it("the same code sent twice at once signs in once", async () => {
      const email = uniqueEmail("race");
      const ip = uniqueIp();
      await ask(email, ip);
      const code = codeFor(t, email);
      const results = await Promise.all([verify(email, code, ip), verify(email, code, ip), verify(email, code, ip)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
      expect(results.filter((r) => refreshCookieOf(r) !== null).length).toBe(1);
      const account = await t.db.account.findUniqueOrThrow({ where: { contact: email } });
      expect(await t.db.session.count({ where: { accountId: account.id } })).toBe(1);
    });

    it("422 for a code that is not 6 digits or a contact that is not an email", async () => {
      const a = await verify(uniqueEmail("f"), "12ab", uniqueIp());
      expect(a.status).toBe(422);
      expect(a.body.error.fields.code).toBeDefined();
      const b = await verify("nope", "123456", uniqueIp());
      expect(b.status).toBe(422);
      expect(b.body.error.fields.contact).toBeDefined();
      const c = await t.http().post("/v1/auth/codes/verify").send({ contact: uniqueEmail("f") });
      expect(c.status).toBe(422);
    });
  });
});
