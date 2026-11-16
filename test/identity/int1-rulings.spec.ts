// INT-1: every ruling of build/rulings-phase3.md S1-S6, T1-T6, U1-U8, V1-V9, proved on a real database by its id.
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Request } from "express";
import type { Response as TestResponse } from "supertest";
import { AccessTokenVerifier } from "../../src/common/auth/principal";
import { SessionTokenVerifier } from "../../src/common/auth/session-token.verifier";
import { AccessTokens } from "../../src/common/auth/access-tokens";
import { ErrorEnvelopeFilter } from "../../src/common/errors/error-envelope.filter";
import { canonicalEmail } from "../../src/common/normalise/email";
import { normaliseHandle } from "../../src/common/normalise/handle";
import { StandinGoogle } from "../../src/common/ports/adapters/standins";
import { GOOGLE_ISSUERS, GoogleIdentityPort } from "../../src/common/ports/google.port";
import { IdGenerator } from "../../src/common/ports/ids.port";
import { STANDIN_GOOGLE_CLIENT_ID } from "../../src/modules/google-identity/google-identity.service";
import { StaffAuthService } from "../../src/modules/staff-accounts/staff-auth.service";
import { bearer, codeFor, refreshCookieOf, signIn, SignInApp, signInApp, subOf, uniqueEmail, uniqueIp } from "../../src/modules/sessions/tests/sign-in.kit";
import { makeStaff, seedRoleTable, staffIp } from "../../src/modules/staff-accounts/tests/staff-kit";
import { createTestApp } from "../kit/app";
import { standinEnv } from "../kit/env";

const ROOT = join(__dirname, "..", "..");
const SECRET = standinEnv().JWT_ACCESS_SECRET;

let t: SignInApp;
let settle: () => Promise<void>;
// This spec makes active owners, and a B03 spec counts the active owners of its database: so this spec has its own database
// (a copy of the migrated template, dropped at the end); every app it starts uses it.
const PREFIX = process.env.TEST_DB_PREFIX || "fw";
const OWN_DB = `${PREFIX}_test_int1_${process.pid}`;
const SHARED_DB_URL = process.env.DATABASE_URL;
beforeAll(async () => {
  const made = spawnSync(process.execPath, [join(ROOT, "scripts/db.mjs"), "create", OWN_DB, PREFIX], { cwd: ROOT, encoding: "utf8" });
  if (made.status !== 0) throw new Error(`could not make ${OWN_DB}: ${made.stderr}`);
  process.env.DATABASE_URL = made.stdout.trim().split("\n").pop();
  t = await signInApp();
  await seedRoleTable(t.db);
  const auth = t.app.get(StaffAuthService);
  settle = () => auth.settle();
});
afterAll(async () => {
  await t.close();
  process.env.DATABASE_URL = SHARED_DB_URL;
  spawnSync(process.execPath, [join(ROOT, "scripts/db.mjs"), "drop", OWN_DB], { cwd: ROOT, encoding: "utf8" });
});

// ---------------------------------------------------------------- helpers
const cookieOf = (res: TestResponse, name: string): string | null => {
  const list = ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[]) ?? []);
  const c = list.find((x) => x.startsWith(`${name}=`));
  return c ? c.slice(name.length + 1).split(";")[0] || null : null;
};
const userRefresh = (cookie: string) => t.http().post("/v1/auth/refresh").set("Cookie", `fw_refresh=${cookie}`);
const staffRefresh = (cookie: string) => t.http().post("/v1/admin/auth/refresh").set("Cookie", `fw_staff_refresh=${cookie}`);
const me = (token: string) => t.http().get("/v1/me").set(bearer(token));
const team = (token: string) => t.http().get("/v1/admin/team").set(bearer(token));
const audit = (token: string, q = "") => t.http().get(`/v1/admin/audit${q}`).set(bearer(token));

