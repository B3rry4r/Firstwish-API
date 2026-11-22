import { IdGenerator } from "../../../common/ports/ids.port";
import { bearer, signIn, SignInApp, signInApp, uniqueEmail } from "../../sessions/tests/sign-in.kit";
import { newCreator } from "../../accounts/tests/sides.kit";

type Item = Record<string, unknown> & { handle: string };

describe("creators E-42 GET /v1/creators (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  /** Every page of the list, as anyone or as the given token. */
  async function all(token?: string): Promise<Item[]> {
    const out: Item[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 100; i++) {
      const req = t.http().get(`/v1/creators?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      const res = await (token ? req.set(bearer(token)) : req);
      expect(res.status).toBe(200);
      out.push(...(res.body.items as Item[]));
      cursor = res.body.nextCursor as string | null;
      if (!cursor) break;
    }
    return out;
  }

  it("public: lists creator pages with public fields only, paged by cursor", async () => {
    const c = await newCreator(t, "pub");
    await t.http().patch("/v1/me").set(bearer(c.accessToken)).send({ contact: "0803 147 2093", bio: "Weddings", dates: [{ name: "Mum", date: "2027-03-14" }] });
    const items = await all();
    const mine = items.find((x) => x.handle === c.handle);
    expect(mine).toEqual({
      id: expect.any(String),
      handle: c.handle,
      name: "Creator pub",
      line: "Weddings",
      href: `/creators/${c.handle}`,
      img: null,
      house: false,
      own: false,
      following: false,
      counts: { followers: 0, wishes: null, styles: null },
    });
    const text = JSON.stringify(items);
    for (const secret of ["example.com", "+234", "2027-03-14", "Mum", c.accountId]) expect(text).not.toContain(secret);
  });

  it("signed in: own and following are marked", async () => {
    const c = await newCreator(t, "own");
    const fan = await signIn(t, uniqueEmail("fan"));
    await t.http().put(`/v1/creators/${c.handle}/follow`).set(bearer(fan.accessToken));
    expect((await all(c.accessToken)).find((x) => x.handle === c.handle)).toMatchObject({ own: true, following: false, counts: { followers: 1 } });
    expect((await all(fan.accessToken)).find((x) => x.handle === c.handle)).toMatchObject({ own: false, following: true });
    expect((await all("not-a-token")).find((x) => x.handle === c.handle)).toMatchObject({ own: false, following: false });
  }, 30_000);

  it("leaves out a side turned off, a banned and an erased account", async () => {
    const off = await newCreator(t, "off");
    await t.http().delete("/v1/me/creator").set(bearer(off.accessToken));
    const banned = await newCreator(t, "ban");
    await t.db.ban.create({ data: { id: t.app.get(IdGenerator).id(), accountId: banned.accountId, scope: "account", reason: "test", by: "test" } });
    const erased = await newCreator(t, "era");
    await t.db.account.update({ where: { id: erased.accountId }, data: { erasedAt: new Date() } });
    const shown = new Set((await all()).map((x) => x.handle));
    for (const h of [off.handle, banned.handle, erased.handle]) expect(shown.has(h)).toBe(false);
  });

  it("422 for a bad limit or a cursor the server did not make", async () => {
    expect((await t.http().get("/v1/creators?limit=0")).status).toBe(422);
    expect((await t.http().get("/v1/creators?limit=51")).status).toBe(422);
    const bad = await t.http().get("/v1/creators?cursor=nonsense");
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.cursor).toBeDefined();
  });
});
