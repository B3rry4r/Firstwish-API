import { IdGenerator } from "../../../common/ports/ids.port";
import { StandinStorage } from "../../../common/ports/adapters/standins";
import { StoragePort } from "../../../common/ports/storage.port";
import { PNG, SVG } from "../../stored-files/tests/files-kit";
import { bearer, signIn, SignInApp, signInApp, uniqueEmail } from "../../sessions/tests/sign-in.kit";

describe("patch B02: business brand", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());
  const patch = (token: string, body: object) => t.http().patch("/v1/business").set(bearer(token)).send(body);
  async function owner(tag: string) {
    const s = await signIn(t, uniqueEmail(tag));
    expect((await t.http().post("/v1/me/business").set(bearer(s.accessToken)).send({ business: `${tag} Co` })).status).toBe(200);
    const biz = await t.db.business.findFirstOrThrow({ where: { accountId: s.accountId } });
    return { ...s, businessId: biz.id };
  }
  async function file(o: { accountId: string; businessId: string }, over: Record<string, unknown> = {}, bytes: Buffer | null = PNG(1000)) {
    const id = t.app.get(IdGenerator).id();
    if (bytes) t.app.get<StandinStorage>(StoragePort).put(`files/${id}`, bytes, "image/png");
    await t.db.storedFile.create({
      data: { cleanAt: new Date(),
        id,
        ownerAccountId: o.accountId,
        purpose: "brand_logo",
        objectKey: `files/${id}`,
        contentType: "image/png",
        bytes: BigInt(1000),
        status: "ready",
        variants: [],
        driver: "r2",
        ...over,
      } as never,
    });
    return id;
  }

  it("AA4 the booking link is stored as the parsed URL's own text, https only, at most 2048 characters", async () => {
    const o = await owner("aa4");
    const ok = await patch(o.accessToken, { brand: { booking: "  HTTPS://Example.COM/Book Me?x=1 " } });
    expect(ok.status).toBe(200);
    expect(ok.body.booking).toBe("https://example.com/Book%20Me?x=1");
    expect((await t.db.business.findUniqueOrThrow({ where: { id: o.businessId } })).brand).toMatchObject({ booking: "https://example.com/Book%20Me?x=1" });
    const bad = [
      "http://example.com",
      "javascript:alert(1)",
      "https://user:pass@example.com/",
      "ftp://example.com",
      "example.com",
      `https://example.com/${"a".repeat(2100)}`,
    ];
    for (const booking of bad) {
      const r = await patch(o.accessToken, { brand: { booking } });
      expect({ booking: booking.slice(0, 40), status: r.status }).toEqual({ booking: booking.slice(0, 40), status: 422 });
      expect(r.body.error.fields["brand.booking"]).toBeDefined();
    }
    // A line break inside a link is dropped by the URL parser, so the stored text is the parsed link and holds none.
    const odd = await patch(o.accessToken, { brand: { booking: "https://x.y\njavascript:1" } });
    expect(odd.body.booking).toBe("https://x.yjavascript:1/");
    const tag = await patch(o.accessToken, { brand: { booking: 'https://a.b/"><script>' } });
    expect(tag.body.booking).toBe("https://a.b/%22%3E%3Cscript%3E");
    await patch(o.accessToken, { brand: { booking: "https://example.com/Book%20Me?x=1" } });
    // The stored value is still the good one, and '' clears it.
    expect((await t.db.business.findUniqueOrThrow({ where: { id: o.businessId } })).brand).toMatchObject({ booking: "https://example.com/Book%20Me?x=1" });
    expect((await patch(o.accessToken, { brand: { booking: "" } })).body).toEqual({});
  });

  it("AA5 the logo is a stored file id with purpose brand: this account's, ready, never a data URL", async () => {
    const o = await owner("aa5");
    const id = await file(o);
    const ok = await patch(o.accessToken, { brand: { logo: id } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ logo: id });
    expect((await t.db.business.findUniqueOrThrow({ where: { id: o.businessId } })).brand).toEqual({ logo: id });
    // A file the business holds through businessId is also its own.
    const viaBusiness = await file(o, { ownerAccountId: null, businessId: o.businessId });
    expect((await patch(o.accessToken, { brand: { logo: viaBusiness } })).status).toBe(200);

    const other = await owner("aa5o");
    const refused: Record<string, string> = {
      "a data URL": `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
      "text": "my-logo.png",
      "an id nobody made": "00000000-0000-7000-8000-0000000000aa",
      "another account's file": await file(other),
      "a file for another purpose": await file(o, { purpose: "wish_photo" }),
      "a file not yet ready": await file(o, { status: "screening" }),
      "a rejected file": await file(o, { status: "rejected" }),
      "an SVG row": await file(o, { contentType: "image/svg+xml" }, SVG(200)),
      "a png row whose bytes are an SVG": await file(o, {}, SVG(200)),
      "a ready row with no object": await file(o, {}, null),
    };
    for (const [what, logo] of Object.entries(refused)) {
      const r = await patch(o.accessToken, { brand: { logo } });
      expect({ what, status: r.status }).toEqual({ what, status: 422 });
      expect(r.body.error.fields["brand.logo"]).toBeDefined();
    }
    expect((await patch(o.accessToken, { brand: { logo: "" } })).status).toBe(200);
    expect((await patch(o.accessToken, { brand: { logo: 5 } })).status).toBe(422);
  });

  it("AA1 two brand patches at once both land (the lock runs them one after the other)", async () => {
    const o = await owner("aa1pair");
    const [a, b] = await Promise.all([patch(o.accessToken, { brand: { line: "One" } }), patch(o.accessToken, { brand: { business: "Two" } })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await t.db.business.findUniqueOrThrow({ where: { id: o.businessId } })).brand).toEqual({ line: "One", business: "Two" });
  });
});