async function staffCode(email: string, ip = staffIp()) {
  const r = await t.http().post("/v1/admin/auth/code").set("X-Forwarded-For", ip).send({ email });
  await settle();
  return r;
}
const lastCode = (email: string) => /(\d{6})/.exec(t.email.lastTo(email)?.text ?? "")?.[1];
async function staffSignIn(roles: Parameters<typeof makeStaff>[1], ip = staffIp()) {
  const s = await makeStaff(t.db, roles);
  await staffCode(s.email, ip);
  const r = await t.http().post("/v1/admin/auth/verify").set("X-Forwarded-For", ip).send({ email: s.email, code: lastCode(s.email) });
  if (r.status !== 200) throw new Error(`staff verify ${r.status} ${JSON.stringify(r.body)}`);
  return { staff: s, token: r.body.accessToken as string, cookie: cookieOf(r, "fw_staff_refresh")!, body: r.body as Record<string, unknown> };
}
const reason = "integration check";

function signed(claims: Record<string, unknown>): string {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

// ---------------------------------------------------------------- S
describe("S rulings (B03's halts)", () => {
  it("S1: one verifier; a user token never opens a staff route and a staff token never opens a user route", async () => {
    expect(t.app.get(AccessTokenVerifier)).toBeInstanceOf(SessionTokenVerifier);
    const user = await signIn(t, uniqueEmail("s1"));
    const staff = await staffSignIn(["owner"]);
    expect((await team(staff.token)).status).toBe(200);
    expect((await team(user.accessToken)).status).toBe(403);
    expect((await me(staff.token)).status).toBe(403);
    expect((await me(user.accessToken)).status).toBe(200);
    // a user token re-signed with the staff audience for the same session is refused by the staff check (no staff session)
    const c = t.app.get(AccessTokens).read(user.accessToken)!;
    const forged = t.app.get(AccessTokens).issue("staff", c.sub, c.sid, c.fid).token;
    expect((await team(forged)).status).toBe(401);
  });

  it("S2: an audit row keeps section and reason in their own columns", async () => {
    const owner = await staffSignIn(["owner"]);
    const email = `s2-${uniqueIp().replace(/\./g, "")}@example.test`;
    const r = await t.http().post("/v1/admin/team/invite").set(bearer(owner.token)).send({ email, roles: ["support"], reason });
    expect(r.status).toBe(201);
    const row = await t.db.auditEntry.findFirstOrThrow({ where: { subjectId: r.body.id as string, action: "team.invite" } });
    expect(row).toMatchObject({ section: "/admin/team", reason });
    expect(row.after).toEqual({ fields: ["email", "name", "roles", "status"] });
  });

  it("S3: removed is its own status; a removed member holds no role and cannot sign in", async () => {
    const owner = await staffSignIn(["owner"]);
    const m = await staffSignIn(["support"]);
    expect((await t.http().post(`/v1/admin/team/${m.staff.id}/remove`).set(bearer(owner.token)).send({ reason })).status).toBe(204);
    const row = await t.db.staffAccount.findUniqueOrThrow({ where: { id: m.staff.id } });
    expect(row).toMatchObject({ status: "removed", roles: [] });
    expect((await team(m.token)).status).toBe(401);
    const before = t.email.sent.length;
    expect((await staffCode(m.staff.email)).status).toBe(204);
    expect(t.email.sent.length).toBe(before);
    const list = await t.http().get("/v1/admin/team?limit=50").set(bearer(owner.token));
    const all = [...(list.body.items as { id: string; status: string; state: string }[])];
    let cursor = list.body.nextCursor as string | null;
    while (cursor) {
      const p = await t.http().get(`/v1/admin/team?limit=50&cursor=${cursor}`).set(bearer(owner.token));
      all.push(...(p.body.items as { id: string; status: string; state: string }[]));
      cursor = p.body.nextCursor as string | null;
    }
    expect(all.find((x) => x.id === m.staff.id)).toMatchObject({ status: "removed", state: "removed" });
  });

  it("S4: E-18 filters by section, and only owner and ops read it (finance 403)", async () => {
    const owner = await staffSignIn(["owner"]);
    const ops = await staffSignIn(["ops"]);
    const finance = await staffSignIn(["finance"]);
    const res = await audit(ops.token, "?section=%2Fadmin%2Fteam&limit=50");
    expect(res.status).toBe(200);
    expect((res.body.items as { section: string }[]).length).toBeGreaterThan(0);
    expect((res.body.items as { section: string }[]).every((i) => i.section === "/admin/team")).toBe(true);
    const signIns = await audit(owner.token, "?section=%2Fadmin&limit=5");
    expect((signIns.body.items as { section: string; action: string }[]).every((i) => i.section === "/admin")).toBe(true);
    expect((await audit(finance.token)).status).toBe(403);
    expect((await audit(owner.token, "?cursor=bad")).status).toBe(422);
  });

  it("S5: the staff refresh rotates the staff cookie, keeps the 12 h end from sign-in, and answers StaffAuthResult", async () => {
    const s = await staffSignIn(["support"]);
    const first = await t.db.session.findFirstOrThrow({ where: { staffId: s.staff.id, revokedAt: null } });
    t.clock.advance(60_000);
    const r = await staffRefresh(s.cookie);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object).sort()).toEqual(["accessToken", "accessTokenExpiresAt", "staff"]);
    expect(r.body.staff).toMatchObject({ id: s.staff.id, status: "active" });
    const next = cookieOf(r, "fw_staff_refresh")!;
    expect(next).not.toBe(s.cookie);
    const set = String(r.headers["set-cookie"]);
    expect(set).toMatch(/Path=\/v1\/admin\/auth/);
    expect(set).toMatch(/HttpOnly/);
    const child = await t.db.session.findFirstOrThrow({ where: { staffId: s.staff.id, revokedAt: null } });
    expect(child.familyId).toBe(first.familyId);
    expect(child.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    expect((await team(r.body.accessToken as string)).status).toBe(403); // support does not open /admin/team: the token is good
    expect((await t.http().post("/v1/admin/auth/refresh")).status).toBe(401);
    expect((await staffRefresh("x.y")).status).toBe(401);
    t.clock.advance(12 * 3600 * 1000);
    expect((await staffRefresh(next)).status).toBe(401);
  });

  it("S6: E-174 answers 204 with no body for a member, a stranger, a suspended and a removed member", async () => {
    const active = await makeStaff(t.db, ["support"]);
    const suspended = await makeStaff(t.db, ["support"], "suspended");
    const removed = await makeStaff(t.db, [], "removed");
    const answers = [];
    for (const email of [active.email, `stranger-${active.id.slice(-6)}@example.test`, suspended.email, removed.email]) {
      const r = await staffCode(email);
      answers.push({ status: r.status, text: r.text });
    }
    expect(answers.every((a) => a.status === 204 && a.text === "")).toBe(true);
    expect(t.email.lastTo(active.email)).toBeDefined();
    expect(t.email.lastTo(suspended.email)).toBeUndefined();
    expect(t.email.lastTo(removed.email)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- T
describe("T rulings (B01's halts)", () => {
  it("T1: E-20, E-53 and E-159 answer AuthResult; no token or hash in the body", async () => {
    const s = await signIn(t, uniqueEmail("t1"));
    expect(Object.keys(s.body).sort()).toEqual(["accessExpiresAt", "accessToken", "isNew", "session"]);
    const r = await userRefresh(s.cookie);
    expect(Object.keys(r.body as object).sort()).toEqual(["accessExpiresAt", "accessToken", "isNew", "session"]);
    expect(JSON.stringify(r.body)).not.toContain(refreshCookieOf(r)!.split(".")[1]);
  });

  it("T2: E-54 answers {url} only", async () => {
    const r = await t.http().post("/v1/auth/google/start").send({ returnTo: "/app" });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["url"]);
  });

  it("T3: E-159 needs no bearer, only its cookie; the registry says cookie for both refresh routes", async () => {
    const s = await signIn(t, uniqueEmail("t3"));
    expect((await userRefresh(s.cookie)).status).toBe(200);
    const reg = JSON.parse(readFileSync(join(ROOT, ".pipeline/registry.json"), "utf8")) as { resources: { endpoints: { id: string; auth: { kind: string }[] }[] }[] };
    const eps = reg.resources.flatMap((x) => x.endpoints);
    expect(eps.find((e) => e.id === "E-159")!.auth.map((a) => a.kind)).toEqual(["cookie"]);
    expect(eps.find((e) => e.id === "E-234")!.auth.map((a) => a.kind)).toEqual(["cookie"]);
  });

  it("T4: a rotated token reused after the grace ends that family only, for users and staff", async () => {
    const email = uniqueEmail("t4");
    const a = await signIn(t, email);
    const b = await signIn(t, email);
    expect((await userRefresh(a.cookie)).status).toBe(200);
    t.clock.advance(11_000);
    expect((await userRefresh(a.cookie)).status).toBe(401);
    expect((await me(a.accessToken)).status).toBe(401);
    expect((await me(b.accessToken)).status).toBe(200);
    const s1 = await staffSignIn(["support"]);
    const s2Code = await staffCode(s1.staff.email);
    expect(s2Code.status).toBe(204);
    const s2 = await t.http().post("/v1/admin/auth/verify").send({ email: s1.staff.email, code: lastCode(s1.staff.email) });
    expect((await staffRefresh(s1.cookie)).status).toBe(200);
    t.clock.advance(11_000);
    expect((await staffRefresh(s1.cookie)).status).toBe(401);
    expect((await t.http().post("/v1/admin/auth/sign-out").set(bearer(s1.token))).status).toBe(401);
    expect((await staffRefresh(cookieOf(s2, "fw_staff_refresh")!)).status).toBe(200);
  });

  it("T5: the Google port is a kernel port and the verifier is bound in CommonModule", () => {
    expect(t.app.get(GoogleIdentityPort)).toBeInstanceOf(StandinGoogle);
    expect(t.app.get(AccessTokenVerifier)).toBe(t.app.get(SessionTokenVerifier));
  });

  it("T6: two test apps at the same frozen moment never give the same id", async () => {
    const now = new Date("2026-01-01T09:00:00.000Z");
    const a = await createTestApp({ now });
    const b = await createTestApp({ now });
    const ia = Array.from({ length: 50 }, () => a.app.get(IdGenerator).id());
    const ib = Array.from({ length: 50 }, () => b.app.get(IdGenerator).id());
    expect(new Set([...ia, ...ib]).size).toBe(100);
    await Promise.all([a.close(), b.close()]);
  });
});

// ---------------------------------------------------------------- U
describe("U rulings (Verify B03; they bind both sign-ins)", () => {
  /** The wrong guesses go first; the right one goes once the 5 looks are spent (waited on in the database, not by a fixed time). */
  async function burst(send: (code: string) => Promise<TestResponse>, right: string, destination: string) {
    const wrong = Array.from({ length: 10 }, (_, i) => send(String((Number(right) + 1 + i) % 1_000_000).padStart(6, "0")));
    // The right code goes only once the 5 looks are spent. The wait has no fixed time (a loaded machine answers the wrong ones
    // late, and a right code sent before they were counted is rightly accepted): it ends when 5 are counted, or when every wrong
    // guess has been answered, in which case 5 must have been counted by then.
    let answered = false;
    void Promise.allSettled(wrong).then(() => {
      answered = true;
    });
    for (let i = 0; i < 4800; i++) {
      const row = await t.db.authCode.findFirst({ where: { destination }, orderBy: { createdAt: "desc" } });
      if ((row?.attempts ?? 0) >= 5) break;
      if (answered) {
        const last = await t.db.authCode.findFirst({ where: { destination }, orderBy: { createdAt: "desc" } });
        if ((last?.attempts ?? 0) >= 5) break;
        throw new Error(`all 10 wrong guesses were answered but ${last?.attempts ?? 0} were counted`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    const all = await Promise.all([...wrong, send(right)]);
    return { wrong: all.slice(0, 10), right: all[10] };
  }

  it("U1: 10 wrong and 1 right code sent at once are refused for the user sign-in; at most 5 looked at", async () => {
    const email = uniqueEmail("u1");
    const ip = uniqueIp();
    await t.http().post("/v1/auth/codes").set("X-Forwarded-For", ip).send({ contact: email });
    const right = codeFor(t, email);
    const r = await burst((code) => t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", ip).send({ contact: email, code }), right, email);
    expect(r.right.status).toBe(400);
    expect(r.wrong.filter((x) => x.body.error?.code === "code_wrong").length).toBeLessThanOrEqual(4);
    const row = await t.db.authCode.findFirstOrThrow({ where: { destination: email }, orderBy: { createdAt: "desc" } });
    expect(row.attempts).toBe(5);
    expect(row.consumedAt).toBeNull();
    expect(await t.db.account.count({ where: { contact: email } })).toBe(0);
  });

  it("U1: 10 wrong and 1 right code sent at once are refused for the staff sign-in; at most 5 looked at", async () => {
    const s = await makeStaff(t.db, ["support"]);
    const ip = staffIp();
    await staffCode(s.email, ip);
    const right = lastCode(s.email)!;
    const r = await burst((code) => t.http().post("/v1/admin/auth/verify").set("X-Forwarded-For", ip).send({ email: s.email, code }), right, s.email);
    expect(r.right.status).toBe(422);
    const row = await t.db.authCode.findFirstOrThrow({ where: { destination: s.email }, orderBy: { createdAt: "desc" } });
    expect(row.attempts).toBe(5);
    expect(await t.db.session.count({ where: { staffId: s.id } })).toBe(0);
  });

  it("U1: 11 guesses truly at once never get more than 5 looked at (both sign-ins)", async () => {
    const email = uniqueEmail("u1p");
    await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact: email });
    const s = await makeStaff(t.db, ["support"]);
    await staffCode(s.email);
    await Promise.all(
      Array.from({ length: 11 }, (_, i) => [
        t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", uniqueIp()).send({ contact: email, code: `9${String(i).padStart(5, "0")}` }),
        t.http().post("/v1/admin/auth/verify").set("X-Forwarded-For", staffIp()).send({ email: s.email, code: `9${String(i).padStart(5, "0")}` }),
      ]).flat(),
    );
    for (const d of [email, s.email]) {
      const row = await t.db.authCode.findFirstOrThrow({ where: { destination: d }, orderBy: { createdAt: "desc" } });
      expect(row.attempts).toBe(5);
    }
  });

  it("U2: with the Redis port dead, code limits still hold for both sign-ins", async () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://127.0.0.1:6399";
    const dead = await signInApp();
    process.env.REDIS_URL = saved;
    try {
      const email = uniqueEmail("u2");
      const answers: number[] = [];
      for (let i = 0; i < 6; i++) {
        dead.clock.advance(61_000);
        answers.push((await dead.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact: email })).status);
      }
      expect(answers).toEqual([200, 200, 200, 200, 200, 429]);
      const s = await makeStaff(dead.db, ["support"]);
      for (let i = 0; i < 7; i++) await dead.http().post("/v1/admin/auth/code").set("X-Forwarded-For", staffIp()).send({ email: s.email });
      await dead.app.get(StaffAuthService).settle();
      expect(dead.email.sent.filter((m) => m.to === s.email)).toHaveLength(5);
      expect(await dead.db.authCode.count({ where: { destination: s.email } })).toBe(5);
    } finally {
      await dead.close();
    }
  });

  it("U2: a new code is no fresh budget: 15 wrong tries per email per hour across codes (user and staff)", async () => {
    const email = uniqueEmail("u2w");
    const statuses: number[] = [];
    for (let c = 0; c < 4; c++) {
      t.clock.advance(61_000);
      await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact: email });
      for (let i = 0; i < (c < 3 ? 5 : 1); i++) {
        statuses.push((await t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", uniqueIp()).send({ contact: email, code: "999999" })).status);
      }
    }
    expect(statuses.slice(0, 15).every((x) => x === 400)).toBe(true);
    expect(statuses[15]).toBe(429);
    const s = await makeStaff(t.db, ["support"]);
    const st: number[] = [];
    for (let c = 0; c < 4; c++) {
      await staffCode(s.email);
      for (let i = 0; i < (c < 3 ? 5 : 1); i++) {
        st.push((await t.http().post("/v1/admin/auth/verify").set("X-Forwarded-For", staffIp()).send({ email: s.email, code: "999999" })).status);
      }
    }
    expect(st[15]).toBe(429);
  });

  it("U2: when the database cannot answer the request is refused with 503, never let through", async () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://firstwish:firstwish@127.0.0.1:1/int1_test_none";
    const dead = await createTestApp({ realTokens: true });
    process.env.DATABASE_URL = saved;
    try {
      const u = await dead.http().post("/v1/auth/codes").send({ contact: "a@example.com" });
      expect(u.status).toBe(503);
      const v = await dead.http().post("/v1/auth/codes/verify").send({ contact: "a@example.com", code: "123456" });
      expect(v.status).toBe(503);
      const s = await dead.http().post("/v1/admin/auth/verify").send({ email: "a@example.com", code: "123456" });
      expect(s.status).toBe(503);
      expect(s.body.error.code).toBe("service_unavailable");
    } finally {
      await dead.close();
    }
    const client = new PrismaClient({ datasourceUrl: "postgresql://firstwish:firstwish@127.0.0.1:1/int1_test_none" });
    const err = await client.authCode.count().catch((e: unknown) => e);
    const env = new ErrorEnvelopeFilter().toEnvelope(err, { method: "POST", path: "/" } as Request, "r1");
    expect(env.status).toBe(503);
    await client.$disconnect();
  });

  it("U3: two invites for one email at once give one 201 and 409 already_staff, never 500", async () => {
    const owner = await staffSignIn(["owner"]);
    const email = `u3-${owner.staff.id.slice(-8)}@example.test`;
    const all = await Promise.all(
      Array.from({ length: 8 }, () => t.http().post("/v1/admin/team/invite").set(bearer(owner.token)).send({ email, roles: ["support"], reason })),
    );
    const codes = all.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    expect(all.filter((r) => r.status === 409).every((r) => r.body.error.code === "already_staff")).toBe(true);
  });

  it("U4: asking for a staff code gives the same answer for a member and a stranger; only the member is sent a code", async () => {
    const members = await Promise.all(Array.from({ length: 5 }, () => makeStaff(t.db, ["support"])));
    const ask = (email: string) => t.http().post("/v1/admin/auth/code").set("X-Forwarded-For", staffIp()).send({ email });
    for (let i = 0; i < members.length; i++) {
      const stranger = `stranger-${i}-${members[i].id.slice(-8)}@example.test`;
      const [m, x] = [await ask(members[i].email), await ask(stranger)];
      expect([m.status, x.status]).toEqual([204, 204]);
      expect(m.body).toEqual(x.body);
      expect(m.text).toEqual(x.text);
      await settle();
      expect(t.email.lastTo(members[i].email)).toBeDefined();
      expect(t.email.lastTo(stranger)).toBeUndefined();
    }
  });

  it("U5: a removed member can be invited again: back as invited with the new role, one audit row", async () => {
    const owner = await staffSignIn(["owner"]);
    const email = `u5-${owner.staff.id.slice(-8)}@example.test`;
    const inv = (roles: string[]) => t.http().post("/v1/admin/team/invite").set(bearer(owner.token)).send({ email, roles, reason });
    const first = await inv(["support"]);
    expect(first.status).toBe(201);
    expect((await t.http().post(`/v1/admin/team/${first.body.id as string}/remove`).set(bearer(owner.token)).send({ reason })).status).toBe(204);
    const again = await inv(["finance"]);
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ id: first.body.id, status: "invited", roles: ["finance"] });
    expect(await t.db.auditEntry.count({ where: { subjectId: first.body.id as string, action: "team.re-invite" } })).toBe(1);
    await settle();
    const code = lastCode(email)!;
    const v = await t.http().post("/v1/admin/auth/verify").send({ email, code });
    expect(v.status).toBe(200);
    expect(v.body.staff).toMatchObject({ status: "active", roles: ["finance"] });
  });

  it("U6: a reason is 4 to 500 characters", async () => {
    const owner = await staffSignIn(["owner"]);
    const m = await makeStaff(t.db, ["support"]);
    const patch = (r: string) => t.http().patch(`/v1/admin/staff-accounts/${m.id}`).set(bearer(owner.token)).send({ roles: ["ops"], reason: r });
    expect((await patch("x".repeat(501))).status).toBe(422);
    expect((await patch("abc")).status).toBe(422);
    expect((await patch("x".repeat(500))).status).toBe(200);
  });

  it("U7: a staff account can never be deleted at the database", async () => {
    const m = await makeStaff(t.db, ["support"]);
    await expect(t.db.staffAccount.delete({ where: { id: m.id } })).rejects.toThrow(/never deleted/);
    expect(await t.db.staffAccount.count({ where: { id: m.id } })).toBe(1);
  });

  it("U8: test:affected given a directory runs the specs under it", () => {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/test-runner.mjs"), "test/identity", "--listTests"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, TEST_DB_PREFIX: PREFIX },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("int1-rulings.spec.ts");
  });
});

