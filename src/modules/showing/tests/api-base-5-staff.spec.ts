import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { account, B12App, b13App, bearer, liveWish, staffOf } from "./b13-kit";

/** API-BASE-5 case 5 (R14 and the staff gaps), through the real routes. */
describe("API-BASE-5 staff and money (through the real routes)", () => {
  let t: B12App;
  let db: PrismaService;
  beforeAll(async () => {
    t = await b13App();
    db = t.db;
    const root = join(__dirname, "../../../..");
    const r = spawnSync(process.execPath, [join(root, "scripts/seed.mjs")], { cwd: root, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  });
  afterAll(() => t.close());
  const setting = (choice: Record<string, unknown>) => db.$executeRaw`UPDATE settings SET choice = ${JSON.stringify(choice)}::jsonb WHERE key = to_jsonb('payout.thresholdKobo'::text)`;
  const put = (token: string, key: string, body: Record<string, unknown>) => t.http().put(`/v1/admin/prices/${key}`).set(bearer(token)).send({ sku: key, ...body });

  describe("the payout day", () => {
    it("PUT /v1/admin/prices/payout.thresholdKobo takes payoutDay (1 to 28) with or without the threshold, and the line reads it back", async () => {
      const owner = await staffOf(t, "owner");
      const finance = await staffOf(t, "finance");
      const key = "payout.thresholdKobo";
      await setting({ value: 500000, unit: "kobo", schedule: "the 5th of each month", status: "PROVISIONAL" });
      const day = await put(finance.token, key, { payoutDay: 12, reason: "Moved the run" });
      expect(day.status).toBe(200);
      expect(day.body).toMatchObject({ key, payoutDay: 12, price: 500000, per: "the 12th of each month" });
      const both = await put(owner.token, key, { priceKobo: 600000, payoutDay: 21, reason: "Both together" });
      expect(both.body).toMatchObject({ price: 600000, payoutDay: 21, per: "the 21st of each month", lead: "CONFIRMED" });
      const list = await t.http().get("/v1/admin/prices?limit=50").set(bearer(owner.token));
      const line = (list.body.items as { key: string; payoutDay?: number }[]).find((i) => i.key === key);
      expect(line?.payoutDay).toBe(21);
      for (const bad of [0, 29, 2.5, "5"]) {
        const r = await put(owner.token, key, { payoutDay: bad, reason: "Not a day" });
        expect([bad, r.status]).toEqual([bad, 422]);
      }
      expect((await put(owner.token, key, { payoutDay: 21, reason: "Same again" })).status).toBe(409);
      expect((await put(owner.token, key, { listKobo: 1, payoutDay: 3, reason: "Mixed" })).status).toBe(422);
      expect((await t.http().put(`/v1/admin/prices/${key}`).set(bearer((await staffOf(t, "support")).token)).send({ sku: key, payoutDay: 3, reason: "No role" })).status).toBe(403);
    });

    it("the monthly run reads the day: nextRunDay and the run service use the stored day (5 when none)", async () => {
      const { nextRunDay } = await import("../../payouts/run-day");
      expect(nextRunDay(new Date("2027-01-02T00:00:00Z"), 12).toISOString()).toBe("2027-01-12T08:00:00.000Z");
      expect(nextRunDay(new Date("2027-01-13T00:00:00Z"), 12).toISOString()).toBe("2027-02-12T08:00:00.000Z");
      expect(nextRunDay(new Date("2027-01-02T00:00:00Z")).toISOString()).toBe("2027-01-05T08:00:00.000Z");
      const { PayoutRunService } = await import("../../payouts/payout-run.service");
      const runs = t.app.get(PayoutRunService);
      await setting({ value: 500000, day: 9, status: "PROVISIONAL" });
      expect(await runs.runDay()).toBe(9);
      await setting({ value: 500000, status: "PROVISIONAL" });
      expect(await runs.runDay()).toBe(5);
    });
  });

  describe("the price book's versions", () => {
    it("owner, ops and finance read who made each version and when; other roles 403; paged newest first", async () => {
      const finance = await staffOf(t, "finance");
      const r = await t.http().get("/v1/admin/price-book-versions?limit=1").set(bearer(finance.token));
      expect(r.status).toBe(200);
      expect(r.body.items).toHaveLength(1);
      const first = r.body.items[0] as { version: number; createdBy: string; createdAt: string; by: string; at: string };
      expect(first.createdBy).toEqual(expect.any(String));
      expect(new Date(first.createdAt).toString()).not.toBe("Invalid Date");
      expect([first.by, first.at]).toEqual([first.createdBy, first.createdAt]);
      if (r.body.nextCursor) {
        const next = await t.http().get(`/v1/admin/price-book-versions?limit=1&cursor=${r.body.nextCursor}`).set(bearer(finance.token));
        expect(next.body.items[0].version).toBeLessThan(first.version);
      }
      for (const role of ["owner", "ops"] as const) expect((await t.http().get("/v1/admin/price-book-versions").set(bearer((await staffOf(t, role)).token))).status).toBe(200);
      for (const role of ["support", "moderator", "reviewer", "maker"] as const) expect((await t.http().get("/v1/admin/price-book-versions").set(bearer((await staffOf(t, role)).token))).status).toBe(403);
      expect((await t.http().get("/v1/admin/price-book-versions")).status).toBe(401);
    });
  });

  describe("the payments list takes a state, the businesses list a search", () => {
    it("GET /v1/admin/payments?state= narrows by the state the row reads; an unknown state is 422", async () => {
      const finance = await staffOf(t, "finance");
      const payer = await account(t, ["person"]);
      const mk = async (status: string, ref: string) => {
        const id = t.id();
        await db.payment.create({
          data: { id, accountId: payer.accountId, providerReference: ref, idempotencyKey: `k-${ref}`, purpose: "ticket", status: status as never, amountKobo: 500000n, currency: "NGN", flags: [], options: {}, subjectId: null, lines: [], priceBookVersion: 1, provider: "paystack" } as never,
        });
        return id;
      };
      const run = `${process.pid}${Date.now() % 100000}`;
      const failed = await mk("failed", `ab5-f-${run}`);
      const paid = await mk("succeeded", `ab5-s-${run}`);
      const sent = await mk("succeeded", `ab5-r-${run}`);
      await db.refund.create({ data: { id: t.id(), paymentId: sent, amountKobo: 500000n, status: "sent", reason: "staff_decision", requestedBy: (await staffOf(t, "finance")).id, createdAt: t.clock.now() } as never });
      const ids = async (state: string) => ((await t.http().get(`/v1/admin/payments?limit=50&state=${state}`).set(bearer(finance.token))).body.items as { ref?: string; reference?: string; id?: string }[]).map((i) => i.reference ?? i.ref);
      expect(await ids("failed")).toContain(`ab5-f-${run}`);
      expect(await ids("failed")).not.toContain(`ab5-s-${run}`);
      expect(await ids("succeeded")).toContain(`ab5-s-${run}`);
      expect(await ids("succeeded")).not.toContain(`ab5-r-${run}`); // a payment with a refund sent reads refund-started
      expect(await ids("refund-started")).toContain(`ab5-r-${run}`);
      expect(await ids("partly-refunded")).not.toContain(`ab5-s-${run}`);
      const bad = await t.http().get("/v1/admin/payments?state=nope").set(bearer(finance.token));
      expect(bad.status).toBe(422);
      expect(JSON.stringify(bad.body)).toContain("state");
      expect([failed, paid].length).toBe(2);
    });

    it("GET /v1/admin/businesses?q= finds by part of the name or the owner's email, in any case", async () => {
      const ops = await staffOf(t, "ops");
      const run = `${process.pid}${Date.now() % 100000}`;
      const owner = await account(t, ["person", "business"]);
      await db.business.create({ data: { id: t.id(), accountId: owner.accountId, name: `Zanzibar Frames ${run}` } });
      const other = await account(t, ["person", "business"]);
      await db.business.create({ data: { id: t.id(), accountId: other.accountId, name: `Plain Shop ${run}` } });
      const names = async (q: string) => ((await t.http().get(`/v1/admin/businesses?limit=50&q=${encodeURIComponent(q)}`).set(bearer(ops.token))).body.items as { name?: string }[]).map((i) => i.name);
      expect(await names(`zanzibar frames ${run}`)).toEqual([`Zanzibar Frames ${run}`]);
      expect(await names("BAR FRAMES")).toContain(`Zanzibar Frames ${run}`);
      expect(await names(owner.email.toUpperCase())).toEqual([`Zanzibar Frames ${run}`]);
      expect(await names(`no-such-business-${run}`)).toEqual([]);
      expect((await t.http().get("/v1/admin/businesses?limit=50").set(bearer(ops.token))).body.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("staff acts that repeat answer 409 with words", () => {
    it("erasing an erased person again is 409; a second ban of the same scope is 409 (the action and POST /admin/bans); a ban after a lift is allowed", async () => {
      const owner = await staffOf(t, "owner");
      const person = await account(t, ["person"]);
      const act = (id: string, body: Record<string, unknown>) => t.http().post(`/v1/admin/people/${id}/actions`).set(bearer(owner.token)).send(body);
      const ban1 = await act(person.accountId, { action: "ban", reason: "Abuse in notes" });
      expect(ban1.status).toBe(200);
      const ban2 = await act(person.accountId, { action: "ban", reason: "Abuse in notes again" });
      expect(ban2.status).toBe(409);
      expect(ban2.body.error.message).toMatch(/already banned/i);
      const ban3 = await t.http().post("/v1/admin/bans").set(bearer(owner.token)).send({ accountId: person.accountId, scope: "account", reason: "Same scope again" });
      expect(ban3.status).toBe(409);
      expect((await act(person.accountId, { action: "lift", reason: "Mistake" })).status).toBe(200);
      expect((await act(person.accountId, { action: "ban", reason: "Banned again after the lift" })).status).toBe(200);
      const erase1 = await act(person.accountId, { action: "erase", reason: "Asked to be forgotten" });
      expect(erase1.status).toBe(200);
      const erase2 = await act(person.accountId, { action: "erase", reason: "Asked a second time" });
      expect(erase2.status).toBe(409);
      expect(erase2.body.error.message).toMatch(/erased/i);
    });

    it("taking down a wish that is already down is 409; so is taking down an erased one", async () => {
      const mod = await staffOf(t, "moderator");
      const owner = await account(t, ["person"]);
      const w = await liveWish(t, owner);
      const act = (no: string, action: string) => t.http().post(`/v1/admin/wishes/${no}/actions`).set(bearer(mod.token)).send({ action, reason: "Against the rules" });
      expect((await act(w.no, "take_down")).status).toBe(200);
      const again = await act(w.no, "take_down");
      expect(again.status).toBe(409);
      expect(again.body.error.message).toMatch(/already taken down/i);
      expect((await act(w.no, "restore")).status).toBe(200);
      expect((await act(w.no, "take_down")).status).toBe(200);
      const gone = await liveWish(t, owner);
      await db.wish.update({ where: { id: gone.id }, data: { erasedAt: t.clock.now() } });
      expect((await act(gone.no, "take_down")).status).toBe(409);
    });
  });

  describe("staff wish search", () => {
    it("finds a wish by its number in any case and by a piece of the owner's email; nothing for a piece too short", async () => {
      const support = await staffOf(t, "support");
      const owner = await account(t, ["person"]);
      const w = await liveWish(t, owner);
      const no = `FW-ab5${String(process.pid).slice(-4)}${Date.now() % 1000}X`;
      await db.wish.update({ where: { id: w.id }, data: { no } });
      const find = async (q: string) => ((await t.http().get(`/v1/admin/wishes?limit=50&q=${encodeURIComponent(q)}`).set(bearer(support.token))).body.items as { no: string }[]).map((i) => i.no);
      for (const q of [no, no.toLowerCase(), no.toUpperCase(), `#${no.toLowerCase()}`]) expect([q, await find(q)]).toEqual([q, [no]]);
      const piece = owner.email.slice(owner.email.indexOf("-") + 1, owner.email.indexOf("@")).toUpperCase();
      expect(await find(piece)).toEqual([no]);
      expect(await find(owner.email.toUpperCase())).toEqual([no]);
      expect(await find("zz")).toEqual([]);
    });
  });
});
