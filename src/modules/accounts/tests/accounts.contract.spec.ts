import { bearer, signIn, SignInApp, signInApp, staffToken, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { testWishNo } from "../../../../test/kit/unique";

describe("accounts E-6, E-7 /v1/me (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const get = (token: string) => t.http().get("/v1/me").set(bearer(token));
  const patch = (token: string, body: unknown) => t.http().patch("/v1/me").set(bearer(token)).send(body as object);

  it("GET returns the account made on first sign-in, with sides and mode", async () => {
    const email = uniqueEmail("me");
    const s = await signIn(t, email);
    const res = await get(s.accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: s.accountId,
      email,
      contact: email,
      name: null,
      phone: null,
      sides: ["person"],
      mode: "system",
      creator: false,
      erased: false,
      wishCount: 0,
      dates: [],
      joined: expect.stringMatching(/Z$/),
    });
  });

  it("PATCH changes name and mode; GET shows them", async () => {
    const s = await signIn(t, uniqueEmail("p"));
    const res = await patch(s.accessToken, { name: "  Ada Obi ", mode: "dark" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Ada Obi", mode: "dark" });
    for (const mode of ["light", "system"]) expect((await patch(s.accessToken, { mode })).body.mode).toBe(mode);
    expect((await get(s.accessToken)).body).toMatchObject({ name: "Ada Obi", mode: "system" });
  });

  it("422 for a bad mode, an empty name and for fields a user may not change", async () => {
    const s = await signIn(t, uniqueEmail("bad"));
    const mode = await patch(s.accessToken, { mode: "purple" });
    expect(mode.status).toBe(422);
    expect(mode.body.error.fields.mode).toBeDefined();
    expect((await patch(s.accessToken, { name: "   " })).status).toBe(422);
    for (const field of ["sides", "email", "id", "erased", "phone", "creator"]) {
      const res = await patch(s.accessToken, { [field]: field === "sides" ? ["creator"] : "x" });
      expect(res.status).toBe(422);
      expect(res.body.error.fields[field]).toBe("Not a known field.");
    }
    expect((await get(s.accessToken)).body.sides).toEqual(["person"]);
  });

  it("a phone given as contact is kept as a plain E.164 detail, never a key", async () => {
    const email = uniqueEmail("ph");
    const s = await signIn(t, email);
    const res = await patch(s.accessToken, { contact: "0803 147 2093" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: "+2348031472093", email, contact: email });
    const row = await t.db.account.findUniqueOrThrow({ where: { id: s.accountId } });
    expect(row.contact).toBe(email);
    const code = await t.http().post("/v1/auth/codes").send({ contact: "+2348031472093" });
    expect(code.status).toBe(422);
  });

  it("contact may repeat the sign-in email; another email is refused", async () => {
    const email = uniqueEmail("same");
    const s = await signIn(t, email);
    expect((await patch(s.accessToken, { contact: ` ${email.toUpperCase()}` })).status).toBe(200);
    const res = await patch(s.accessToken, { contact: uniqueEmail("other") });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.contact).toBeDefined();
    expect((await patch(s.accessToken, { contact: "hello" })).status).toBe(422);
    expect((await get(s.accessToken)).body.email).toBe(email);
  });

  it("bio, space, dates and handle", async () => {
    const s = await signIn(t, uniqueEmail("more"));
    const res = await patch(s.accessToken, {
      bio: "  ",
      space: "me",
      here: "someone",
      dates: [{ name: "Mum", who: "mother", what: "Birthday", date: "2027-03-14" }],
      handle: `@Ada.${testWishNo().slice(0, 15)}`,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bio: null, space: "me", lastSide: "person" });
    expect(res.body.handle).toMatch(/^ada\.\d+$/);
    expect(res.body.dates).toEqual([{ id: expect.any(String), name: "Mum", who: "mother", what: "Birthday", date: "2027-03-14" }]);
    expect((await patch(s.accessToken, { space: "creator" })).status).toBe(422);
    const badDate = await patch(s.accessToken, { dates: [{ name: "X", date: "2027-02-30" }] });
    expect(badDate.status).toBe(422);
    expect(badDate.body.error.fields["dates[0].date"]).toBeDefined();
    const other = await signIn(t, uniqueEmail("taken"));
    const taken = await patch(other.accessToken, { handle: res.body.handle as string });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("handle_taken");
  });

  it("401 without a token, 403 for staff", async () => {
    expect((await t.http().get("/v1/me")).status).toBe(401);
    expect((await t.http().patch("/v1/me").send({ mode: "dark" })).status).toBe(401);
    const staff = await staffToken(t);
    expect((await get(staff)).status).toBe(403);
    expect((await patch(staff, { mode: "dark" })).status).toBe(403);
  });
});
