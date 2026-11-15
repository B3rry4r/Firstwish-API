import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import type { StaffRole } from "../../../common/auth/principal";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { EntitlementsService, grantOf } from "../entitlements.service";
import { PriceAdminService } from "../price-admin.service";
import { PriceBookService } from "../price-book.service";
import { PublicBookService } from "../public-book.service";

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

  beforeAll(async () => {
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
  afterAll(() => t.close());

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
    it("401 without a token, 403 for a person or staff", async () => {
      expect((await t.http().get("/v1/ticket-offers")).status).toBe(401);
      expect((await t.http().get("/v1/ticket-offers").set(bearer("person"))).status).toBe(403);
      expect((await t.http().get("/v1/ticket-offers").set(bearer("owner"))).status).toBe(403);
    });

    it("gives each ticket's total from the book with the extras it takes", async () => {
      const r = await t.http().get("/v1/ticket-offers").set(bearer("business"));
      expect(r.status).toBe(200);
      expect((r.body.items as { adds: { ticket: string } }[]).map((o) => o.adds.ticket)).toEqual(["ticket.moment", "ticket.keepsake", "ticket.signature", "ticket.premiere"]);
      expect(r.body.items[0]).toMatchObject({ ok: true, total: 300000, was: 500000 });
      expect((r.body.items as { adds: { takes: { sku: string }[] } }[])[1].adds.takes.map((x) => x.sku)).toContain("extra.qr-card");
      const p = await t.http().get("/v1/ticket-offers").set(bearer("business")).query({ limit: 2 });
      expect(p.body.items).toHaveLength(2);
      const p2 = await t.http().get("/v1/ticket-offers").set(bearer("business")).query({ limit: 2, cursor: p.body.nextCursor });
      expect(p2.body.items[0].adds.ticket).toBe("ticket.signature");
    });

    it("a ticket plus extras is totalled from the book; an unknown line is 422; a Keepsake past its ceiling is not ok", async () => {
      const pub = t.app.get(PublicBookService);
      const o = await pub.offerFor("ticket.keepsake", ["extra.five-photos", "extra.qr-card"]);
      expect(o).toMatchObject({ ok: true, total: 600000 + 120000 + 150000, was: 1000000 + 200000 + 250000 });
      await expect(pub.offerFor("ticket.keepsake", ["extra.nope"])).rejects.toMatchObject({ status: 422 });
      await expect(pub.offerFor("keep.year", [])).rejects.toMatchObject({ status: 422 });
      const ceiling = await pub.offerFor("ticket.keepsake", ["extra.five-photos", "extra.premium-style", "extra.portrait-video"]);
      expect(ceiling).toMatchObject({ ok: false, why: "Too many extras for a Keepsake." });
      const notTaken = await pub.offerFor("ticket.moment", ["extra.five-photos"]);
      expect(notTaken.ok).toBe(false);
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

    it("a new list price on a discountable line sets the promoted price at the promotion's percent; a keep's price is its list price", async () => {
      const r = await put("owner", "ticket.moment", { listKobo: 600001 });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ listKobo: 600001, promoKobo: 360001, price: 360001 });
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

    it("the payout threshold changes through the same book and stays PROVISIONAL", async () => {
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
        .send({ effectiveFrom: "2026-12-05T00:00:00Z", note: "x", prices: [{ sku: "ticket.nope", listKobo: 1 }], reason: "New year prices" });
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
});
