import { randomUUID } from "node:crypto";
import { StandinStorage } from "../../../common/ports/adapters/standins";
import { StoragePort } from "../../../common/ports/storage.port";
import { PNG } from "../../stored-files/tests/files-kit";
import { bearer, signIn, SignInApp, signInApp, staffToken, uniqueEmail } from "../../sessions/tests/sign-in.kit";

describe("business E-26 PATCH /v1/business (contract)", () => {
  let t: SignInApp;
  beforeAll(async () => {
    t = await signInApp();
  });
  afterAll(() => t.close());

  const patch = (token: string, body: object) => t.http().patch("/v1/business").set(bearer(token)).send(body);
  async function owner(tag: string) {
    const s = await signIn(t, uniqueEmail(tag));
    const res = await t.http().post("/v1/me/business").set(bearer(s.accessToken)).send({ business: `${tag} Co` });
    expect(res.status).toBe(200);
    return s;
  }
  /** A ready brand file of this account (AA5: the logo is a stored file id). */
  const logoFor = async (accountId: string) => {
    const id = randomUUID();
    t.app.get<StandinStorage>(StoragePort).put(`files/${id}`, PNG(10), "image/png");
    await t.db.storedFile.create({ data: { id, ownerAccountId: accountId, purpose: "brand_logo", objectKey: `files/${id}`, contentType: "image/png", bytes: BigInt(10), status: "ready", variants: [], driver: "r2" } as never });
    return id;
  };

  it("sets the brand, merges later changes, '' clears a field; normalises colours", async () => {
    const s = await owner("brand");
    const logo = await logoFor(s.accountId);
    const res = await patch(s.accessToken, { brand: { business: " Lagos Frames ", line: "Weddings", colours: ["#C8693A", "#ffffff"], booking: "https://example.com/book", logo } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ business: "Lagos Frames", line: "Weddings", colours: ["#c8693a", "#ffffff"], booking: "https://example.com/book", logo });
    const next = await patch(s.accessToken, { brand: { line: "Portraits", logo: "" } });
    expect(next.body).toEqual({ business: "Lagos Frames", line: "Portraits", colours: ["#c8693a", "#ffffff"], booking: "https://example.com/book" });
    const row = await t.db.business.findFirstOrThrow({ where: { accountId: s.accountId } });
    expect(row.brand).toEqual(next.body);
  });

  it("422 with fields for bad values and unknown keys", async () => {
    const s = await owner("bad");
    const res = await patch(s.accessToken, { brand: { colours: ["red"], booking: "javascript:alert(1)", logo: "data:text/html;base64,AAAA", extra: 1, line: "x".repeat(81) } });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["brand.booking", "brand.colours", "brand.extra", "brand.line", "brand.logo"]);
    expect((await patch(s.accessToken, { brand: "x" })).status).toBe(422);
    expect((await patch(s.accessToken, { plan: "pro" })).status).toBe(422);
  });

  it("changes only the caller's own business", async () => {
    const a = await owner("a");
    const b = await owner("b");
    await patch(a.accessToken, { brand: { line: "A line" } });
    await patch(b.accessToken, { brand: { line: "B line" } });
    expect((await t.db.business.findFirstOrThrow({ where: { accountId: a.accountId } })).brand).toEqual({ line: "A line" });
  });

  it("401 without a token; 403 for staff, for a person without the business side and after the side is turned off", async () => {
    expect((await t.http().patch("/v1/business").send({ brand: {} })).status).toBe(401);
    expect((await patch(await staffToken(t), { brand: {} })).status).toBe(403);
    const p = await signIn(t, uniqueEmail("nobiz"));
    expect((await patch(p.accessToken, { brand: {} })).status).toBe(403);
    const o = await owner("offb");
    await t.http().delete("/v1/me/business").set(bearer(o.accessToken));
    expect((await patch(o.accessToken, { brand: { line: "x" } })).status).toBe(403);
  });
});
