import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import type { StaffRole } from "../../../common/auth/principal";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { holdSettingLock } from "../../../../test/kit/setting-lock";
import { EntitlementsService, grantOf } from "../entitlements.service";
import { PayoutRunService } from "../../payouts/payout-run.service";
import { PriceAdminService } from "../price-admin.service";
import { PriceBookService } from "../price-book.service";

const ROOT = join(__dirname, "../../../..");
const NOW = new Date("2026-12-01T09:00:00.000Z");
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

interface Line {
  sku: string;
  price: number;
  listKobo: number;
  promoKobo: number | null;
  version: number;
  kind: string;
  value: unknown;
  lead: string;
  items: unknown[];
}

describe("price book (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let book: PriceBookService;
  const staffIds: Record<string, string> = {};

  const readAll = async (): Promise<Line[]> => {
    const out: Line[] = [];
    let cursor: string | null = null;
    do {
      const r = await t.http().get("/v1/price-book").query(cursor ? { limit: 10, cursor } : { limit: 10 });
      expect(r.status).toBe(200);
      out.push(...(r.body.items as Line[]));
      cursor = r.body.nextCursor;
    } while (cursor);
    return out;
  };
  const line = async (sku: string) => (await readAll()).find((l) => l.sku === sku) as Line;
  const put = (token: string, key: string, body: Record<string, unknown>) =>
    t.http().put(`/v1/admin/prices/${key}`).set(bearer(token)).send({ sku: key, reason: "Price review", ...body });

  let releaseSetting: () => Promise<void>;
  beforeAll(async () => {
    releaseSetting = await holdSettingLock();
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    book = t.app.get(PriceBookService);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
    for (const role of ["owner", "finance", "ops", "support"] as StaffRole[]) {
      staffIds[role] = ids.next();
      t.tokens.set(role, { kind: "staff", staffId: staffIds[role], roles: [role] });
    }
    t.tokens.set("person", { kind: "user", accountId: ids.next(), sides: ["person"] });
    t.tokens.set("business", { kind: "user", accountId: ids.next(), sides: ["person", "business"] });
  });
  afterAll(async () => {
    await t.close();
    await releaseSetting();
  });

  describe("E-125 GET /v1/price-book", () => {
    it("is public: every seeded line in kobo with price now and list price, the promotion, lifecycle terms and entitlements", async () => {
      const r = await t.http().get("/v1/price-book").query({ limit: 50 });
      expect(r.status).toBe(200);
      expect(r.body.version).toBe(1);
      expect(r.body.items).toHaveLength(24);
      expect(r.body.nextCursor).toBeNull();
      const moment = (r.body.items as Line[]).find((l) => l.sku === "ticket.moment");
      expect(moment).toMatchObject({ key: "ticket.moment", price: 300000, value: 300000, listKobo: 500000, was: 500000, promoKobo: 300000, kind: "naira", version: 1 });
      const keep = (r.body.items as Line[]).find((l) => l.sku === "keep.year");
      expect(keep).toMatchObject({ price: 600000, listKobo: 600000, promoKobo: null, discountable: false });
      expect(r.body.promotion).toMatchObject({ percentOff: 40, endsAt: "2027-01-31T23:00:00.000Z", endsOn: "2027-01-31", label: "40% off until 31 January" });
      expect(r.body.promotion.appliesTo).not.toContain("keep.month");
      expect(r.body.lifecycle).toMatchObject({ HOLD_DAYS: 365, RESTORE_DAYS: 30, TERM_DAYS: { moment: 7, premiere: 60 } });
      expect(r.body.entitlements).toMatchObject({ passWishes: 20, keepsakeExtrasCeilingKobo: 750000 });
      expect(r.headers.etag).toBeDefined();
      expect(r.headers["cache-control"]).toMatch(/public, max-age=60/);
    });

    it("every seeded price equals the web app's, in kobo (the verifier's table); concierge.rush is gone (Z2)", async () => {
      const web: Record<string, [number, number | null]> = {
        "ticket.moment": [500000, 300000], "ticket.keepsake": [1000000, 600000], "ticket.signature": [2000000, 1200000], "ticket.premiere": [3500000, 2100000],
        "extra.five-photos": [200000, 120000], "extra.premium-style": [400000, 240000], "extra.portrait-video": [350000, 210000],
        "extra.qr-card": [250000, 150000], "extra.clip-15s": [250000, 150000], "extra.clip-60s": [500000, 300000],
        "keep.month": [150000, null], "keep.half": [400000, null], "keep.year": [600000, null],
        "pass.year": [3500000, 2000000], "concierge.single": [2500000, 1500000],
        "pro.starter": [5800000, 3500000], "pro.studio": [17500000, 10500000], "pro.pack": [2900000, 1750000],
        "vault.block": [300000, null], "vault.block-bulk": [250000, null],
        "creator.plan": [750000, null], "creator.signed": [500000, null], "creator.credit-pack": [300000, null], "creator.extra-review": [250000, null],
      };
      const all = await readAll();
      expect(all.map((l) => l.sku).sort()).toEqual(Object.keys(web).sort());
      for (const l of all) {
        expect([l.sku, l.listKobo, l.promoKobo]).toEqual([l.sku, web[l.sku][0], web[l.sku][1]]);
        expect(l.price).toBe(web[l.sku][1] ?? web[l.sku][0]);
      }
    });

    it("answers 304 to the same ETag", async () => {
      const a = await t.http().get("/v1/price-book");
      const b = await t.http().get("/v1/price-book").set("If-None-Match", String(a.headers.etag));
      expect(b.status).toBe(304);
    });

    it("pages with a cursor and refuses a bad limit or cursor with fields", async () => {
      const all = await readAll();
      expect(all).toHaveLength(24);
      expect(new Set(all.map((l) => l.sku)).size).toBe(24);
      const bad = await t.http().get("/v1/price-book").query({ limit: 0 });
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields.limit).toBeDefined();
      const cur = await t.http().get("/v1/price-book").query({ cursor: "not-ours" });
      expect(cur.status).toBe(422);
      expect(cur.body.error.fields.cursor).toBeDefined();
    });

    it("after the promotion's end the same request returns list prices, decided by the server's clock alone", async () => {
      const before = await t.http().get("/v1/price-book").query({ limit: 50 });
      t.clock.set(new Date("2027-01-31T22:59:59.000Z"));
      const last = await t.http().get("/v1/price-book").query({ limit: 50 });
      expect((last.body.items as Line[]).find((l) => l.sku === "ticket.moment")?.price).toBe(300000);
      expect(Number(/max-age=(\d+)/.exec(String(last.headers["cache-control"]))?.[1])).toBeLessThanOrEqual(1);
      t.clock.set(new Date("2027-01-31T23:00:00.000Z"));
      const after = await t.http().get("/v1/price-book").query({ limit: 50 });
      t.clock.set(NOW);
      expect(after.body.version).toBe(1);
      expect(after.body.promotion).toBeNull();
      for (const l of after.body.items as Line[]) expect(l.price).toBe(l.listKobo);
      expect(after.headers.etag).not.toBe(before.headers.etag);
    });

    it("B04: after the offer ends the public line drops promoKobo; while it runs the line carries it; staff still see the stored one", async () => {
      const moment = (r: { body: { items: Line[] } }) => r.body.items.find((l) => l.sku === "ticket.moment") as Line;
      expect(moment(await t.http().get("/v1/price-book").query({ limit: 50 })).promoKobo).toBe(300000);
      t.clock.set(new Date("2027-01-31T23:00:00.000Z"));
      try {
        const ended = moment(await t.http().get("/v1/price-book").query({ limit: 50 }));
        expect(ended).toMatchObject({ promoKobo: null, price: 500000, listKobo: 500000 });
        const staff = await t.http().get("/v1/admin/prices").set(bearer("owner")).query({ limit: 50 });
        expect((staff.body.items as Line[]).find((l) => l.sku === "ticket.moment")?.promoKobo).toBe(300000);
      } finally {
        t.clock.set(NOW);
      }
    });
  });

  describe("price.quote", () => {
    it("prices every seeded line per line; the total is the sum to the kobo; keeps are never discounted", async () => {
      const v = await book.versionAt(NOW);
      for (let round = 0; round < 20; round++) {
        const lines = v.lines.map((l, i) => ({ sku: l.sku, qty: 1 + ((i * 7 + round * 3) % 5) }));
        const q = await book.quote(lines, NOW);
        expect(q.version).toBe(1);
        expect(q.versionId).toBe(v.id);
        expect(q.totalKobo).toBe(q.lines.reduce((s, l) => s + l.totalKobo, 0));
        for (const ql of q.lines) {
          const bl = v.lines.find((l) => l.sku === ql.sku)!;
          expect(ql.totalKobo).toBe(ql.unitKobo * ql.qty);
          expect(Number.isInteger(ql.unitKobo)).toBe(true);
          expect([Number(bl.listKobo), bl.promoKobo === null ? -1 : Number(bl.promoKobo)]).toContain(ql.unitKobo);
          if (ql.sku.startsWith("keep.") || ql.sku.startsWith("vault.")) expect(ql.unitKobo).toBe(ql.listKobo);
        }
      }
      const after = await book.quote(v.lines.map((l) => ({ sku: l.sku })), new Date("2027-02-02T00:00:00Z"));
      for (const l of after.lines) expect(l.unitKobo).toBe(l.listKobo);
    });

    it("refuses an unknown line or a bad quantity with 422", async () => {
      await expect(book.quote([{ sku: "ticket.nope" }], NOW)).rejects.toMatchObject({ status: 422 });
      await expect(book.quote([{ sku: "ticket.moment", qty: 0 }], NOW)).rejects.toMatchObject({ status: 422 });
      await expect(book.quote([], NOW)).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("entitlements", () => {
    it("every line the book sells has an entitlement row, and for(sku) reads it", async () => {
      const ent = t.app.get(EntitlementsService);
      const row = await ent.row();
      const v = await book.versionAt(NOW);
      const missing = v.lines.filter((l) => grantOf(row, l.sku) === null).map((l) => l.sku);
      expect(missing).toEqual([]);
      expect(await ent.for("ticket.premiere")).toMatchObject({ termDays: 60, photos: 20, clips: 3, video: true, styleLevel: "premium" });
      expect(await ent.for("pro.studio")).toMatchObject({ wishes: 35, vaultGb: 500 });
      expect(await ent.for("keep.half")).toMatchObject({ termDays: 182 });
      expect(await ent.for("pass.year")).toMatchObject({ wishes: 20, upgrades: 4 });
      await expect(ent.for("ticket.nope")).rejects.toThrow(/no entitlement/);
    });
  });

  describe("E-213 GET /v1/ticket-offers", () => {
    const offer = (q: string) => t.http().get(`/v1/ticket-offers${q}`).set(bearer("business"));

    it("401 without a token, 403 for a person or staff", async () => {
      expect((await t.http().get("/v1/ticket-offers?ticket=ticket.moment")).status).toBe(401);
      expect((await t.http().get("/v1/ticket-offers?ticket=ticket.moment").set(bearer("person"))).status).toBe(403);
      expect((await t.http().get("/v1/ticket-offers?ticket=ticket.moment").set(bearer("owner"))).status).toBe(403);
    });

    it("X13: a ticket and repeated extras answer ONE quote from the book: lines in kobo, the total, the version used", async () => {
      const r = await offer("?ticket=ticket.keepsake&extras=extra.five-photos&extras=extra.qr-card");
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(["lines", "listTotalKobo", "totalKobo", "version", "versionId"]);
      expect(r.body.version).toBe(1);
      expect((r.body.lines as { sku: string }[]).map((l) => l.sku)).toEqual(["ticket.keepsake", "extra.five-photos", "extra.qr-card"]);
      expect(r.body.lines[0]).toMatchObject({ qty: 1, listKobo: 1000000, unitKobo: 600000, totalKobo: 600000, discounted: true });
      expect(r.body.totalKobo).toBe(600000 + 120000 + 150000);
      expect(r.body.listTotalKobo).toBe(1000000 + 200000 + 250000);
      expect(r.body.totalKobo).toBe((r.body.lines as { totalKobo: number }[]).reduce((s, l) => s + l.totalKobo, 0));
      const one = await offer("?ticket=ticket.keepsake&extras=extra.qr-card");
      expect(one.body.totalKobo).toBe(750000);
      const bare = await offer("?ticket=ticket.moment");
      expect(bare.body).toMatchObject({ totalKobo: 300000, listTotalKobo: 500000 });
      t.clock.set(new Date("2027-02-01T00:00:00Z"));
      const later = await offer("?ticket=ticket.moment");
      t.clock.set(NOW);
      expect(later.body.totalKobo).toBe(500000);
      // the price never comes from the request: a price in the query is refused
      const sneaky = await offer("?ticket=ticket.moment&totalKobo=1&price=1");
      expect(sneaky.status).toBe(422);
    });

    it("X13: an unknown line, a missing ticket, an extra the ticket does not take, a repeat or a Keepsake past its ceiling is 422 with the field", async () => {
      const unknown = await offer("?ticket=ticket.nope");
      expect(unknown.status).toBe(422);
      expect(unknown.body.error.fields.ticket).toBeDefined();
      expect((await offer("?ticket=keep.year")).status).toBe(422);
      expect((await offer("")).status).toBe(422);
      const extra = await offer("?ticket=ticket.keepsake&extras=extra.nope");
      expect(extra.status).toBe(422);
      expect(extra.body.error.fields["extras[0]"]).toBeDefined();
      expect((await offer("?ticket=ticket.moment&extras=extra.five-photos")).status).toBe(422);
      const twice = await offer("?ticket=ticket.keepsake&extras=extra.qr-card&extras=extra.qr-card");
      expect(twice.status).toBe(422);
      const ceiling = await offer("?ticket=ticket.keepsake&extras=extra.five-photos&extras=extra.premium-style&extras=extra.portrait-video");
      expect(ceiling.status).toBe(422);
      expect(ceiling.body.error.fields.extras).toBe("Too many extras for a Keepsake.");
    });
  });

  describe("E-123 GET /v1/admin/prices", () => {
    it("owner, finance and ops read every line plus the offer's end and the PROVISIONAL payout threshold", async () => {
      for (const who of ["owner", "finance", "ops"]) {
        const r = await t.http().get("/v1/admin/prices").set(bearer(who)).query({ limit: 50 });
        expect(r.status).toBe(200);
        expect(r.body.items).toHaveLength(26);
        const payout = (r.body.items as Line[]).find((l) => l.sku === "payout.thresholdKobo");
        expect(payout).toMatchObject({ kind: "naira", value: 500000, lead: "PROVISIONAL", group: "payout" });
        const end = (r.body.items as Line[]).find((l) => l.sku === "promotion.endsAt");
        expect(end).toMatchObject({ kind: "date", value: "2027-01-31T23:00:00.000Z" });
      }
    });

    it("401 without a token; 403 for support or a user", async () => {
      expect((await t.http().get("/v1/admin/prices")).status).toBe(401);
      expect((await t.http().get("/v1/admin/prices").set(bearer("support"))).status).toBe(403);
      expect((await t.http().get("/v1/admin/prices").set(bearer("person"))).status).toBe(403);
    });
  });

  describe("E-124 PUT /v1/admin/prices/:key", () => {
    it("finance changes a price: a new published version, old versions untouched, one audit row", async () => {
      const r = await put("finance", "extra.qr-card", { priceKobo: 140000, reason: "  Printer costs fell  " });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ sku: "extra.qr-card", price: 140000, promoKobo: 140000, listKobo: 250000, version: 2, changed: true });
      expect((await line("extra.qr-card")).price).toBe(140000);
      const v1 = await db.price.findUnique({ where: { sku_version: { sku: "extra.qr-card", version: 1 } } });
      expect(v1?.promoKobo).toBe(150000n);
      const old = await book.quote([{ sku: "extra.qr-card" }], NOW, { version: 1 });
      expect(old.totalKobo).toBe(150000);
      const audit = await db.auditEntry.findMany({ where: { subjectId: "extra.qr-card", action: "price.change" } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: staffIds.finance, section: "/admin/prices", reason: "Printer costs fell" });
      const list = await t.http().get("/v1/admin/prices").set(bearer("owner")).query({ limit: 50 });
      expect((list.body.items as Line[]).find((l) => l.sku === "extra.qr-card")).toMatchObject({ changed: true, reason: "Printer costs fell" });
    });

    it("Z4: a new list price leaves the price now alone; a keep's price is its list price", async () => {
      const r = await put("owner", "ticket.moment", { listKobo: 600001 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ listKobo: 600001, promoKobo: 300000, price: 300000 });
      const k = await put("owner", "keep.month", { priceKobo: 160000 });
      expect(k.body).toMatchObject({ listKobo: 160000, promoKobo: null, price: 160000 });
    });

    it("ops and support may not change; 401 without a token", async () => {
      expect((await put("ops", "extra.qr-card", { priceKobo: 1 })).status).toBe(403);
      expect((await put("support", "extra.qr-card", { priceKobo: 1 })).status).toBe(403);
      expect((await t.http().put("/v1/admin/prices/extra.qr-card").send({ sku: "extra.qr-card", priceKobo: 1, reason: "abcd" })).status).toBe(401);
    });

    it("422 with fields: short reason, nothing to change, a float, a sku that is not the path's; 404 for an unknown line", async () => {
      const short = await put("owner", "extra.qr-card", { priceKobo: 100, reason: " ab " });
      expect(short.status).toBe(422);
      expect(short.body.error.fields.reason).toBeDefined();
      const none = await put("owner", "extra.qr-card", {});
      expect(none.status).toBe(422);
      const float = await put("owner", "extra.qr-card", { priceKobo: 1500.5 });
      expect(float.status).toBe(422);
      expect(float.body.error.fields.priceKobo).toBeDefined();
      const other = await put("owner", "extra.qr-card", { sku: "extra.clip-15s", priceKobo: 100 });
      expect(other.status).toBe(422);
      expect(other.body.error.fields.sku).toBeDefined();
      const above = await put("owner", "extra.qr-card", { priceKobo: 999999999 });
      expect(above.status).toBe(422);
      expect((await put("owner", "extra.nope", { priceKobo: 100 })).status).toBe(404);
      const before = await db.priceBookVersion.count();
      expect(before).toBeGreaterThan(0);
    });

    it("two staff changing prices at once both land in order; no version holds half of each", async () => {
      const start = (await book.latestPublished()).version;
      const [a, b] = await Promise.all([
        put("owner", "extra.clip-15s", { priceKobo: 140001 }),
        put("finance", "extra.clip-60s", { priceKobo: 280001 }),
      ]);
      const codes = [a.status, b.status].sort();
      expect(codes.every((c) => c === 200 || c === 409)).toBe(true);
      expect(codes).toContain(200);
      const latest = await book.latestPublished();
      const landed = codes.filter((c) => c === 200).length;
      expect(latest.version).toBe(start + landed);
      for (let v = start + 1; v <= latest.version; v++) {
        const prev = await book.load(v - 1);
        const cur = await book.load(v);
        const diff = cur.lines.filter((l) => {
          const p = prev.lines.find((x) => x.sku === l.sku)!;
          return p.listKobo !== l.listKobo || p.promoKobo !== l.promoKobo;
        });
        expect(diff).toHaveLength(1);
      }
      if (landed === 2) {
        expect(latest.lines.find((l) => l.sku === "extra.clip-15s")!.promoKobo).toBe(140001n);
        expect(latest.lines.find((l) => l.sku === "extra.clip-60s")!.promoKobo).toBe(280001n);
      }
    });

    it("the payout threshold changes through the same book; finance leaves it PROVISIONAL", async () => {
      const r = await put("finance", "payout.thresholdKobo", { priceKobo: 600000 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ value: 600000, lead: "PROVISIONAL" });
      expect(await t.app.get(PriceAdminService).payoutThreshold()).toMatchObject({ valueKobo: 600000, status: "PROVISIONAL" });
      expect(await db.auditEntry.count({ where: { subjectId: "payout.thresholdKobo" } })).toBe(1);
      expect((await put("finance", "payout.thresholdKobo", { listKobo: 1 })).status).toBe(422);
    });

    it("the offer can end sooner (a new version; old versions keep their end) but is never extended", async () => {
      const later = await put("owner", "promotion.endsAt", { promotionEndsAt: "2027-03-01T00:00:00Z" });
      expect(later.status).toBe(422);
      expect(later.body.error.fields.promotionEndsAt).toBeDefined();
      const before = (await book.latestPublished()).version;
      const r = await put("owner", "promotion.endsAt", { promotionEndsAt: "2026-12-20T23:00:00+00:00" });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ kind: "date", value: "2026-12-20T23:00:00.000Z", lead: "40% off until 20 December", version: before + 1 });
      const lateDec = new Date("2026-12-21T09:00:00Z");
      const nowV = await book.quote([{ sku: "ticket.keepsake" }], lateDec);
      expect(nowV.totalKobo).toBe(1000000);
      const oldV = await book.quote([{ sku: "ticket.keepsake" }], lateDec, { version: before });
      expect(oldV.totalKobo).toBe(600000);
    });
  });

  describe("E-126 / E-127 price-book versions", () => {
    let draftId = "";
    let draftVersion = 0;

    it("finance drafts a version (201, one audit row); bad lines are 422 with fields", async () => {
      const bad = await t.http().post("/v1/admin/price-book-versions").set(bearer("finance"))
        .send({ effectiveFrom: "2026-11-29T00:00:00Z", note: "x", prices: [{ sku: "ticket.nope", listKobo: 1 }], reason: "New year prices" });
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields["prices[0].sku"]).toBeDefined();
      const r = await t.http().post("/v1/admin/price-book-versions").set(bearer("finance"))
        .send({ effectiveFrom: "2026-11-30T00:00:00Z", note: " Signature up ", prices: [{ sku: "ticket.signature", listKobo: 2100000 }], reason: "New year prices" });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ note: "Signature up", name: expect.stringContaining("draft") });
      draftId = r.body.key;
      draftVersion = r.body.version;
      expect(await db.auditEntry.count({ where: { subjectId: draftId, action: "price-book.draft" } })).toBe(1);
      expect((await t.http().post("/v1/admin/price-book-versions").set(bearer("ops")).send({})).status).toBe(403);
      expect((await t.http().post("/v1/admin/price-book-versions").send({})).status).toBe(401);
    });

    it("only the owner publishes; a wrong version is 409; a non-uuid id 404; then it is the book", async () => {
      const pub = (who: string, id: string, version: number) =>
        t.http().post(`/v1/admin/price-book-versions/${id}/publish`).set(bearer(who)).send({ version, reason: "Approved by owner" });
      expect((await pub("finance", draftId, draftVersion)).status).toBe(403);
      expect((await pub("owner", draftId, draftVersion + 9)).status).toBe(409);
      expect((await pub("owner", "not-a-uuid", draftVersion)).status).toBe(404);
      const r = await pub("owner", draftId, draftVersion);
      expect(r.status).toBe(200);
      expect(r.body.version).toBe(draftVersion);
      expect((await pub("owner", draftId, draftVersion)).status).toBe(409);
      const sig = await line("ticket.signature");
      expect(sig).toMatchObject({ listKobo: 2100000, version: draftVersion });
    });
  });

  describe("rulings of the B04 patch", () => {
    const counts = async () => ({ versions: await db.priceBookVersion.count(), audit: await db.auditEntry.count({ where: { action: "price.change" } }) });
    const list = async (who = "owner") => (await t.http().get("/v1/admin/prices").set(bearer(who)).query({ limit: 50 })).body.items as Line[];
    const get = async (sku: string) => (await list()).find((l) => l.sku === sku) as Line;

    it("X14: the public book is {version, items, promotion, lifecycle, entitlements, nextCursor}; items are Price lines", async () => {
      const r = await t.http().get("/v1/price-book").query({ limit: 5 });
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(["entitlements", "items", "lifecycle", "nextCursor", "payout", "promotion", "version"]);
      expect(typeof r.body.version).toBe("number");
      expect(r.body.items).toHaveLength(5);
      expect(typeof r.body.nextCursor).toBe("string");
      for (const l of r.body.items as Line[]) expect(l).toMatchObject({ key: expect.any(String), sku: expect.any(String), kind: "naira", value: expect.any(Number), version: expect.any(Number) });
      expect(r.body.promotion).toMatchObject({ percentOff: 40 });
      expect(r.body.lifecycle).toMatchObject({ HOLD_DAYS: 365 });
      expect(r.body.entitlements).toMatchObject({ passWishes: 20 });
    });

    it("X15: value is kobo for kind naira and an ISO time for kind date; the date line carries no kobo fields", async () => {
      const items = await list();
      for (const l of items) {
        if (l.kind === "naira") expect(Number.isSafeInteger(l.value)).toBe(true);
        else expect(String(l.value)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
      const end = items.find((l) => l.sku === "promotion.endsAt") as Line & { was: unknown };
      expect(end).toMatchObject({ kind: "date", price: null, was: null });
      expect(items.filter((l) => l.kind === "date")).toHaveLength(1);
      const payout = items.find((l) => l.sku === "payout.thresholdKobo") as Line;
      expect(payout).toMatchObject({ kind: "naira", value: payout.price });
      const q = items.find((l) => l.sku === "ticket.moment") as Line;
      expect(q.value).toBe(q.price);
    });

    it("X16: ops reads the prices and cannot change one, draft or publish; owner and finance change", async () => {
      expect((await t.http().get("/v1/admin/prices").set(bearer("ops"))).status).toBe(200);
      expect((await put("ops", "extra.qr-card", { priceKobo: 100000 })).status).toBe(403);
      expect((await t.http().post("/v1/admin/price-book-versions").set(bearer("ops")).send({})).status).toBe(403);
      expect((await put("finance", "extra.qr-card", { priceKobo: 145000 })).status).toBe(200);
      expect((await put("owner", "extra.qr-card", { priceKobo: 146000 })).status).toBe(200);
    });

    it("X17: the offer's end moves sooner only: later is 422, the same end is 409, a past end is 422; old versions keep their end", async () => {
      const cur = (await get("promotion.endsAt")).value as string;
      const c0 = await counts();
      const later = await put("owner", "promotion.endsAt", { promotionEndsAt: new Date(Date.parse(cur) + 1000).toISOString() });
      expect(later.status).toBe(422);
      expect(later.body.error.fields.promotionEndsAt).toBeDefined();
      expect((await put("owner", "promotion.endsAt", { promotionEndsAt: "2026-11-30T00:00:00Z" })).status).toBe(422);
      const same = await put("owner", "promotion.endsAt", { promotionEndsAt: cur });
      expect(same.status).toBe(409);
      expect(same.body.error.code).toBe("not_allowed");
      expect(await counts()).toEqual(c0);
      const before = (await book.latestPublished()).version;
      const sooner = await put("finance", "promotion.endsAt", { promotionEndsAt: "2026-12-15T23:00:00Z" });
      expect(sooner.status).toBe(200);
      expect(sooner.body).toMatchObject({ kind: "date", value: "2026-12-15T23:00:00.000Z", version: before + 1 });
      expect((await book.quote([{ sku: "ticket.moment" }], new Date("2026-12-16T00:00:00Z"))).totalKobo).toBe(600001);
      expect((await book.quote([{ sku: "ticket.moment" }], new Date("2026-12-16T00:00:00Z"), { version: before })).totalKobo).toBe(300000);
    });

    it("X18: the keys the admin Prices screen reads are promotion.endsAt and payout.thresholdKobo", async () => {
      const keys = (await list()).map((l) => l.sku);
      expect(keys).toEqual(expect.arrayContaining(["promotion.endsAt", "payout.thresholdKobo"]));
    });

    it("X19: an owner's change of the payout threshold clears PROVISIONAL; finance's does not", async () => {
      const admin = t.app.get(PriceAdminService);
      expect((await admin.payoutThreshold()).status).toBe("PROVISIONAL");
      const f = await put("finance", "payout.thresholdKobo", { priceKobo: 620000 });
      expect(f.status).toBe(200);
      expect(f.body.lead).toBe("PROVISIONAL");
      const o = await put("owner", "payout.thresholdKobo", { priceKobo: 650000 });
      expect(o.status).toBe(200);
      expect(o.body).toMatchObject({ value: 650000, lead: "CONFIRMED" });
      expect(await admin.payoutThreshold()).toMatchObject({ valueKobo: 650000, status: "CONFIRMED" });
      expect(await get("payout.thresholdKobo")).toMatchObject({ lead: "CONFIRMED", value: 650000 });
      const f2 = await put("finance", "payout.thresholdKobo", { priceKobo: 660000 });
      expect(f2.body.lead).toBe("CONFIRMED");
    });

    it("Z1: a draft dated ahead is 422; a change takes effect now even when an older version is dated ahead", async () => {
      const bad = await t.http().post("/v1/admin/price-book-versions").set(bearer("finance"))
        .send({ effectiveFrom: "2026-12-02T00:00:00Z", note: "x", prices: [{ sku: "ticket.signature", listKobo: 2200000 }], reason: "Future prices" });
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields.effectiveFrom).toBeDefined();
      const latest = await book.latestPublished();
      await db.priceBookVersion.update({ where: { version: latest.version }, data: { effectiveFrom: new Date("2027-06-01T00:00:00Z") } });
      const r = await put("owner", "extra.clip-60s", { priceKobo: 290000 });
      expect(r.status).toBe(200);
      const row = await db.priceBookVersion.findUnique({ where: { version: r.body.version } });
      expect(row?.effectiveFrom.toISOString()).toBe(NOW.toISOString());
      expect((await line("extra.clip-60s")).price).toBe(290000);
      expect((await book.versionAt(NOW)).version).toBe(r.body.version);
    });

    it("Z3: a change that changes nothing is 409 not_allowed with no version and no audit row, one at a time or at once", async () => {
      const cur = (await get("extra.five-photos")).price;
      // INT-7: the threshold is set here by two real changes, whatever an earlier test left: first to a figure it is not, then to 660000.
      const now = (await get("payout.thresholdKobo")).price;
      expect((await put("finance", "payout.thresholdKobo", { priceKobo: now === 650000 ? 640000 : 650000 })).status).toBe(200);
      expect((await put("finance", "payout.thresholdKobo", { priceKobo: 660000 })).status).toBe(200);
      const c0 = await counts();
      const same = await put("owner", "extra.five-photos", { priceKobo: cur });
      expect(same.status).toBe(409);
      expect(same.body.error).toMatchObject({ code: "not_allowed", message: "That is the price now." });
      const sameList = await put("owner", "keep.year", { listKobo: 600000 });
      expect(sameList.status).toBe(409);
      expect((await put("finance", "payout.thresholdKobo", { priceKobo: 660000 })).status).toBe(409);
      expect(await counts()).toEqual(c0);
      const [a, b] = await Promise.all([put("owner", "extra.five-photos", { priceKobo: cur + 7 }), put("finance", "extra.five-photos", { priceKobo: cur + 7 })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await counts()).toEqual({ versions: c0.versions + 1, audit: c0.audit + 1 });
    });

    it("Z4: list and price now change only when named", async () => {
      const before = await line("extra.premium-style");
      expect(before).toMatchObject({ listKobo: 400000, promoKobo: 240000 });
      const p = await put("owner", "extra.premium-style", { priceKobo: 230000 });
      expect(p.body).toMatchObject({ listKobo: 400000, promoKobo: 230000, price: 230000 });
      const l = await put("owner", "extra.premium-style", { listKobo: 450000 });
      expect(l.body).toMatchObject({ listKobo: 450000, promoKobo: 230000, price: 230000 });
      const both = await put("owner", "extra.premium-style", { listKobo: 500000, priceKobo: 250000 });
      expect(both.body).toMatchObject({ listKobo: 500000, promoKobo: 250000 });
      const low = await put("owner", "extra.premium-style", { listKobo: 200000 });
      expect(low.status).toBe(422);
      expect(low.body.error.fields.listKobo).toBeDefined();
      expect((await line("extra.premium-style")).listKobo).toBe(500000);
      const above = await put("owner", "extra.premium-style", { priceKobo: 600000 });
      expect(above.status).toBe(422);
      expect(above.body.error.fields.priceKobo).toBeDefined();
    });

    it("parallel: eight changes to eight lines at once land one after the other; no version mixes two", async () => {
      const skus = ["ticket.signature", "ticket.premiere", "extra.portrait-video", "extra.clip-15s", "pro.pack", "pass.year", "concierge.single", "pro.starter"];
      const start = (await book.latestPublished()).version;
      const res = await Promise.all(skus.map((sku, i) => put(i % 2 ? "owner" : "finance", sku, { priceKobo: 100000 + i })));
      expect(res.every((r) => r.status === 200 || r.status === 409)).toBe(true);
      const landed = res.filter((r) => r.status === 200).length;
      expect(landed).toBeGreaterThan(0);
      const latest = await book.latestPublished();
      expect(latest.version).toBe(start + landed);
      for (let v = start + 1; v <= latest.version; v++) {
        const prev = await book.load(v - 1);
        const cur = await book.load(v);
        const diff = cur.lines.filter((l) => {
          const x = prev.lines.find((o) => o.sku === l.sku)!;
          return x.listKobo !== l.listKobo || x.promoKobo !== l.promoKobo;
        });
        expect(diff).toHaveLength(1);
      }
      res.forEach((r, i) => {
        if (r.status === 200) expect(latest.lines.find((l) => l.sku === skus[i])!.promoKobo).toBe(BigInt(100000 + i));
      });
    });
  });

  /** API-BASE-5 (R14): the payout day, last in this file because the earlier test counts the audit rows of this line. */
  describe("API-BASE-5 the payout day", () => {
    it("PUT /v1/admin/prices/payout.thresholdKobo takes payoutDay (1 to 28) with or without the threshold, and the line reads it back", async () => {
            const key = "payout.thresholdKobo";
      await db.$executeRaw`UPDATE settings SET choice = ${JSON.stringify({ value: 500000, unit: "kobo", schedule: "the 5th of each month", status: "PROVISIONAL" })}::jsonb WHERE key = to_jsonb('payout.thresholdKobo'::text)`;
      const day = await put("finance", key, { payoutDay: 12, reason: "Moved the run" });
      expect(day.status).toBe(200);
      expect(day.body).toMatchObject({ key, payoutDay: 12, price: 500000, per: "the 12th of each month" });
      const both = await put("owner", key, { priceKobo: 600000, payoutDay: 21, reason: "Both together" });
      expect(both.body).toMatchObject({ price: 600000, payoutDay: 21, per: "the 21st of each month", lead: "CONFIRMED" });
      const list = await t.http().get("/v1/admin/prices?limit=50").set(bearer("owner"));
      const line = (list.body.items as { key: string; payoutDay?: number }[]).find((i) => i.key === key);
      expect(line?.payoutDay).toBe(21);
      for (const bad of [0, 29, 2.5, "5"]) {
        const r = await put("owner", key, { payoutDay: bad, reason: "Not a day" });
        expect([bad, r.status]).toEqual([bad, 422]);
      }
      expect((await put("owner", key, { payoutDay: 21, reason: "Same again" })).status).toBe(409);
      expect((await put("owner", key, { listKobo: 1, payoutDay: 3, reason: "Mixed" })).status).toBe(422);
      expect((await t.http().put(`/v1/admin/prices/${key}`).set(bearer("support")).send({ sku: key, payoutDay: 3, reason: "No role" })).status).toBe(403);
    });

  });
  describe("API-BASE-7 the payout setting in the price-book read (HW4)", () => {
    it("the read serves the payout threshold and day with the provisional mark; staff Prices changes them (audited); the payout run reads them", async () => {
      const run = t.app.get(PayoutRunService);
      const book = () => t.http().get("/v1/price-book").query({ limit: 5 });
      // this test makes its own setting (earlier tests leave the row changed): provisional, 500000, the 5th
      await db.$executeRaw`UPDATE settings SET choice = choice || ${JSON.stringify({ value: 500000, day: 5, schedule: "monthly on the 5th", status: "PROVISIONAL" })}::jsonb WHERE key = to_jsonb('payout.thresholdKobo'::text)`;
      expect((await book()).body.payout).toMatchObject({ thresholdKobo: 500000, day: 5, provisional: true, status: "PROVISIONAL" });
      const audits = await db.auditEntry.count({ where: { subjectId: "payout.thresholdKobo" } });
      const r = await put("finance", "payout.thresholdKobo", { priceKobo: 750000, payoutDay: 12, reason: "Raised after review" });
      expect(r.status).toBe(200);
      expect((await book()).body.payout).toMatchObject({ thresholdKobo: 750000, day: 12, schedule: "the 12th of each month", provisional: true });
      expect(await db.auditEntry.count({ where: { subjectId: "payout.thresholdKobo" } })).toBe(audits + 1);
      expect(await run.threshold()).toBe(750000);
      expect(await run.runDay()).toBe(12);
      // the owner role confirms: the mark goes
      expect((await put("owner", "payout.thresholdKobo", { priceKobo: 700000, reason: "Confirmed by the owner" })).status).toBe(200);
      expect((await book()).body.payout).toMatchObject({ thresholdKobo: 700000, day: 12, provisional: false, status: "CONFIRMED" });
      expect(await run.threshold()).toBe(700000);
    });
  });

});
