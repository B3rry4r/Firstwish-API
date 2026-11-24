import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { b12App, B12App, bearer, businessOwner } from "./b12-kit";

const ROOT = join(__dirname, "../../../..");

/** API-BASE-13 round 1 F2 (II2): the owner's wish read gives a refused photo the fixed words by kind, never a provider's or a stand-in's sentence. */
describe("API-BASE-13 round 1 F2: a refused photo's words on the owner's wish read", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b12App();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  it("a kind gives its line from the fixed list; a provider's sentence after it, or alone, never reaches the read", async () => {
    const o = await businessOwner(t);
    const wishId = t.id();
    await t.db.wish.create({ data: { id: wishId, accountId: o.accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", ticket: "keepsake" } as never });
    const photo = async (labels: string[]) => {
      const id = t.id();
      await t.db.storedFile.create({ data: { cleanAt: new Date(), id, ownerAccountId: o.accountId, purpose: "wish_photo", objectKey: `wish_photo/${id}/x`, contentType: "image/jpeg", bytes: 100n, status: "rejected", variants: [], driver: "r2", fileId: id, kind: "image" } as never });
      await t.db.wishFile.create({ data: { id: t.id(), wishId, fileId: id, role: "photo" } as never });
      await t.db.screeningResult.create({ data: { id: t.id(), fileId: id, provider: "stand-in", verdict: "reject", labels } as never });
      return id;
    };
    const big = await photo(["too large", "Provider says: this image shows a minor in distress"]);
    const sentence = await photo(["Provider says: explicit content found"]);
    const none = await photo([]);
    const r = await t.http().get(`/v1/wishes/${wishId}`).set(bearer(o.token));
    expect(r.status).toBe(200);
    const by = Object.fromEntries((r.body.pictures as { fileId: string; reason: string | null }[]).map((x) => [x.fileId, x.reason]));
    expect(by[big]).toBe("This file is too large.");
    expect(by[sentence]).toBe("This file was not accepted.");
    expect(by[none]).toBe("This file was not accepted.");
    expect(JSON.stringify(r.body)).not.toMatch(/Provider says|stand-in reason/);
  });
});
