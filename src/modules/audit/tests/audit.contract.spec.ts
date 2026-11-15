import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { AuditService } from "../audit.service";
import { networkOf } from "../ip-network";

describe("networkOf", () => {
  it("cuts IPv4 to /24 and IPv6 to /48, never keeping the full address", () => {
    expect(networkOf("203.0.113.77")).toBe("203.0.113.0/24");
    expect(networkOf("::ffff:203.0.113.77")).toBe("203.0.113.0/24");
    expect(networkOf("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(networkOf("2001:0DB8:00ab:ffff:1:2:3:4")).toBe("2001:db8:ab::/48");
    expect(networkOf("::1")).toBe("0:0:0::/48");
    expect(networkOf("fe80::1%eth0")).toBe("fe80:0:0::/48");
    expect(networkOf("not an address")).toBeNull();
    expect(networkOf(undefined)).toBeNull();
  });
});

describe("audit helper and E-18 (contract)", () => {
  let t: TestApp;
  let db: PrismaService;
  let audit: AuditService;
  const ids = new UuidV7Maker();
  const actorId = ids.next();
  const actor = { type: "staff" as const, id: actorId, ip: "203.0.113.77", requestId: "req-b03-audit" };
  const get = (path: string, token?: string) => {
    const r = t.http().get(path);
    return token ? r.set("authorization", `Bearer ${token}`) : r;
  };

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(PrismaService);
    audit = t.app.get(AuditService);
    await seedRoleTable(db);
    t.tokens.set("owner", { kind: "staff", staffId: ids.next(), roles: ["owner"] });
    t.tokens.set("ops", { kind: "staff", staffId: ids.next(), roles: ["ops"] });
    t.tokens.set("finance", { kind: "staff", staffId: ids.next(), roles: ["finance"] });
    t.tokens.set("moderator", { kind: "staff", staffId: ids.next(), roles: ["moderator"] });
    t.tokens.set("person", { kind: "user", accountId: ids.next(), sides: ["person"] });
  });
  afterAll(() => t.close());

  it("a written change has exactly one row, with ids and field names only and the address cut", async () => {
    const subjectId = ids.next();
    await db.$transaction(async (tx) => {
      await audit.write(tx, { actor, section: "/admin/team", action: "team.test", target: { type: "Probe", id: subjectId }, reason: " because ", changedFields: ["roles"] });
    });
    const rows = await db.auditEntry.findMany({ where: { subjectId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorType: "staff", actorId, action: "team.test", subjectType: "Probe", ip: "203.0.113.0/24", requestId: "req-b03-audit" });
    // S2: section and reason are columns; after holds the field names only
    expect(rows[0]).toMatchObject({ section: "/admin/team", reason: "because" });
    expect(rows[0].after).toEqual({ fields: ["roles"] });
  });

  it("a rolled-back change leaves no audit row", async () => {
    const subjectId = ids.next();
    await expect(
      db.$transaction(async (tx) => {
        await audit.write(tx, { actor, section: "/admin/team", action: "team.test", target: { type: "Probe", id: subjectId }, reason: "rolled back", changedFields: [] });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await db.auditEntry.count({ where: { subjectId } })).toBe(0);
  });

  it("refuses a reason under 4 characters (422 on reason) and a value in place of a field name", async () => {
    const subjectId = ids.next();
    await expect(
      db.$transaction((tx) => audit.write(tx, { actor, section: "/admin/team", action: "team.test", target: { type: "Probe", id: subjectId }, reason: " abc ", changedFields: [] })),
    ).rejects.toMatchObject({ code: "validation_failed", fields: { reason: expect.any(String) } });
    await expect(
      db.$transaction((tx) => audit.write(tx, { actor, section: "/admin/team", action: "team.test", target: { type: "Probe", id: subjectId }, reason: "fine", changedFields: ["ada@example.com"] })),
    ).rejects.toThrow(/field names only/);
    expect(await db.auditEntry.count({ where: { subjectId } })).toBe(0);
  });

  it("the log is append-only", async () => {
    const subjectId = ids.next();
    await db.$transaction((tx) => audit.write(tx, { actor, section: "/admin", action: "team.test", target: { type: "Probe", id: subjectId }, reason: null, changedFields: [] }));
    await expect(db.auditEntry.updateMany({ where: { subjectId }, data: { action: "changed" } })).rejects.toThrow();
  });

  it("E-18: 401 without a token, 403 for a user or a role the table does not open; owner and ops read", async () => {
    expect((await get("/v1/admin/audit")).status).toBe(401);
    expect((await get("/v1/admin/audit", "person")).status).toBe(403);
    expect((await get("/v1/admin/audit", "moderator")).status).toBe(403);
    expect((await get("/v1/admin/audit", "finance")).status).toBe(403);
    expect((await get("/v1/admin/audit", "ops")).status).toBe(200);
    expect((await get("/v1/admin/audit", "owner")).status).toBe(200);
  });

  it("E-18: cursor pages newest first, filters by actor and subject type, and the wire shape", async () => {
    const who = ids.next();
    const mine = { ...actor, id: who };
    for (let i = 0; i < 3; i++) {
      await db.$transaction((tx) => audit.write(tx, { actor: mine, section: "/admin/team", action: `team.step-${i}`, target: { type: "PageProbe", id: ids.next() }, reason: "paging test", changedFields: ["status"] }));
    }
    const first = await get(`/v1/admin/audit?actorId=${who}&limit=2`, "owner");
    expect(first.status).toBe(200);
    expect((first.body.items as { action: string }[]).map((x) => x.action)).toEqual(["team.step-2", "team.step-1"]);
    expect(first.body.items[0]).toMatchObject({
      actorType: "staff",
      actorId: who,
      section: "/admin/team",
      reason: "paging test",
      subjectType: "PageProbe",
      ip: "203.0.113.0/24",
      what: "team.step-2 (status)",
      by: "Unknown",
    });
    expect(first.body.items[0].at).toMatch(/Z$/);
    const next = await get(`/v1/admin/audit?actorId=${who}&limit=2&cursor=${first.body.nextCursor}`, "owner");
    expect((next.body.items as { action: string }[]).map((x) => x.action)).toEqual(["team.step-0"]);
    expect(next.body.nextCursor).toBeNull();
    const bySubject = await get(`/v1/admin/audit?subjectType=PageProbe&actorId=${who}`, "ops");
    expect(bySubject.body.items).toHaveLength(3);
    expect((await get(`/v1/admin/audit?from=2000-01-01&actorId=${who}`, "ops")).body.items).toHaveLength(3);
    expect((await get(`/v1/admin/audit?from=2999-01-01&actorId=${who}`, "ops")).body.items).toHaveLength(0);
  });

  it("E-18: 422 with fields for a bad query", async () => {
    const r = await get("/v1/admin/audit?from=yesterday", "owner");
    expect(r.status).toBe(422);
    expect(r.body.error.fields.from).toBeDefined();
    expect((await get("/v1/admin/audit?limit=99", "owner")).status).toBe(422);
    expect((await get("/v1/admin/audit?cursor=junk", "owner")).status).toBe(422);
  });
});
