import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { DiscoveryService, ModulesContainer } from "@nestjs/core";
import { ACCESS, type Access } from "../../../common/auth/decorators";
import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { holdSettingLock } from "../../../../test/kit/setting-lock";
import { boot, ids as cids } from "../../concierge/tests/kit";
import { SettlementService } from "../../payments/settlement.service";
import { STAFF_ACTIONS, STAFF_SECTION, staffWrites } from "../../role-access/staff-section.guard";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { readLimits } from "../book-limits";

const NOW = new Date("2035-03-10T09:00:00.000Z");
const HOUR = 3_600_000;
const MB = 1024 * 1024;
const ROLES = ["moderator", "finance", "support", "owner", "ops", "reviewer", "maker"] as const;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-7 patch: HX1 (staff Prices moves every value the book serves), HX5 (the session read's actions are the routes' own table). */
describe("HX1 staff Prices and HX5 session actions", () => {
  let k: Kit;
  let t: TestApp;
  let db: PrismaService;
  const staff: Record<string, { id: string; token: string }> = {};
  let releaseSetting: () => Promise<void>;
  let startVersion = 0;
  beforeAll(async () => {
    releaseSetting = await holdSettingLock();
    k = await boot("ab7q", NOW);
    t = k.t;
    db = k.db;
    startVersion = (await db.priceBookVersion.aggregate({ _max: { version: true } }))._max.version ?? 0;
    await seedRoleTable(db);
    for (const name of ROLES) {
      const s = await makeStaff(db, [name]);
      const token = `ab7q-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [name] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(async () => {
    try {
      // the run's database is shared with specs that count versions: take away the versions this file's changes made (audit rows are append-only and stay)
      await db.price.deleteMany({ where: { version: { gt: startVersion } } });
      await db.priceBookVersion.deleteMany({ where: { version: { gt: startVersion } } });
    } finally {
      await t.close();
      await releaseSetting();
    }
  });
  beforeEach(() => t.clock.set(NOW));

  const put = (role: string, key: string, body: Record<string, unknown>) =>
    t.http().put(`/v1/admin/prices/${key}`).set(auth(staff[role].token)).send({ sku: key, reason: "Checked with the owner", ...body });
  const book = () => t.http().get("/v1/price-book").query({ limit: 50 });
  const lines = async () => {
    const r = await t.http().get("/v1/admin/prices").query({ limit: 50 }).set(auth(staff.finance.token));
    expect(r.status).toBe(200);
    return r.body.items as { key: string; kind: string; value: number; version: number }[];
  };

  it("HX1 every limit the book serves is changed through the staff route, audited, and the read and the code move together", async () => {
    const before = await lines();
    const keys = ["limits.photoMaxBytes", "limits.soundMaxBytes", "limits.modelMaxBytes", "limits.conciergeDeliveryHours", "limits.unopenedDays", "payout.thresholdKobo"];
    for (const key of keys) expect(before.map((l) => l.key)).toContain(key);
    expect(before.find((l) => l.key === "limits.photoMaxBytes")?.kind).toBe("bytes");
    expect(before.find((l) => l.key === "limits.conciergeDeliveryHours")?.kind).toBe("hours");
    expect(before.find((l) => l.key === "limits.unopenedDays")?.kind).toBe("days");

    // only the roles that change prices: finance and owner
    for (const role of ["moderator", "support", "ops", "reviewer"]) expect((await put(role, "limits.photoMaxBytes", { value: 2 * MB })).status).toBe(403);
    // a limit line takes value alone, inside its range; the value it has is no change
    expect((await put("finance", "limits.photoMaxBytes", { priceKobo: 5 })).status).toBe(422);
    expect((await put("finance", "limits.photoMaxBytes", { value: 5 })).status).toBe(422);
    expect((await put("finance", "limits.conciergeDeliveryHours", { value: 0 })).status).toBe(422);
    expect((await put("finance", "limits.unopenedDays", { value: 1.5 })).status).toBe(422);
    expect((await put("finance", "limits.soundMaxBytes", { value: 10 * MB })).status).toBe(409);
    expect((await put("finance", "soundMaxBytes", { value: 2 * MB })).status).toBe(422);
    expect((await put("finance", "ticket.keepsake", { value: 2 * MB })).status).toBe(422);

    const original = Object.fromEntries(before.filter((l) => l.key.startsWith("limits.")).map((l) => [l.key, l.value]));
    try {
      const version0 = (await book()).body.version as number;
      const changes: [string, number][] = [["limits.photoMaxBytes", 2 * MB], ["limits.soundMaxBytes", 3 * MB], ["limits.modelMaxBytes", 4 * MB], ["limits.conciergeDeliveryHours", 5], ["limits.unopenedDays", 400]];
      for (const [i, [key, value]] of changes.entries()) {
        const r = await put(i % 2 ? "owner" : "finance", key, { value });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ key, value, changed: true, reason: "Checked with the owner" });
        const audit = await db.auditEntry.findMany({ where: { section: "/admin/prices", subjectType: "price", subjectId: key } });
        expect(audit).toHaveLength(1);
      }
      // a new version for each change, as for a price
      expect(((await book()).body.version as number) - version0).toBe(changes.length);

      // the read the book serves
      const served = (await book()).body;
      expect(served.lifecycle).toMatchObject({ photoMaxBytes: 2 * MB, soundMaxBytes: 3 * MB, modelMaxBytes: 4 * MB, conciergeDeliveryHours: 5, unopenedDays: 400 });
      expect((served.items as { conciergeDeliveryHours: number }[]).every((i) => i.conciergeDeliveryHours === 5)).toBe(true);
      const staffLines = await lines();
      for (const [key, value] of changes) expect(staffLines.find((l) => l.key === key)?.value).toBe(value);
      // the code that acts on them reads the same numbers
      expect(await readLimits(db)).toMatchObject({ photoMaxBytes: 2 * MB, soundMaxBytes: 3 * MB, modelMaxBytes: 4 * MB, conciergeDeliveryHours: 5, unopenedDays: 400 });
      const a = await k.account();
      const ticket = (purpose: string, type: string, bytes: number) => t.http().post("/v1/uploads").set("Authorization", a.auth).send({ purpose, contentType: type, bytes }).then((x) => x.status);
      expect(await ticket("photo", "image/png", 2 * MB)).toBe(201);
      expect(await ticket("photo", "image/png", 2 * MB + 1)).toBe(422);
      expect(await ticket("sound", "audio/mpeg", 3 * MB)).toBe(201);
      expect(await ticket("sound", "audio/mpeg", 3 * MB + 1)).toBe(422);
      expect(await ticket("model", "model/gltf-binary", 4 * MB)).toBe(201);
      expect(await ticket("model", "model/gltf-binary", 4 * MB + 1)).toBe(422);
      const o = await t.http().post("/v1/concierge-orders").set("Authorization", a.auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false });
      const p = await t.http().post("/v1/payments").set("Authorization", a.auth).set("Idempotency-Key", `ab7q-${cids.next()}`).send({ purpose: "concierge", subjectId: o.body.id });
      const out = await t.app.get(SettlementService).settle({ reference: p.body.payment.reference, status: "success", amountKobo: BigInt(p.body.payment.amountKobo), currency: "NGN", paidAt: t.clock.now() });
      expect(out.outcome).toBe("fulfilled");
      expect(((await db.conciergeOrder.findUniqueOrThrow({ where: { id: o.body.id } })).deliverBy as Date).getTime()).toBe(NOW.getTime() + 5 * HOUR);
    } finally {
      // the run's database is shared: put each limit back through the same route
      for (const [key, value] of Object.entries(original)) if ((await lines()).find((l) => l.key === key)?.value !== value) expect((await put("finance", key, { value })).status).toBe(200);
    }
  });

  it("HX1 the payout threshold and day move through the same route, by the roles that change prices, with the read", async () => {
    const first = (await book()).body.payout as { thresholdKobo: number; day: number };
    expect((await put("support", "payout.thresholdKobo", { priceKobo: 600000 })).status).toBe(403);
    expect((await put("ops", "payout.thresholdKobo", { priceKobo: 600000 })).status).toBe(403);
    try {
      const r = await put("finance", "payout.thresholdKobo", { priceKobo: 654321, payoutDay: 17 });
      expect([r.status, r.body.error?.code]).toEqual([200, undefined]);
      expect((await book()).body.payout).toMatchObject({ thresholdKobo: 654321, day: 17 });
      expect(await db.auditEntry.count({ where: { section: "/admin/prices", subjectId: "payout.thresholdKobo", action: "price.change" } })).toBeGreaterThanOrEqual(1);
    } finally {
      // the run's database is shared: put the figure and the day back
      expect((await put("finance", "payout.thresholdKobo", { priceKobo: first.thresholdKobo, payoutDay: first.day })).status).toBe(200);
    }
    expect((await book()).body.payout).toMatchObject({ thresholdKobo: first.thresholdKobo, day: first.day });
  });

  it("HX5 the session read lists, per section, every staff write the role may do, and every staff write answers as the read says", async () => {
    // the writes, found from the routes' own metadata (not from the registry the read draws on)
    const found: { method: number; path: string; section: string; handler: string; roles: readonly string[]; table: Record<string, readonly string[]> | null }[] = [];
    for (const w of new DiscoveryService(t.app.get(ModulesContainer, { strict: false })).getControllers()) {
      if (!w.metatype || !w.instance) continue;
      const base = Reflect.getMetadata(PATH_METADATA, w.metatype) as string;
      const proto = Object.getPrototypeOf(w.instance) as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const fn = proto[name];
        if (typeof fn !== "function") continue;
        const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
        const section = Reflect.getMetadata(STAFF_SECTION, fn) as string | undefined;
        if (method === undefined || method === 0 || section === undefined) continue;
        const access = Reflect.getMetadata(ACCESS, fn) as Access;
        const sub = Reflect.getMetadata(PATH_METADATA, fn) as string;
        found.push({ method, path: `/v1/${base}/${sub}`.replace(/\/+/g, "/").replace(/\/$/, ""), section, handler: name, roles: access.kind === "staff" ? access.roles : [], table: (Reflect.getMetadata(STAFF_ACTIONS, fn) as Record<string, readonly string[]>) ?? null });
      }
    }
    expect(found.length).toBeGreaterThan(40);
    // the table the read draws on is the same set of routes
    expect(staffWrites().length).toBe(found.length);
    expect(new Set(found.map((f) => `${f.section} ${f.handler}`)).size).toBe(found.length);

    type Row = { id: string; actions: Record<string, string[]>; sections: string[] };
    const rows: Row[] = [];
    let cursor: string | null = null;
    do {
      const page = await t.http().get("/v1/admin/team").set(auth(staff.owner.token)).query({ limit: 50, ...(cursor ? { cursor } : {}) });
      expect(page.status).toBe(200);
      rows.push(...(page.body.items as Row[]));
      cursor = page.body.nextCursor as string | null;
    } while (cursor);

    const Z = "00000000-0000-4000-8000-000000000000";
    const fill = (p: string) => p.replace(/:[A-Za-z]+/g, (m) => (m === ":key" ? "x" : m === ":no" || m === ":slug" || m === ":reference" || m === ":creator" ? "1" : m === ":date" ? "2035-03-11" : Z));
    const verb = ["get", "post", "put", "delete", "patch"];
    const mismatches: string[] = [];
    let walked = 0;
    for (const role of ROLES) {
      const row = rows.find((r) => r.id === staff[role].id) as Row;
      expect(Object.keys(row.actions).every((s) => row.sections.includes(s))).toBe(true);
      for (const w of found) {
        const calls = w.table ? Object.keys(w.table).map((a) => ({ name: a, body: { action: a, reason: "Checked with the owner" } })) : [{ name: w.handler.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(), body: {} as Record<string, unknown> }];
        for (const c of calls) {
          const res = await (t.http() as unknown as Record<string, (u: string) => import("supertest").Test>)[verb[w.method]](fill(w.path)).set(auth(staff[role].token)).send(c.body);
          const listed = (row.actions[w.section] ?? []).includes(c.name);
          const denied = res.status === 403;
          walked++;
          if (denied === listed) mismatches.push(`${role} ${verb[w.method]} ${w.path} ${c.name}: read says ${listed ? "may" : "may not"}, route answered ${res.status}`);
        }
      }
    }
    expect(walked).toBeGreaterThan(300);
    expect(mismatches).toEqual([]);
    // the old tables still stand: a moderator bans, support extends and resends, finance marks paid and sets targets
    const by = (id: string) => rows.find((r) => r.id === id)?.actions ?? {};
    expect(by(staff.moderator.id)["/admin/wishes"]).toEqual(["take_down", "restore"]);
    expect(by(staff.moderator.id)["/admin/people"]).toContain("ban");
    expect(by(staff.support.id)["/admin/wishes"]).toEqual(["extend", "resend"]);
    expect(by(staff.finance.id)["/admin/creators"]).toEqual(["mark_paid", "approve_run"]);
    expect(by(staff.finance.id)["/admin/numbers"]).toEqual(["set_target"]);
    expect(by(staff.finance.id)["/admin/prices"]).toEqual(expect.arrayContaining(["change", "draft"]));
    expect(by(staff.ops.id)["/admin/prices"]).toBeUndefined();
  });
});
