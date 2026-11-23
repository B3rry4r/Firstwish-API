import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { makeStaff, seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-05-03T09:00:00.000Z");
const ids = new UuidV7Maker();
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
type Role = "support" | "finance" | "moderator" | "maker" | "reviewer" | "ops" | "owner";

/** API-BASE-15 case 2 (W14B check): only staff whose role opens Support are offered and accepted; a hand-over of a thread that changed hands is 409. */
describe("API-BASE-15 W14B: the support hand-over", () => {
  let t: TestApp;
  let db: PrismaService;
  beforeAll(async () => {
    t = await createTestApp({ now: NOW });
    db = t.app.get(PrismaService);
    await seedRoleTable(db);
  });
  afterAll(() => t.close());

  const staff = async (role: Role, status: "active" | "suspended" | "removed" = "active") => {
    const s = await makeStaff(db, [role], status);
    const token = `ab15s-${RUN}-${s.id}`;
    t.tokens.set(token, { kind: "staff", staffId: s.id, roles: [role] });
    return { id: s.id, token };
  };
  const thread = async (assigneeId: string | null = null) => {
    const id = ids.next();
    await db.supportThread.create({ data: { id, accountId: null, contact: `ab15-${RUN}-${id}@example.com`, subject: "s", status: "open", priority: "normal", body: "b", text: "b", assigneeId, createdAt: NOW, updatedAt: NOW } });
    return id;
  };
  const give = (token: string, th: string, body: Record<string, unknown>) => t.http().post(`/v1/admin/support-threads/${th}/assignee`).set(bearer(token)).send({ reason: "hand it over", ...body });

  it("the list offers, and the hand-over accepts, only a role that can open Support; finance, moderator, maker and reviewer are neither", async () => {
    const me = await staff("support");
    const ok = { support: await staff("support"), ops: await staff("ops"), owner: await staff("owner") };
    const no = { finance: await staff("finance"), moderator: await staff("moderator"), maker: await staff("maker"), reviewer: await staff("reviewer") };
    const list = await t.http().get("/v1/admin/support/staff").set(bearer(me.token));
    expect(list.status).toBe(200);
    const offered = new Set((list.body.items as { id: string }[]).map((x) => x.id));
    for (const [role, s] of Object.entries(ok)) expect([role, offered.has(s.id)]).toEqual([role, true]);
    for (const [role, s] of Object.entries(no)) expect([role, offered.has(s.id)]).toEqual([role, false]);
    for (const [role, s] of Object.entries(no)) {
      const th = await thread();
      const r = await give(me.token, th, { assigneeId: s.id });
      expect([role, r.status]).toEqual([role, 422]);
      expect(r.body.error.fields.assigneeId).toMatch(/opens Support/);
      expect((await db.supportThread.findUniqueOrThrow({ where: { id: th } })).assigneeId).toBeNull();
    }
    const th = await thread();
    expect((await give(me.token, th, { assigneeId: ok.support.id })).status).toBe(200);
    // a member who is suspended or removed stays refused, and is not offered
    for (const status of ["suspended", "removed"] as const) {
      const gone = await staff("support", status);
      expect(offered.has(gone.id)).toBe(false);
      expect((await give(me.token, await thread(), { assigneeId: gone.id })).status).toBe(422);
    }
  });

  it("a hand-over of a thread that changed hands since the caller read it is 409 in words; the holder it saw goes through; without it, as today", async () => {
    const a = await staff("support");
    const b = await staff("support");
    const c = await staff("support");
    const th = await thread();
    // the caller saw no holder: it goes through
    expect((await give(a.token, th, { assigneeId: b.id, expectedAssignee: "" })).status).toBe(200);
    // another handed it to c meanwhile; a still thinks b holds it
    expect((await give(c.token, th, { assigneeId: c.id, expectedAssignee: b.id })).status).toBe(200);
    const stale = await give(a.token, th, { assigneeId: a.id, expectedAssignee: b.id });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("thread_changed_hands");
    expect(stale.body.error.message).toMatch(/Someone else handed this thread over/);
    expect((await db.supportThread.findUniqueOrThrow({ where: { id: th } })).assigneeId).toBe(c.id);
    expect(await db.auditEntry.count({ where: { subjectId: th, action: "support.assign" } })).toBe(2);
    // seen as none but now held: 409; a bad value: 422; left out: the last hand-over wins as today
    expect((await give(a.token, th, { assigneeId: a.id, expectedAssignee: "" })).status).toBe(409);
    expect((await give(a.token, th, { assigneeId: a.id, expectedAssignee: "nope" })).status).toBe(422);
    expect((await give(a.token, th, { assigneeId: a.id })).status).toBe(200);
    expect((await db.supportThread.findUniqueOrThrow({ where: { id: th } })).assigneeId).toBe(a.id);
    // 20 at once from the same read: one wins
    const t2 = await thread(b.id);
    const res = await Promise.all(Array.from({ length: 20 }, () => give(a.token, t2, { assigneeId: c.id, expectedAssignee: b.id })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(res.filter((r) => r.status === 409)).toHaveLength(19);
  }, 120_000);

  // CI run 437: a hand-over that lost the race once answered 503 (P2024): each held a pool connection while it waited on the thread row,
  // and its role check asked the pool for another. The role check now reads inside the transaction, so every loser answers in words.
  it("30 rounds of 20 hand-overs at once from the same read: every round is one 200 and nineteen 409 thread_changed_hands", async () => {
    const a = await staff("support");
    const b = await staff("support");
    const c = await staff("support");
    const th = await thread(b.id); // one thread, handed back to b each round, so the shared open-thread count moves once
    for (let round = 0; round < 30; round++) {
      await db.supportThread.update({ where: { id: th }, data: { assigneeId: b.id } });
      const res = await Promise.all(Array.from({ length: 20 }, () => give(a.token, th, { assigneeId: c.id, expectedAssignee: b.id })));
      expect(res.filter((r) => r.status === 200)).toHaveLength(1);
      const lost = res.filter((r) => r.status !== 200);
      expect(lost).toHaveLength(19);
      for (const r of lost) {
        expect(r.status).toBe(409);
        expect(r.body.error.code).toBe("thread_changed_hands");
      }
    }
  }, 300_000);
});
