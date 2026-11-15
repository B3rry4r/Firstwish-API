import { IdGenerator } from "../../../common/ports/ids.port";
import { bearer, signIn, SignInApp, signInApp, staffToken, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { newCreator, uniqueHandle } from "../../accounts/tests/sides.kit";

describe("follow E-57, E-58 (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const put = (token: string, h: string) => t.http().put(`/v1/creators/${encodeURIComponent(h)}/follow`).set(bearer(token));
  const del = (token: string, h: string) => t.http().delete(`/v1/creators/${encodeURIComponent(h)}/follow`).set(bearer(token));
  const followers = async (handle: string) => t.db.follow.count({ where: { handle } });

  it("follow and unfollow are idempotent; the handle is normalised", async () => {
    const c = await newCreator(t, "fol");
    const f = await signIn(t, uniqueEmail("fan"));
    for (let i = 0; i < 2; i++) {
      const res = await put(f.accessToken, `@${c.handle.toUpperCase()}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ handle: c.handle, following: true });
    }
    expect(await followers(c.handle)).toBe(1);
    for (let i = 0; i < 2; i++) expect((await del(f.accessToken, c.handle)).body).toEqual({ handle: c.handle, following: false });
    expect(await followers(c.handle)).toBe(0);
  });

  it("following yourself is refused (422 on handle)", async () => {
    const c = await newCreator(t, "self");
    const res = await put(c.accessToken, c.handle);
    expect(res.status).toBe(422);
    expect(res.body.error.fields.handle).toBe("You cannot follow yourself.");
    expect(await followers(c.handle)).toBe(0);
  });

  it("20 parallel toggles: the count is 0 or 1, never below zero, and matches the row", async () => {
    const c = await newCreator(t, "tog");
    const f = await signIn(t, uniqueEmail("tog"));
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? del(f.accessToken, c.handle) : put(f.accessToken, c.handle))));
    expect(res.every((r) => r.status === 200)).toBe(true);
    const n = await followers(c.handle);
    expect([0, 1]).toContain(n);
    const list = await t.http().get("/v1/creators?limit=50").set(bearer(f.accessToken));
    const mine = (list.body.items as { handle: string; counts: { followers: number }; following: boolean }[]).find((x) => x.handle === c.handle);
    expect(mine?.counts.followers).toBe(n);
    expect(mine?.following).toBe(n === 1);
    // 20 follows by 10 people at once (each twice): counted once each; then 20 unfollows at once: zero, not below.
    await del(f.accessToken, c.handle);
    const fans: Awaited<ReturnType<typeof signIn>>[] = [];
    for (let i = 0; i < 10; i++) fans.push(await signIn(t, uniqueEmail("crowd")));
    await Promise.all(fans.flatMap((p) => [put(p.accessToken, c.handle), put(p.accessToken, c.handle)]));
    expect(await followers(c.handle)).toBe(10);
    await Promise.all(fans.flatMap((p) => [del(p.accessToken, c.handle), del(p.accessToken, c.handle)]));
    expect(await followers(c.handle)).toBe(0);
  });

  it("404 for a handle with no creator, a side turned off, a banned or an erased account, the same answer each time", async () => {
    const f = await signIn(t, uniqueEmail("seek"));
    const person = await signIn(t, uniqueEmail("plain"));
    const handle = uniqueHandle("pl");
    await t.http().patch("/v1/me").set(bearer(person.accessToken)).send({ handle });
    const off = await newCreator(t, "hid");
    await t.http().delete("/v1/me/creator").set(bearer(off.accessToken));
    const banned = await newCreator(t, "ban");
    await t.db.ban.create({ data: { id: t.app.get(IdGenerator).id(), accountId: banned.accountId, scope: "account", reason: "test", by: "test" } });
    const erased = await newCreator(t, "era");
    const erasedHandle = erased.handle;
    await t.db.account.update({ where: { id: erased.accountId }, data: { erasedAt: new Date(), handle: null } });
    const answers = await Promise.all([uniqueHandle("none"), handle, off.handle, banned.handle, erasedHandle, "ab", "not a handle"].map((h) => put(f.accessToken, h)));
    for (const a of answers) {
      expect(a.status).toBe(404);
      expect(a.body.error).toMatchObject({ code: answers[0].body.error.code, message: answers[0].body.error.message });
    }
    expect(await t.db.follow.count({ where: { accountId: f.accountId } })).toBe(0);
  });

  it("a ban that has ended no longer hides the creator", async () => {
    const c = await newCreator(t, "lift");
    await t.db.ban.create({ data: { id: t.app.get(IdGenerator).id(), accountId: c.accountId, scope: "account", reason: "test", by: "test", until: new Date(t.clock.now().getTime() - 1000) } });
    const f = await signIn(t, uniqueEmail("lift"));
    expect((await put(f.accessToken, c.handle)).status).toBe(200);
  });

  it("unfollow still works after the creator hid the page", async () => {
    const c = await newCreator(t, "gone");
    const f = await signIn(t, uniqueEmail("gone"));
    await put(f.accessToken, c.handle);
    await t.http().delete("/v1/me/creator").set(bearer(c.accessToken));
    expect((await del(f.accessToken, c.handle)).body).toEqual({ handle: c.handle, following: false });
    expect(await followers(c.handle)).toBe(0);
  });

  it("401 without a token, 403 for staff", async () => {
    const c = await newCreator(t, "auth");
    expect((await t.http().put(`/v1/creators/${c.handle}/follow`)).status).toBe(401);
    expect((await t.http().delete(`/v1/creators/${c.handle}/follow`)).status).toBe(401);
    const staff = await staffToken(t);
    expect((await put(staff, c.handle)).status).toBe(403);
    expect((await del(staff, c.handle)).status).toBe(403);
  });
});
