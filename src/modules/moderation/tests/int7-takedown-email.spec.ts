import { account, B12App, b13App, liveWish, uniqueAddress } from "../../showing/tests/b13-kit";

describe("INT-7: the take-down code limit counts one mailbox once (a+1@ and a+2@ are one address)", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b13App();
  });
  afterAll(() => t.close());

  it("the 4th code to the same mailbox is 429 whichever +tag it was asked with, and only 3 are mailed", async () => {
    const w = await liveWish(t, await account(t, ["creator"]));
    const base = `me${t.id().replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
    const ask = (contact: string) => t.http().post(`/v1/w/${w.slug}/take-down`).set("X-Forwarded-For", uniqueAddress()).send({ contact });
    expect((await ask(`${base}+1@example.com`)).status).toBe(200);
    expect((await ask(`${base}+2@example.com`)).status).toBe(200);
    expect((await ask(`${base}@example.com`)).status).toBe(200);
    const fourth = await ask(`${base}+3@example.com`);
    expect(fourth.status).toBe(429);
    expect(t.email.sent.filter((e) => e.to.startsWith(base))).toHaveLength(3);
  });
});
