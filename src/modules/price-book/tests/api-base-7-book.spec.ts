import { PrismaService } from "../../../common/db/prisma.service";
import type { TestApp } from "../../../../test/kit/app";
import { boot, ids as cids } from "../../concierge/tests/kit";
import { SettlementService } from "../../payments/settlement.service";
import { holdSettingLock } from "../../../../test/kit/setting-lock";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";

const NOW = new Date("2035-02-10T09:00:00.000Z");
const HOUR = 3_600_000;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

type Kit = Awaited<ReturnType<typeof boot>>;

/** API-BASE-7 cases 4, 5 and 6 (HW4 payout values, HW6 one source for the book's limits, HW7 staff actions and typed reads). */
describe("HW6 the book's limits, HW7 staff actions", () => {
  let k: Kit;
  let t: TestApp;
  let db: PrismaService;
  const staff: Record<string, { id: string; token: string }> = {};

  let releaseSetting: () => Promise<void>;
  beforeAll(async () => {
    releaseSetting = await holdSettingLock();
    k = await boot("ab7b", NOW);
    t = k.t;
    db = k.db;
    await seedRoleTable(db);
    for (const [name, roles] of [["finance", ["finance"]], ["owner", ["owner"]], ["moderator", ["moderator"]], ["support", ["support"]]] as const) {
      const s = await makeStaff(db, [...roles]);
      const token = `ab7b-${s.id}`;
      t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [...roles] });
      staff[name] = { id: s.id, token };
    }
  });
  afterAll(async () => {
    await t.close();
    await releaseSetting();
  });
  beforeEach(() => t.clock.set(NOW));

  const book = () => t.http().get("/v1/price-book").query({ limit: 50 });

  it("5. Concierge delivery hours and the photo limit come from the book in the read AND in the code that acts on them: change one and both move", async () => {
    const row = await db.lifecycleConfig.findFirstOrThrow({ orderBy: { id: "desc" } });
    const first = (await book()).body;
    expect(first.lifecycle).toMatchObject({ conciergeDeliveryHours: 3, photoMaxBytes: 15 * 1024 * 1024, soundMaxBytes: 10 * 1024 * 1024, modelMaxBytes: 15 * 1024 * 1024, unopenedDays: 365 });
    const single = (first.items as { sku: string; conciergeDeliveryHours: number }[]).find((i) => i.sku === "concierge.single");
    expect(single?.conciergeDeliveryHours).toBe(3);
    expect((first.items as { conciergeDeliveryHours: number }[]).every((i) => i.conciergeDeliveryHours === 3)).toBe(true);
    const settle = t.app.get(SettlementService);
    const order = async () => {
      const a = await k.account();
      const o = await t.http().post("/v1/concierge-orders").set("Authorization", a.auth).send({ brief: "A wish for my mother", count: 1, kind: "single", rush: false });
      expect(o.status).toBe(201);
      const s = await t.http().post("/v1/payments").set("Authorization", a.auth).set("Idempotency-Key", `ab7b-${cids.next()}`).send({ purpose: "concierge", subjectId: o.body.id });
      expect(s.status).toBe(201);
      const out = await settle.settle({ reference: s.body.payment.reference, status: "success", amountKobo: BigInt(s.body.payment.amountKobo), currency: "NGN", paidAt: t.clock.now() });
      expect(out.outcome).toBe("fulfilled");
      return (await db.conciergeOrder.findUniqueOrThrow({ where: { id: o.body.id } })).deliverBy as Date;
    };
    expect((await order()).getTime()).toBe(NOW.getTime() + 3 * HOUR);
    const wishPhoto = (bytes: number) => k.account().then(async (a) => t.http().post("/v1/uploads").set("Authorization", a.auth).send({ purpose: "photo", contentType: "image/png", bytes }));
    expect((await wishPhoto(2000)).status).toBe(201);
    try {
      await db.lifecycleConfig.update({ where: { id: row.id }, data: { conciergeDeliveryHours: 5, photoMaxBytes: 1000 } });
      const moved = (await book()).body;
      expect(moved.lifecycle).toMatchObject({ conciergeDeliveryHours: 5, photoMaxBytes: 1000 });
      expect((moved.items as { conciergeDeliveryHours: number }[]).every((i) => i.conciergeDeliveryHours === 5)).toBe(true);
      expect((await order()).getTime()).toBe(NOW.getTime() + 5 * HOUR);
      expect((await wishPhoto(2000)).status).toBe(422);
      expect((await wishPhoto(1000)).status).toBe(201);
    } finally {
      await db.lifecycleConfig.update({ where: { id: row.id }, data: { conciergeDeliveryHours: row.conciergeDeliveryHours, photoMaxBytes: row.photoMaxBytes } });
    }
  });

  it("6. the staff session read gives per-section actions for the role; the numbers, payment and person reads are typed", async () => {
    type Row = { id: string; actions: Record<string, string[]>; sections: string[] };
    const rows: Row[] = [];
    let cursor: string | null = null;
    do {
      const page = await t.http().get("/v1/admin/team").set(auth(staff.owner.token)).query({ limit: 50, ...(cursor ? { cursor } : {}) });
      expect(page.status).toBe(200);
      rows.push(...(page.body.items as Row[]));
      cursor = page.body.nextCursor as string | null;
    } while (cursor);
    const by = (id: string) => rows.find((i) => i.id === id);
    // HX5: every staff write the role may do is listed (the whole walk is in api-base-7-patch.spec.ts); the named ones keep their names
    expect(by(staff.moderator.id)?.actions).toMatchObject({ "/admin/wishes": ["take_down", "restore"] });
    expect(by(staff.moderator.id)?.actions["/admin/people"]).toContain("ban");
    expect(by(staff.finance.id)?.actions).toMatchObject({ "/admin/creators": ["mark_paid", "approve_run"], "/admin/numbers": ["set_target"] });
    expect(by(staff.support.id)?.actions).toMatchObject({ "/admin/wishes": ["extend", "resend"] });
    expect(Object.keys(by(staff.owner.id)?.actions ?? {})).toEqual(expect.arrayContaining(["/admin/creators", "/admin/numbers", "/admin/people", "/admin/wishes", "/admin/prices"]));
    // every section named in actions is one the role opens
    for (const m of [staff.moderator, staff.finance, staff.support]) expect(Object.keys(by(m.id)?.actions ?? {}).every((s) => by(m.id)?.sections.includes(s))).toBe(true);
    const numbers = await t.http().get("/v1/admin/numbers").set(auth(staff.finance.token));
    expect(numbers.status).toBe(200);
    expect(Array.isArray(numbers.body.opens)).toBe(true);
    expect(Array.isArray(numbers.body.kinds)).toBe(true);
    expect(typeof numbers.body.targets).toBe("object");
  });
});
