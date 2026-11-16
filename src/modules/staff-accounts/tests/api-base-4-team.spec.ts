import type { StaffAccount as StaffRow } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { RoleAccessService } from "../../role-access/role-access.service";
import type { StaffRole } from "../../../common/auth/principal";
import { createStaffApp, makeStaff, ROLE_SECTIONS, signIn, StaffApp } from "./staff-kit";

/** API-BASE-4: HP1 (the role's sections), HP7 (a team change carries its version), HP8 (removed staff left out). */
describe("API-BASE-4 team (HP1, HP7, HP8)", () => {
  let t: StaffApp;
  let owner: StaffRow;
  let ownerToken: string;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const script = join(__dirname, "../../../../scripts/db.mjs");
  const prefix = process.env.TEST_DB_PREFIX || "fw";
  const ownDb = `${prefix}_test_ab4team_${process.pid}`;
  const savedUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    process.env.DATABASE_URL = execFileSync("node", [script, "create", ownDb, prefix], { encoding: "utf8" }).trim();
    t = await createStaffApp();
    owner = await makeStaff(t.db, ["owner"]);
    ownerToken = (await signIn(t, owner.email)).body.accessToken;
  });
  afterAll(async () => {
    await t.close();
    process.env.DATABASE_URL = savedUrl;
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync("node", [script, "drop", ownDb], { stdio: ["ignore", "pipe", "pipe"] });
        return;
      } catch (e) {
        if (attempt >= 10 || !String((e as { stderr?: Buffer }).stderr ?? e).includes("permission denied to terminate process")) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  });

  it("HP1: the staff read after sign-in and every Team row carry the role's sections, equal to what the section guard enforces", async () => {
    const access = t.app.get(RoleAccessService);
    const sets: StaffRole[][] = [["ops"], ["moderator"], ["reviewer"], ["support"], ["finance"], ["maker"], ["moderator", "finance"]];
    const every = Object.values(ROLE_SECTIONS).flat();
    for (const roles of sets) {
      const m = await makeStaff(t.db, roles);
      const r = await signIn(t, m.email);
      expect(r.status).toBe(200);
      const sections = r.body.staff.sections as string[];
      const want = [...new Set(roles.flatMap((x) => ROLE_SECTIONS[x]))].sort();
      expect(sections).toEqual(want);
      for (const s of new Set(every)) expect(await access.opens(roles, s)).toBe(sections.includes(s));
      const team = await t.http().get("/v1/admin/team?limit=50").set(bearer(ownerToken));
      expect((team.body.items as { id: string; sections: string[] }[]).find((x) => x.id === m.id)?.sections).toEqual(want);
    }
    const o = await t.http().get("/v1/admin/team?limit=50").set(bearer(ownerToken));
    expect((o.body.items as { id: string; sections: string[] }[]).find((x) => x.id === owner.id)?.sections).toEqual([...new Set(every)].sort());
    for (const s of new Set(every)) expect(await access.opens(["owner"], s)).toBe(true);
  });

  it("HP7: two changes at once on one version: one 200, one 409 stale_version with words; a change without a version is 422", async () => {
    const m = await makeStaff(t.db, ["support"]);
    const go = (roles: string[], version: number) => t.http().patch(`/v1/admin/staff-accounts/${m.id}`).set(bearer(ownerToken)).send({ version, roles, reason: "moving" });
    const [a, b] = await Promise.all([go(["ops"], 0), go(["finance"], 0)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const lost = a.status === 409 ? a : b;
    expect(lost.body.code ?? lost.body.error?.code).toBe("stale_version");
    expect(JSON.stringify(lost.body)).toMatch(/changed by someone else/);
    const won = a.status === 200 ? a : b;
    expect(won.body.version).toBe(1);
    const none = await t.http().patch(`/v1/admin/staff-accounts/${m.id}`).set(bearer(ownerToken)).send({ roles: ["ops"], reason: "moving" });
    expect(none.status).toBe(422);
    expect(JSON.stringify(none.body)).toContain("version");
    expect((await t.http().post(`/v1/admin/staff-accounts/${m.id}/suspend`).set(bearer(ownerToken)).send({ version: 0, reason: "on leave" })).status).toBe(409);
    expect((await t.http().post(`/v1/admin/staff-accounts/${m.id}/suspend`).set(bearer(ownerToken)).send({ version: 1, reason: "on leave" })).status).toBe(200);
    expect((await t.http().post(`/v1/admin/team/${m.id}/remove`).set(bearer(ownerToken)).send({ version: 1, reason: "left" })).status).toBe(409);
    expect((await t.http().post(`/v1/admin/team/${m.id}/remove`).set(bearer(ownerToken)).send({ version: 2, reason: "left" })).status).toBe(204);
  });

  it("HP8: removed staff are left out of the Team read by default and shown with includeRemoved=true", async () => {
    const m = await makeStaff(t.db, ["support"]);
    expect((await t.http().post(`/v1/admin/team/${m.id}/remove`).set(bearer(ownerToken)).send({ version: 0, reason: "left" })).status).toBe(204);
    const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map((x) => x.id);
    expect(ids(await t.http().get("/v1/admin/team?limit=50").set(bearer(ownerToken)))).not.toContain(m.id);
    expect(ids(await t.http().get("/v1/admin/team?limit=50&includeRemoved=true").set(bearer(ownerToken)))).toContain(m.id);
  });
});