// ---------------------------------------------------------------- V
describe("V rulings (Verify B01; V1 and V2 bind staff sessions too)", () => {
  it("V1: a refresh does not end the access tokens already given; sign-out ends them at once (user and staff)", async () => {
    const s = await signIn(t, uniqueEmail("v1"));
    const r = await userRefresh(s.cookie);
    expect((await me(s.accessToken)).status).toBe(200);
    expect((await me(r.body.accessToken as string)).status).toBe(200);
    expect((await t.http().post("/v1/auth/sign-out").set(bearer(s.accessToken))).status).toBe(204);
    expect((await me(s.accessToken)).status).toBe(401);
    expect((await me(r.body.accessToken as string)).status).toBe(401);
    const st = await staffSignIn(["owner"]);
    const sr = await staffRefresh(st.cookie);
    expect((await team(st.token)).status).toBe(200);
    expect((await team(sr.body.accessToken as string)).status).toBe(200);
    expect((await t.http().post("/v1/admin/auth/sign-out").set(bearer(sr.body.accessToken as string))).status).toBe(204);
    expect((await team(st.token)).status).toBe(401);
  });

  it("V2: 6 refreshes at once with one user cookie: 6 successes, one live child, the same cookie each time", async () => {
    const s = await signIn(t, uniqueEmail("v2"));
    const all = await Promise.all(Array.from({ length: 6 }, () => userRefresh(s.cookie)));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const cookies = new Set(all.map((r) => refreshCookieOf(r)));
    expect(cookies.size).toBe(1);
    expect(all.every((r) => !String(r.headers["set-cookie"]).includes("Max-Age=0"))).toBe(true);
    const fam = (await t.db.session.findUniqueOrThrow({ where: { id: s.sessionId } })).familyId;
    expect(await t.db.session.count({ where: { familyId: fam, revokedAt: null } })).toBe(1);
    t.clock.advance(5_000);
    expect((await userRefresh(s.cookie)).status).toBe(200);
  });

  it("V2: 6 refreshes at once with one staff cookie: 6 successes, one live child", async () => {
    const st = await staffSignIn(["support"]);
    const all = await Promise.all(Array.from({ length: 6 }, () => staffRefresh(st.cookie)));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(new Set(all.map((r) => cookieOf(r, "fw_staff_refresh"))).size).toBe(1);
    expect(await t.db.session.count({ where: { staffId: st.staff.id, revokedAt: null } })).toBe(1);
  });

  it("V3: the Google callback refuses a state whose nonce cookie is missing or from another browser", async () => {
    const google = t.app.get<GoogleIdentityPort, StandinGoogle>(GoogleIdentityPort);
    const begin = async () => {
      const r = await t.http().post("/v1/auth/google/start").send({ returnTo: "/app" });
      const set = String(r.headers["set-cookie"]);
      expect(set).toMatch(/fw_google=[^;]+; Max-Age=600; Path=\/v1\/auth\/google; HttpOnly; Secure; SameSite=Lax/);
      return { state: new URL(r.body.url as string).searchParams.get("state")!, nonce: cookieOf(r, "fw_google")! };
    };
    const email = uniqueEmail("v3");
    const claims = () => ({ iss: GOOGLE_ISSUERS[0], aud: STANDIN_GOOGLE_CLIENT_ID, sub: `v3-${email}`, email, email_verified: true, exp: Math.floor(t.clock.now().getTime() / 1000) + 600 });
    const victim = await begin();
    const attacker = await begin();
    const none = await t.http().get("/v1/auth/google/callback").query({ code: google.issueCode(claims()), state: victim.state });
    expect(none.status).toBe(400);
    const other = await t.http().get("/v1/auth/google/callback").set("Cookie", `fw_google=${attacker.nonce}`).query({ code: google.issueCode(claims()), state: (await begin()).state });
    expect(other.status).toBe(400);
    const own = await begin();
    const ok = await t.http().get("/v1/auth/google/callback").set("Cookie", `fw_google=${own.nonce}`).query({ code: google.issueCode(claims()), state: own.state });
    expect(ok.status).toBe(200);
    expect(subOf(ok.body.accessToken as string)).toBeTruthy();
  });

  it("V4: with TRUST_PROXY_HOPS=0 the client address is the socket's, never X-Forwarded-For", async () => {
    const saved = process.env.TRUST_PROXY_HOPS;
    process.env.TRUST_PROXY_HOPS = "0";
    const plain = await signInApp();
    process.env.TRUST_PROXY_HOPS = saved;
    try {
      const email = uniqueEmail("v4");
      await plain.http().post("/v1/auth/codes").set("X-Forwarded-For", "1.2.3.4").send({ contact: email });
      const row = await plain.db.authCode.findFirstOrThrow({ where: { destination: email } });
      expect(row.ip).not.toBe("1.2.3.4");
      expect(row.ip).toMatch(/127\.0\.0\.1|::1/);
    } finally {
      await plain.close();
    }
    const email = uniqueEmail("v4b");
    await t.http().post("/v1/auth/codes").set("X-Forwarded-For", "5.6.7.8").send({ contact: email });
    expect((await t.db.authCode.findFirstOrThrow({ where: { destination: email } })).ip).toBe("5.6.7.8");
  });

  it("V5: per-email limits count the canonical email; the account keeps the email as typed", async () => {
    expect(canonicalEmail(" Ada+Promo@Example.com ")).toBe("ada@example.com");
    const base = uniqueEmail("v5");
    const [local, domain] = base.split("@");
    const answers: number[] = [];
    for (let i = 1; i <= 6; i++) {
      t.clock.advance(61_000);
      answers.push((await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact: `${local}+${i}@${domain}` })).status);
    }
    expect(answers).toEqual([200, 200, 200, 200, 200, 429]);
    const tagged = `${local}+5@${domain}`;
    const v = await t.http().post("/v1/auth/codes/verify").send({ contact: tagged, code: codeFor(t, tagged) });
    expect(v.status).toBe(200);
    expect(await t.db.account.count({ where: { contact: tagged } })).toBe(1);
  });

  it("V6: ids that are not uuids answer 401 or 404 in the envelope, never 500", async () => {
    const now = Math.floor(t.clock.now().getTime() / 1000);
    const bad = signed({ sub: "x", aud: "user", sid: "not-a-uuid", fid: "nope", iat: now, exp: now + 600 });
    const r = await me(bad);
    expect(r.status).toBe(401);
    expect(r.body.error.requestId).toBeDefined();
    const s = await signIn(t, uniqueEmail("v6"));
    const del = await t.http().delete("/v1/me/google").set(bearer(s.accessToken)).send({ id: "not-a-uuid" });
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe("not_found");
  });

  it("V7: no Date.now() outside the clock port (the uuid maker's default is for request ids only)", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.includes("/tests/") && !p.endsWith("clock.port.ts") && !p.endsWith("uuidv7.ts")) files.push(p);
      }
    };
    walk(join(ROOT, "src"));
    expect(files.filter((f) => readFileSync(f, "utf8").includes("Date.now()"))).toEqual([]);
  });

  it("V8: the reserved handles include the route words", () => {
    for (const h of ["api", "root", "settings", "staff", "moderator", "wish", "pricing", "terms", "privacy", "contact"]) {
      expect(normaliseHandle(h)).toBeNull();
    }
    expect(normaliseHandle("ada.obi")).toBe("ada.obi");
  });

  it("V9: checking codes is limited per address: the 61st check in an hour is refused", async () => {
    const ip = uniqueIp();
    const send = (contact: string) => t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", ip).send({ contact, code: "999999" });
    let last = 0;
    for (let e = 0; e < 13; e++) {
      const email = uniqueEmail(`v9-${e}`);
      await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact: email });
      for (let i = 0; i < (e < 12 ? 5 : 1); i++) last = (await send(email)).status;
      if (e === 11) expect(last).toBe(400);
    }
    expect(last).toBe(429);
  });
});
