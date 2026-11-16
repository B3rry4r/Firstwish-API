import { PrismaService } from "../../../common/db/prisma.service";
import { account, B12App, b13App, bearer, liveWish, staffOf } from "./b13-kit";

/** API-BASE-4 HP12: people search by wish number, the held photo read, the day picks read, the creators' payout months. */
describe("API-BASE-4 HP12 staff reads (through the real routes)", () => {
  let t: B12App;
  let db: PrismaService;
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
  });
  afterAll(() => t.close());
  const run = String(process.pid);

  it("GET /v1/admin/people finds the person by a wish number (also as 'Wish № 0412'); another number finds nobody", async () => {
    const s = await staffOf(t, "support");
    const owner = await account(t, ["person"]);
    const w = await liveWish(t, owner);
    for (const q of [w.no, `Wish № ${w.no}`]) {
      const r = await t.http().get(`/v1/admin/people?q=${encodeURIComponent(q)}`).set(bearer(s.token));
      expect(r.status).toBe(200);
      expect((r.body.items as { id: string }[]).map((i) => i.id)).toEqual([owner.accountId]);
    }
    const none = await t.http().get("/v1/admin/people?q=99999999").set(bearer(s.token));
    expect(none.body.items).toEqual([]);
  });

  it("a held photo comes with a signed short-lived read for moderator, ops and owner only, and each read is in the audit", async () => {
    const fileOwner = await account(t, ["creator"]);
    const fileId = t.id();
    t.storage.put(`k/${fileId}`, Buffer.from("HELDBYTES"), "image/jpeg");
    await db.storedFile.create({ data: { id: fileId, ownerAccountId: fileOwner.accountId, purpose: "wish_photo", status: "screening", contentType: "image/jpeg", bytes: 9n, objectKey: `k/${fileId}`, variants: [], driver: "r2" } });
    await db.uploadTicket.create({ data: { id: fileId, bytes: 9n, contentType: "image/jpeg", purpose: "wish-photo" } });
    const flagged = t.id();
    await db.screeningResult.create({ data: { id: flagged, fileId, provider: "standin", verdict: "review", labels: [], createdAt: t.clock.now() } });
    type Item = { id: string; heldPhoto: { url: string; expiresAt: string } | null };
    const get = async (token: string) => ((await t.http().get("/v1/admin/moderation?limit=50").set(bearer(token))).body.items as Item[]).find((i) => i.id === flagged);
    const mod = await staffOf(t, "moderator");
    const before = await db.auditEntry.count({ where: { action: "moderation.view-photo", subjectId: fileId } });
    const item = await get(mod.token);
    expect(item?.heldPhoto?.url).toContain(`k/${fileId}`);
    const life = new Date(item?.heldPhoto?.expiresAt as string).getTime() - t.clock.now().getTime();
    expect(life).toBeGreaterThan(0);
    expect(life).toBeLessThanOrEqual(15 * 60_000);
    expect(await db.auditEntry.count({ where: { action: "moderation.view-photo", subjectId: fileId } })).toBe(before + 1);
    const row = await db.auditEntry.findFirstOrThrow({ where: { action: "moderation.view-photo", subjectId: fileId } });
    expect(JSON.stringify(row)).not.toContain("standin-bucket");
    expect((await get((await staffOf(t, "ops")).token))?.heldPhoto).not.toBeNull();
    expect((await get((await staffOf(t, "owner")).token))?.heldPhoto).not.toBeNull();
    // other roles cannot read the queue at all, so they never get a url
    for (const role of ["support", "reviewer", "finance", "maker"] as const) {
      expect((await t.http().get("/v1/admin/moderation").set(bearer((await staffOf(t, role)).token))).status).toBe(403);
    }
    const url = new URL(item?.heldPhoto?.url as string);
    expect((await t.http().get(`/v1/standin-storage${url.pathname}${url.search}`)).status).toBe(200);
  });

  it("GET /v1/admin/showing/days gives the picks from today to the next 6 days, by date (moderator, ops, owner)", async () => {
    const mod = await staffOf(t, "moderator");
    const owner = await account(t, ["creator"]);
    const w = await liveWish(t, owner);
    await t.http().post(`/v1/wishes/${w.id}/publish-requests`).set(bearer(owner.token)).send({ consent: true });
    const req = await db.publishRequest.findFirstOrThrow({ where: { wishId: w.id } });
    await t.http().post(`/v1/admin/showing/requests/${req.id}/decide`).set(bearer(mod.token)).send({ decision: "approve", reason: "Looks lovely" });
    const day = (n: number) => new Date(t.clock.now().getTime() + n * 86_400_000 + 3_600_000).toISOString().slice(0, 10);
    for (const n of [0, 3, 6]) expect((await t.http().put(`/v1/admin/showing/day/${day(n)}`).set(bearer(mod.token)).send({ wish: w.no, reason: "A lovely one" })).status).toBe(200);
    const r = await t.http().get("/v1/admin/showing/days").set(bearer(mod.token));
    expect(r.status).toBe(200);
    const items = r.body.items as { date: string; wish: string; reason: string }[];
    expect(items.map((i) => i.date)).toEqual([day(0), day(3), day(6)]);
    expect(items[0]).toMatchObject({ wish: w.no, reason: "A lovely one" });
    expect((await t.http().get("/v1/admin/showing/days").set(bearer((await staffOf(t, "support")).token))).status).toBe(403);
    expect((await t.http().get("/v1/admin/showing/days")).status).toBe(401);
  });

  it("the staff creators list carries each creator's payout months and which are due", async () => {
    const fin = await staffOf(t, "finance");
    const accountId = t.id();
    const creatorId = t.id();
    await db.account.create({ data: { id: accountId, contact: `ab4c-${run}@example.com`, sides: ["person", "creator"] as never, lastSide: "person", handle: `ab4c${run}` } });
    await db.creator.create({ data: { id: creatorId, accountId, name: `ab4c${run}` } });
    const bank = await db.bankAccount.create({ data: { id: t.id(), creatorId, accountNumber: "0123456789", bankCode: "058" } });
    const now = t.clock.now();
    const thisMonth = now.toISOString().slice(0, 7);
    const back = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 15)).toISOString().slice(0, 7);
    const pay = (m: string) => db.payment.create({ data: { id: t.id(), accountId, purpose: "ticket", subjectId: t.id(), lines: [], amountKobo: 1000n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack", providerReference: `ab4-${run}-${m}`, idempotencyKey: `ab4-${run}-${m}`, verifiedAt: now, options: {} } });
    for (const [m, kobo] of [[back(3), 500000n], [back(2), 300000n], [back(1), 2000000n], [thisMonth, 100000n]] as [string, bigint][]) {
      const p = await pay(m);
      await db.royaltyAccrual.create({ data: { id: t.id(), creatorId, styleSlug: "classic", paymentId: p.id, basis: "pro_wish", amountKobo: kobo, month: m } });
    }
    await db.payout.create({ data: { id: t.id(), creatorId, month: back(3), amountKobo: 500000n, status: "succeeded", bankAccountId: bank.id } });
    await db.payout.create({ data: { id: t.id(), creatorId, month: back(2), amountKobo: 300000n, status: "failed", bankAccountId: bank.id } });
    type C = { id: string; payoutMonths: { month: string; earnedKobo: number; payoutStatus: string | null; due: boolean }[] };
    let me: C | undefined;
    let cursor: string | null = null;
    do {
      const list = await t.http().get(`/v1/admin/creators?limit=50${cursor ? `&cursor=${cursor}` : ""}`).set(bearer(fin.token));
      expect(list.status).toBe(200);
      me = (list.body.items as C[]).find((c) => c.id === creatorId);
      cursor = list.body.nextCursor as string | null;
    } while (!me && cursor);
    expect(me?.payoutMonths).toEqual([
      { month: back(3), earnedKobo: 500000, payoutStatus: "succeeded", due: false },
      { month: back(2), earnedKobo: 300000, payoutStatus: "failed", due: true },
      { month: back(1), earnedKobo: 2000000, payoutStatus: null, due: true },
      { month: thisMonth, earnedKobo: 100000, payoutStatus: null, due: false },
    ]);
  });
});
