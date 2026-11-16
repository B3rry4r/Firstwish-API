import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { SettlementService } from "../../payments/settlement.service";
import { b12App, B12App, bearer, businessOwner, NOW } from "./b12-kit";

const ROOT = join(__dirname, "../../../..");

/** API-BASE-6 case 7: the small things the web still needed. */
describe("API-BASE-6 small: HR4 day, HR5 import rows, brand logo read, failed reason, display names, slugs, refused photo words", () => {
  let t: B12App;
  beforeAll(async () => {
    t = await b12App();
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());

  it("1. HR4: a removed draft's client wish reads the day its wish returns to the pack; a live one has none", async () => {
    const o = await businessOwner(t);
    const day = new Date(NOW.getTime() + 30 * 86_400_000);
    const wishId = t.id();
    await t.db.wish.create({ data: { id: wishId, accountId: o.accountId, businessId: o.businessId, status: "removed", removedAt: NOW, kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos" } as never });
    const cw = t.id();
    await t.db.clientWish.create({ data: { id: cw, businessId: o.businessId, wishId, client: "Ada", no: "FW-X1", key: `k-${cw}`, kind: "birthday", occasion: "birthday" } as never });
    await t.db.job.create({ data: { id: t.id(), type: "restore_window_end", subjectId: wishId, runAt: day, status: "scheduled", attempts: 0 } });
    const one = await t.http().get(`/v1/business/client-wishes/${cw}`).set(bearer(o.token));
    expect(one.status).toBe(200);
    expect(one.body.returnsToPackOn).toBe(day.toISOString().slice(0, 10));
    const list = await t.http().get("/v1/business/client-wishes").set(bearer(o.token));
    expect((list.body.items as { id: string; returnsToPackOn?: string }[]).find((x) => x.id === cw)?.returnsToPackOn).toBe(day.toISOString().slice(0, 10));
    await t.db.job.updateMany({ where: { subjectId: wishId }, data: { status: "cancelled" } });
    expect((await t.http().get(`/v1/business/client-wishes/${cw}`).set(bearer(o.token))).body.returnsToPackOn).toBeUndefined();
  });

  it("1b. HU6: returnsToPackOn is the business's Lagos day: a window that ends at 23:30 UTC is the next day there, the job's own instant", async () => {
    const o = await businessOwner(t);
    const runAt = new Date("2027-06-10T23:30:00.000Z");
    const wishId = t.id();
    await t.db.wish.create({ data: { id: wishId, accountId: o.accountId, businessId: o.businessId, status: "removed", removedAt: NOW, kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos" } as never });
    const cw = t.id();
    await t.db.clientWish.create({ data: { id: cw, businessId: o.businessId, wishId, client: "Ada", no: "FW-X2", key: `k-${cw}`, kind: "birthday", occasion: "birthday" } as never });
    await t.db.job.create({ data: { id: t.id(), type: "restore_window_end", subjectId: wishId, runAt, status: "scheduled", attempts: 0 } });
    expect((await t.http().get(`/v1/business/client-wishes/${cw}`).set(bearer(o.token))).body.returnsToPackOn).toBe("2027-06-11");
  });

  it("2. HR5: the import answers per row: accepted, or refused with the field and words; a bad phone is refused; the same person twice is reported", async () => {
    const o = await businessOwner(t);
    const rows = [
      { name: "Ada", birthday: "1990-05-17", phone: "0803 147 2093" },
      { name: "", birthday: "1990-05-17" },
      { name: "Bola", birthday: "not a date" },
      { name: "Chi", birthday: "1991-02-03", phone: "12345" },
      { name: "Ada", birthday: "1990-05-17" },
      "just a string",
      { name: "Eze", start: "2020-01-15" },
    ];
    const r = await t.http().post("/v1/business/people/import").set(bearer(o.token)).send({ rows });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(2);
    expect(r.body.rows).toEqual([
      { row: 1, state: "accepted" },
      { row: 2, state: "refused", field: "name", reason: "Needs a name." },
      { row: 3, state: "refused", field: "birthday", reason: "Needs a birthday or start date we can read." },
      { row: 4, state: "refused", field: "phone", reason: expect.stringMatching(/not a phone number/) },
      { row: 5, state: "duplicate", field: "name", reason: "The same person is in this file twice." },
      { row: 6, state: "refused", field: "row", reason: "Not a person." },
      { row: 7, state: "accepted" },
    ]);
    expect(r.body.skipped).toHaveLength(5);
    expect(await t.db.person.count({ where: { businessId: o.businessId } })).toBe(2);
    expect((await t.db.person.findFirstOrThrow({ where: { businessId: o.businessId, name: "Ada" } })).phone).toBe("+2348031472093");
    const again = await t.http().post("/v1/business/people/import").set(bearer(o.token)).send({ rows: [rows[0]] });
    expect(again.body.rows).toEqual([{ row: 1, state: "duplicate", field: "name", reason: "Already on your list." }]);
  });

  it("3. a brand logo reads with a signed address; a logo naming another business's file or a file not ready gets none", async () => {
    const o = await businessOwner(t);
    const other = await businessOwner(t);
    const file = async (businessId: string, status: "ready" | "pending", ownerAccountId: string) => {
      const id = t.id();
      await t.db.storedFile.create({ data: { id, ownerAccountId, businessId, purpose: "brand_logo", objectKey: `brand_logo/${id}/x`, contentType: "image/png", bytes: 100n, status, variants: [], driver: "r2", fileId: id, kind: "image" } as never });
      return id;
    };
    const mine = await file(o.businessId, "ready", o.accountId);
    await t.db.business.update({ where: { id: o.businessId }, data: { brand: { logo: mine, line: "hello" } } });
    const r = await t.http().get("/v1/business").set(bearer(o.token));
    expect(r.status).toBe(200);
    expect(r.body.brand).toMatchObject({ logo: mine, line: "hello" });
    expect(r.body.brand.logoRead.url).toMatch(/^http/);
    expect(typeof r.body.brand.logoRead.expiresAt).toBe("string");
    const theirs = await file(other.businessId, "ready", other.accountId);
    await t.db.business.update({ where: { id: o.businessId }, data: { brand: { logo: theirs } } });
    expect((await t.http().get("/v1/business").set(bearer(o.token))).body.brand.logoRead).toBeUndefined();
    const waiting = await file(o.businessId, "pending", o.accountId);
    await t.db.business.update({ where: { id: o.businessId }, data: { brand: { logo: waiting } } });
    expect((await t.http().get("/v1/business").set(bearer(o.token))).body.brand.logoRead).toBeUndefined();
  });

  it("4. a failed payment reads a reason in words; a paid one reads none", async () => {
    const o = await businessOwner(t);
    const start = async (key: string) => (await t.http().post("/v1/payments").set(bearer(o.token)).set("Idempotency-Key", key).send({ purpose: "wish-pack", packs: 1 })).body.payment.reference as string;
    const failedRef = await start("ab6s-fail-0001");
    const p = await t.db.payment.findUniqueOrThrow({ where: { providerReference: failedRef } });
    await t.app.get(SettlementService).settle({ reference: failedRef, status: "failed", amountKobo: p.amountKobo, currency: "NGN", paidAt: NOW });
    const r = await t.http().get(`/v1/payments/${failedRef}`).set(bearer(o.token));
    expect(r.body.state).toBe("failed");
    expect(r.body.reason).toMatch(/did not go through/);
    const okRef = await start("ab6s-ok-0001");
    expect((await t.http().get(`/v1/payments/${okRef}`).set(bearer(o.token))).body.reason).toBe("");
  });

  it("5. ending purposes carry a display name and a line with the purpose's own word as slug; opening defs carry a slug", async () => {
    const o = await businessOwner(t);
    const e = await t.http().get("/v1/ending-purposes").set(bearer(o.token));
    expect(e.status).toBe(200);
    const by = Object.fromEntries((e.body.items as { slug: string; name: string; line: string }[]).map((x) => [x.slug, x]));
    expect(Object.keys(by).sort()).toEqual(["close", "credits", "date", "question", "reveal", "wish"]);
    expect(by.wish).toMatchObject({ name: "A last act", line: "Something they do to finish it: blow, pop, light." });
    expect(by.close.name).toBe("A quiet close");
    const d = await t.http().get("/v1/opening-defs").set(bearer(o.token));
    expect(d.status).toBe(200);
    expect((d.body.items as { slug: string }[]).map((x) => x.slug).sort()).toEqual(["countdown", "open", "passcode", "presents", "question", "sealed"]);
  });

  it("6. the wish read's pictures carry the server's words for a refused photo, and none for a ready or held one", async () => {
    const o = await businessOwner(t);
    const wishId = t.id();
    await t.db.wish.create({ data: { id: wishId, accountId: o.accountId, status: "draft", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", ticket: "keepsake" } as never });
    const photo = async (status: "rejected" | "ready" | "screening", labels: string[]) => {
      const id = t.id();
      await t.db.storedFile.create({ data: { id, ownerAccountId: o.accountId, purpose: "wish_photo", objectKey: `wish_photo/${id}/x`, contentType: "image/jpeg", bytes: 100n, status, variants: [], driver: "r2", fileId: id, kind: "image" } as never });
      await t.db.wishFile.create({ data: { id: t.id(), wishId, fileId: id, role: "photo" } as never });
      if (labels.length) await t.db.screeningResult.create({ data: { id: t.id(), fileId: id, provider: "stand-in", verdict: "reject", labels } as never });
      return id;
    };
    const bad = await photo("rejected", ["nudity"]);
    const held = await photo("screening", []);
    const r = await t.http().get(`/v1/wishes/${wishId}`).set(bearer(o.token));
    expect(r.status).toBe(200);
    const by = Object.fromEntries((r.body.pictures as { fileId: string; status: string; reason: string | null }[]).map((x) => [x.fileId, x]));
    expect(by[bad]).toMatchObject({ status: "refused", reason: "This photo was not accepted: nudity. Choose another.", url: null });
    expect(by[held]).toMatchObject({ status: "screening", reason: null });
  });
});
