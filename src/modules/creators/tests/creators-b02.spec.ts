import { IdGenerator } from "../../../common/ports/ids.port";
import { newCreator, uniqueHandle } from "../../accounts/tests/sides.kit";
import { bearer, signIn, SignInApp, signInApp, uniqueEmail } from "../../sessions/tests/sign-in.kit";

describe("patch B02: creators", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const PUBLIC_KEYS = ["counts", "following", "handle", "house", "href", "id", "img", "line", "name", "own"];

  it("X6 GET /v1/creators/:handle answers one creator's public fields, with following and own for a signed-in viewer", async () => {
    const c = await newCreator(t, "x6");
    await t.db.account.update({ where: { id: c.accountId }, data: { bio: "Short bio", phone: "+2348031472093" } });
    const res = await t.http().get(`/v1/creators/${c.handle}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(PUBLIC_KEYS);
    expect(res.body).toMatchObject({ handle: c.handle, name: "Creator x6", href: `/creators/${c.handle}`, following: false, own: false, house: false });
    expect(JSON.stringify(res.body)).not.toMatch(/2348031472093|@example\.com|credits|earned/);
    const fan = await signIn(t, uniqueEmail("x6f"));
    await t.http().put(`/v1/creators/${c.handle}/follow`).set(bearer(fan.accessToken));
    expect((await t.http().get(`/v1/creators/${c.handle}`).set(bearer(fan.accessToken))).body).toMatchObject({ following: true, own: false, counts: { followers: 1 } });
    expect((await t.http().get(`/v1/creators/${c.handle}`).set(bearer(c.accessToken))).body).toMatchObject({ own: true });
    // A handle in any case or with an @ finds the same page.
    expect((await t.http().get(`/v1/creators/@${c.handle.toUpperCase()}`)).body.handle).toBe(c.handle);
  });

  it("X6 missing, side off, banned and erased are one and the same 404", async () => {
    const off = await newCreator(t, "x6o");
    await t.http().delete("/v1/me/creator").set(bearer(off.accessToken));
    const banned = await newCreator(t, "x6b");
    await t.db.ban.create({ data: { id: t.app.get(IdGenerator).id(), accountId: banned.accountId, scope: "account", reason: "test", by: "test" } });
    const erased = await newCreator(t, "x6e");
    await t.db.account.update({ where: { id: erased.accountId }, data: { erasedAt: new Date() } });
    const answers = [];
    for (const h of [uniqueHandle("nobody"), off.handle, banned.handle, erased.handle, "x", "bad handle!"]) {
      const r = await t.http().get(`/v1/creators/${encodeURIComponent(h)}`);
      answers.push({ status: r.status, error: { ...r.body.error, requestId: undefined } });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0].status).toBe(404);
  });

  it("X8 the house creator is listed (and is read by its handle)", async () => {
    const houseId = "00000000-0000-7000-8000-00000000f1f1";
    const creatorId = "00000000-0000-7000-8000-00000000f1f2";
    await t.db.account
      .upsert({
        where: { id: houseId },
        create: { id: houseId, name: "Firstwish", handle: "firstwish", sides: ["person", "creator"], lastSide: "creator" },
        update: {},
      })
      .catch(() => null);
    await t.db.creator
      .upsert({ where: { accountId: houseId }, create: { id: creatorId, accountId: houseId, name: "Firstwish", house: true, href: "/creators/firstwish", line: "Made by Firstwish" }, update: {} })
      .catch(() => null);
    const seen: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    do {
      const r = await t.http().get(`/v1/creators?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...r.body.items);
      cursor = r.body.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.find((c) => c.handle === "firstwish")).toMatchObject({ name: "Firstwish", house: true, href: "/creators/firstwish" });
    expect((await t.http().get("/v1/creators/firstwish")).body).toMatchObject({ handle: "firstwish", house: true });
    // The house has no email and cannot be followed by itself, but anyone else may follow it.
    const fan = await signIn(t, uniqueEmail("x8"));
    expect((await t.http().put("/v1/creators/firstwish/follow").set(bearer(fan.accessToken))).body).toEqual({ handle: "firstwish", following: true });
  });
});
