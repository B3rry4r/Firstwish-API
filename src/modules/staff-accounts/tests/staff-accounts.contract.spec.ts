import type { StaffAccount as StaffRow } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { StaffAccountsService } from "../staff-accounts.service";
import { createStaffApp, makeStaff, signIn, StaffApp, tag, tokenFor } from "./staff-kit";

describe("staff accounts and staff sign-in (contract)", () => {
  let t: StaffApp;
  let owner: StaffRow;
  let ownerToken: string;
  const auditFor = (subjectId: string) => t.db.auditEntry.findMany({ where: { subjectId } });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  // The last-owner rule counts every active owner, so this spec runs on a database of its own: another spec running at the same
  // time (the integration rulings sign owners in) would otherwise make "the only owner" false. A copy of the migrated template.
  const script = join(__dirname, "../../../../scripts/db.mjs");
  const ownDb = `${process.env.TEST_DB_PREFIX || "fw"}_test_owners_${process.pid}`;
  const savedUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = execFileSync("node", [script, "create", ownDb, process.env.TEST_DB_PREFIX || "fw"], { encoding: "utf8" }).trim();
    t = await createStaffApp();
    owner = await makeStaff(t.db, ["owner"]);
    const r = await signIn(t, owner.email);
    ownerToken = r.body.accessToken;
    t.users.set("user-token", { kind: "user", accountId: "0190f3c4-0000-7000-8000-000000000001", sides: ["person"] });
  });
  afterAll(async () => {
    await t.close();
    process.env.DATABASE_URL = savedUrl;
    execFileSync("node", [script, "drop", ownDb]);
  });

  describe("E-174 code", () => {
    it("sends a code only to a staff email; any other email gets the same answer and no email", async () => {
      const s = await makeStaff(t.db, ["support"]);
      const before = t.email.sent.length;
      const a = await t.http().post("/v1/admin/auth/code").send({ email: s.email });
      await t.settle(); // U4: the email goes after the answer
      expect(a.status).toBe(204);
      expect(t.email.sent.length).toBe(before + 1);
      expect(t.email.lastTo(s.email)?.text).toMatch(/\d{6}/);
      const stranger = `nobody-${tag()}@example.test`;
      const b = await t.http().post("/v1/admin/auth/code").send({ email: stranger });
      await t.settle(); // U4: the email goes after the answer
      expect(b.status).toBe(204);
      expect(b.text).toBe(a.text);
      expect(t.email.lastTo(stranger)).toBeUndefined();
      expect(await t.db.staffAccount.count({ where: { email: stranger } })).toBe(0);
    });

    it("a suspended member gets no code", async () => {
      const s = await makeStaff(t.db, ["support"], "suspended");
      expect((await t.http().post("/v1/admin/auth/code").send({ email: s.email })).status).toBe(204);
      await t.settle(); // U4: the email goes after the answer
      expect(t.email.lastTo(s.email)).toBeUndefined();
    });

    it("normalises a non-canonical email and refuses a bad one with fields", async () => {
      const s = await makeStaff(t.db, ["support"]);
      const r = await t.http().post("/v1/admin/auth/code").send({ email: `  ${s.email.toUpperCase()} ` });
      await t.settle(); // U4: the email goes after the answer
      expect(r.status).toBe(204);
      expect(t.email.lastTo(s.email)).toBeDefined();
      const bad = await t.http().post("/v1/admin/auth/code").send({ email: "not-an-email" });
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields.email).toBeDefined();
    });
  });

  describe("E-176 verify", () => {
    it("opens a staff session: its own cookie with a 12 h life, a staff token and an audit row", async () => {
      const s = await makeStaff(t.db, ["moderator"], "invited");
      const r = await signIn(t, s.email);
      expect(r.status).toBe(200);
      // S5: E-176 answers {staff, accessToken, accessTokenExpiresAt}
      expect(Object.keys(r.body as object).sort()).toEqual(["accessToken", "accessTokenExpiresAt", "staff"]);
      expect(r.body.staff).toMatchObject({ id: s.id, email: s.email, roles: ["moderator"], status: "active", state: "active" });
      expect(typeof r.body.accessToken).toBe("string");
      const cookie = String(r.headers["set-cookie"]);
      expect(cookie).toMatch(/fw_staff_refresh=/);
      expect(cookie).toMatch(/Max-Age=43200/);
      expect(cookie).toMatch(/Path=\/v1\/admin\/auth/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Lax/);
      const sessions = await t.db.session.findMany({ where: { staffId: s.id } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].accountId).toBeNull();
      const life = sessions[0].expiresAt.getTime() - sessions[0].createdAt.getTime();
      expect(Math.abs(life - 12 * 3600 * 1000)).toBeLessThan(60_000);
      const audit = await auditFor(s.id);
      expect(audit.map((a) => a.action)).toEqual(["staff.sign-in"]);
    });

    it("a wrong code counts a try; after five, even the right code is refused", async () => {
      const s = await makeStaff(t.db, ["support"]);
      await t.http().post("/v1/admin/auth/code").send({ email: s.email });
      await t.settle(); // U4: the email goes after the answer
      const right = /(\d{6})/.exec(t.email.lastTo(s.email)!.text)![1];
      const wrong = right === "999999" ? "999998" : "999999";
      for (let i = 0; i < 5; i++) {
        const r = await t.http().post("/v1/admin/auth/verify").send({ email: s.email, code: wrong });
        expect(r.status).toBe(422);
        expect(r.body.error.fields.code).toBeDefined();
      }
      expect((await t.http().post("/v1/admin/auth/verify").send({ email: s.email, code: right })).status).toBe(422);
      expect(await t.db.session.count({ where: { staffId: s.id } })).toBe(0);
    });

    it("refuses a missing code with fields", async () => {
      const r = await t.http().post("/v1/admin/auth/verify").send({ email: owner.email });
      expect(r.status).toBe(422);
      expect(r.body.error.fields.code).toBeDefined();
    });
  });

  describe("tokens stay on their side", () => {
    it("a user token never opens a staff route and a staff token never opens a user route", async () => {
      expect((await t.http().get("/v1/admin/team").set(bearer("user-token"))).status).toBe(403);
      expect((await t.http().post("/v1/admin/auth/sign-out").set(bearer("user-token"))).status).toBe(403);
      expect((await t.http().get("/v1/probe-b03/user").set(bearer("user-token"))).status).toBe(200);
      expect((await t.http().get("/v1/probe-b03/user").set(bearer(ownerToken))).status).toBe(403);
      expect((await t.http().get("/v1/admin/team")).status).toBe(401);
    });
  });

  describe("the staff-role guard reads the role table", () => {
    it("team routes are the owner's; audit opens to owner and ops only", async () => {
      const ops = await tokenFor(t, ["ops"]);
      const finance = await tokenFor(t, ["finance"]);
      const support = await tokenFor(t, ["support"]);
      expect((await t.http().get("/v1/admin/team").set(bearer(ops.token))).status).toBe(403);
      expect((await t.http().post("/v1/admin/team/invite").set(bearer(ops.token)).send({ email: "x@example.test", roles: ["support"], reason: "need help" })).status).toBe(403);
      expect((await t.http().get("/v1/admin/audit").set(bearer(ops.token))).status).toBe(200);
      expect((await t.http().get("/v1/admin/audit").set(bearer(finance.token))).status).toBe(403);
      expect((await t.http().get("/v1/admin/audit").set(bearer(support.token))).status).toBe(403);
      expect((await t.http().get("/v1/admin/audit").set(bearer(ownerToken))).status).toBe(200);
    });
  });

  describe("last owner", () => {
    it("the only owner cannot be demoted or suspended, and nothing is written", async () => {
      expect(await t.db.staffAccount.count({ where: { status: "active", roles: { has: "owner" } } })).toBe(1);
      const before = (await auditFor(owner.id)).length;
      const demote = await t.http().patch(`/v1/admin/staff-accounts/${owner.id}`).set(bearer(ownerToken)).send({ roles: ["ops"], reason: "testing" });
      expect(demote.status).toBe(409);
      expect(demote.body.error.code).toBe("not_allowed");
      const suspend = await t.http().post(`/v1/admin/staff-accounts/${owner.id}/suspend`).set(bearer(ownerToken)).send({ reason: "testing" });
      expect(suspend.status).toBe(409);
      const remove = await t.http().post(`/v1/admin/team/${owner.id}/remove`).set(bearer(ownerToken)).send({ reason: "testing" });
      expect(remove.status).toBe(409);
      expect((await auditFor(owner.id)).length).toBe(before);
      expect((await t.db.staffAccount.findUniqueOrThrow({ where: { id: owner.id } })).roles).toEqual(["owner"]);
    });
  });

  describe("E-181 invite", () => {
    it("creates an invited member, emails a code and writes one audit row with the address cut to its network", async () => {
      const email = `new-${tag()}@example.test`;
      const r = await t.http()
        .post("/v1/admin/team/invite")
        .set(bearer(ownerToken))
        .set("x-forwarded-for", "198.51.100.23")
        .send({ email: ` ${email.toUpperCase()}`, roles: ["support"], reason: "  new support hire  " });
        await t.settle(); // U4: the email goes after the answer
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ email, status: "invited", state: "invited", roles: ["support"] });
      expect(t.email.lastTo(email)?.text).toMatch(/\d{6}/);
      const rows = await auditFor(r.body.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorType: "staff", actorId: owner.id, action: "team.invite", subjectType: "StaffAccount", ip: "198.51.100.0/24" });
      expect(JSON.stringify(rows[0])).not.toContain(email);
      expect(rows[0]).toMatchObject({ section: "/admin/team", reason: "new support hire" });
      expect(rows[0].after).toEqual({ fields: ["email", "name", "roles", "status"] });
      // the invited member can sign in with the code from the invite email
      const code = /(\d{6})/.exec(t.email.lastTo(email)!.text)![1];
      expect((await t.http().post("/v1/admin/auth/verify").send({ email, code })).status).toBe(200);
    });

    it("refuses a short reason before anything is written", async () => {
      const email = `short-${tag()}@example.test`;
      const before = await t.db.auditEntry.count();
      const r = await t.http().post("/v1/admin/team/invite").set(bearer(ownerToken)).send({ email, roles: ["support"], reason: " ab " });
      expect(r.status).toBe(422);
      expect(r.body.error.fields.reason).toBeDefined();
      expect(await t.db.staffAccount.count({ where: { email } })).toBe(0);
      expect(await t.db.auditEntry.count()).toBe(before);
      expect(t.email.lastTo(email)).toBeUndefined();
    });

    it("refuses the owner role, an unknown role, a bad email and a member already on the team", async () => {
      const send = (body: object) => t.http().post("/v1/admin/team/invite").set(bearer(ownerToken)).send(body);
      expect((await send({ email: `o-${tag()}@example.test`, role: "owner", reason: "testing" })).status).toBe(422);
      expect((await send({ email: `o-${tag()}@example.test`, roles: ["boss"], reason: "testing" })).status).toBe(422);
      const bad = await send({ email: "nope", roles: ["support"], reason: "testing" });
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields.email).toBeDefined();
      const dup = await send({ email: owner.email, roles: ["support"], reason: "testing" });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("already_staff");
    });
  });

  describe("E-177 change roles and E-178 suspend", () => {
    it("changes roles with one audit row; a second owner can be demoted", async () => {
      const second = await makeStaff(t.db, ["owner"]);
      const r = await t.http().patch(`/v1/admin/staff-accounts/${second.id}`).set(bearer(ownerToken)).send({ roles: ["ops", "finance", "ops"], reason: "moving to ops" });
      expect(r.status).toBe(200);
      expect(r.body.roles).toEqual(["ops", "finance"]);
      const rows = await auditFor(second.id);
      expect(rows.map((a) => a.action)).toEqual(["team.change-roles"]);
      const bad = await t.http().patch(`/v1/admin/staff-accounts/${second.id}`).set(bearer(ownerToken)).send({ roles: [], reason: "moving" });
      expect(bad.status).toBe(422);
      expect((await t.http().patch(`/v1/admin/staff-accounts/${second.id}`).set(bearer(ownerToken)).send({ roles: ["ops"], reason: "no" })).status).toBe(422);
      expect((await auditFor(second.id)).length).toBe(1);
      expect((await t.http().patch(`/v1/admin/staff-accounts/0190f3c4-0000-7000-8000-00000000abcd`).set(bearer(ownerToken)).send({ roles: ["ops"], reason: "testing" })).status).toBe(404);
    });

    it("a role change applies at once to a signed-in member", async () => {
      const m = await tokenFor(t, ["ops"]);
      expect((await t.http().get("/v1/admin/audit").set(bearer(m.token))).status).toBe(200);
      await t.http().patch(`/v1/admin/staff-accounts/${m.staff.id}`).set(bearer(ownerToken)).send({ roles: ["support"], reason: "moving to support" });
      expect((await t.http().get("/v1/admin/audit").set(bearer(m.token))).status).toBe(403);
    });

    it("suspends: sessions end at once and the member gets no new code", async () => {
      const m = await tokenFor(t, ["support"]);
      const r = await t.http().post(`/v1/admin/staff-accounts/${m.staff.id}/suspend`).set(bearer(ownerToken)).send({ reason: "on leave" });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe("suspended");
      expect((await t.http().post("/v1/admin/auth/sign-out").set(bearer(m.token))).status).toBe(401);
      expect(await t.db.session.count({ where: { staffId: m.staff.id, revokedAt: null } })).toBe(0);
      expect((await auditFor(m.staff.id)).map((a) => a.action)).toEqual(["staff.sign-in", "team.suspend"]);
    });
  });

  describe("E-180 remove", () => {
    it("ends every session at once, stops sign-in, writes one audit row; a second remove is refused", async () => {
      const m = await tokenFor(t, ["moderator"]);
      expect((await t.http().get("/v1/probe-b03/user").set(bearer(m.token))).status).toBe(403);
      const r = await t.http().post(`/v1/admin/team/${m.staff.id}/remove`).set(bearer(ownerToken)).send({ reason: "left the team" });
      expect(r.status).toBe(204);
      expect(r.text).toBe("");
      expect((await t.http().post("/v1/admin/auth/sign-out").set(bearer(m.token))).status).toBe(401);
      const mailsBefore = t.email.sent.length;
      expect((await t.http().post("/v1/admin/auth/code").send({ email: m.staff.email })).status).toBe(204);
      await t.settle(); // U4: the email goes after the answer
      expect(t.email.sent.length).toBe(mailsBefore);
      expect((await auditFor(m.staff.id)).filter((a) => a.action === "team.remove")).toHaveLength(1);
      const again = await t.http().post(`/v1/admin/team/${m.staff.id}/remove`).set(bearer(ownerToken)).send({ reason: "left the team" });
      expect(again.status).toBe(409);
      const team = await t.http().get("/v1/admin/team?limit=50").set(bearer(ownerToken));
      expect(team.status).toBe(200);
    });

    it("refuses a short reason with fields and writes nothing", async () => {
      const m = await makeStaff(t.db, ["maker"]);
      const r = await t.http().post(`/v1/admin/team/${m.id}/remove`).set(bearer(ownerToken)).send({ reason: "no" });
      expect(r.status).toBe(422);
      expect((await t.db.staffAccount.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("active");
      expect(await auditFor(m.id)).toHaveLength(0);
    });
  });

  describe("E-179 team and E-175 sign-out", () => {
    it("pages the team by name", async () => {
      const first = await t.http().get("/v1/admin/team?limit=2").set(bearer(ownerToken));
      expect(first.status).toBe(200);
      expect(first.body.items).toHaveLength(2);
      expect(typeof first.body.nextCursor).toBe("string");
      const next = await t.http().get(`/v1/admin/team?limit=2&cursor=${first.body.nextCursor}`).set(bearer(ownerToken));
      expect(next.status).toBe(200);
      expect(next.body.items[0].name >= first.body.items[1].name).toBe(true);
      expect(next.body.items[0].id).not.toBe(first.body.items[1].id);
      expect((await t.http().get("/v1/admin/team?limit=0").set(bearer(ownerToken))).status).toBe(422);
    });

    it("the first-owner bootstrap does nothing once the team has an owner", async () => {
      const email = `boot-${tag()}@example.test`;
      await t.app.get(StaffAccountsService).bootstrapOwner(email);
      expect(await t.db.staffAccount.count({ where: { email } })).toBe(0);
    });

    it("sign-out ends this session at once", async () => {
      const m = await tokenFor(t, ["reviewer"]);
      const r = await t.http().post("/v1/admin/auth/sign-out").set(bearer(m.token));
      expect(r.status).toBe(204);
      expect(String(r.headers["set-cookie"])).toMatch(/fw_staff_refresh=;/);
      expect((await t.http().post("/v1/admin/auth/sign-out").set(bearer(m.token))).status).toBe(401);
      expect((await auditFor(m.staff.id)).map((a) => a.action)).toEqual(["staff.sign-in"]);
    });
  });

  describe("INT-1 round 1: V2 late reply, W2 foreign origin (staff)", () => {
    const cookieOf = (r: { headers: Record<string, unknown> }): string | null => {
      const raw = r.headers["set-cookie"];
      const c = (Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : []).find((x) => x.startsWith("fw_staff_refresh="));
      return c ? c.slice("fw_staff_refresh=".length).split(";")[0] || null : null;
    };
    const refresh = (cookie?: string) => {
      const r = t.http().post("/v1/admin/auth/refresh");
      return cookie ? r.set("Cookie", `fw_staff_refresh=${cookie}`) : r;
    };

    it("V2: O->C, C->D, then O again within the grace answers 200 with the live head's cookie, which refreshes", async () => {
      const s = await makeStaff(t.db, ["support"]);
      const o = cookieOf(await signIn(t, s.email))!;
      const c = await refresh(o);
      const d = await refresh(cookieOf(c)!);
      expect([c.status, d.status]).toEqual([200, 200]);
      const again = await refresh(o);
      expect(again.status).toBe(200);
      expect(cookieOf(again)).toBe(cookieOf(d));
      expect((await refresh(cookieOf(again)!)).status).toBe(200);
    });

    it("V2: O after the grace ends the family, 401, cookie cleared", async () => {
      const s = await makeStaff(t.db, ["support"]);
      const o = cookieOf(await signIn(t, s.email))!;
      const c = await refresh(o);
      await refresh(cookieOf(c)!);
      t.clock.advance(11_000);
      const late = await refresh(o);
      expect(late.status).toBe(401);
      expect(String(late.headers["set-cookie"])).toMatch(/fw_staff_refresh=;/);
      expect((await refresh(cookieOf(c)!)).status).toBe(401);
    });

    it("W2: a foreign Origin gets 403 and nothing rotates; an allowed Origin or none gets 200", async () => {
      const s = await makeStaff(t.db, ["support"]);
      const o = cookieOf(await signIn(t, s.email))!;
      const evil = await refresh(o).set("Origin", "https://evil.example");
      expect(evil.status).toBe(403);
      expect(evil.body.error.code).toBe("forbidden");
      expect(evil.headers["set-cookie"]).toBeUndefined();
      const ok = await refresh(o).set("Origin", "http://localhost:3000");
      expect(ok.status).toBe(200);
      expect((await refresh(cookieOf(ok)!)).status).toBe(200);
      expect((await t.http().post("/v1/admin/auth/sign-out").set("Origin", "https://evil.example")).status).toBe(403);
    });
  });
});
