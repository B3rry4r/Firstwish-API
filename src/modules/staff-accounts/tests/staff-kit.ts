import { Controller, Get } from "@nestjs/common";
import type { StaffAccountRoles, StaffAccountStatus } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { CurrentPrincipal } from "../../../common/auth/decorators";
import { AccessTokenVerifier, Principal } from "../../../common/auth/principal";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp, TestTokens } from "../../../../test/kit/app";
import { StaffTokenVerifier } from "../staff-tokens";

/** The role table as scripts/seed.mjs seeds it (same ids, so a seeded database is left as it is). */
const ALL = ["/admin", "/admin/wishes", "/admin/people", "/admin/moderation", "/admin/showing", "/admin/styles", "/admin/styles/review",
  "/admin/creators", "/admin/payments", "/admin/businesses", "/admin/concierge", "/admin/prices", "/admin/support", "/admin/messages",
  "/admin/numbers", "/admin/team", "/admin/audit", "/admin/settings"];
export const ROLE_SECTIONS: Record<string, string[]> = {
  owner: ALL,
  ops: ALL.filter((h) => !["/admin/team", "/admin/settings", "/admin/prices"].includes(h)),
  moderator: ["/admin", "/admin/wishes", "/admin/people", "/admin/moderation", "/admin/showing"],
  reviewer: ["/admin", "/admin/styles", "/admin/styles/review", "/admin/creators"],
  support: ["/admin", "/admin/wishes", "/admin/people", "/admin/support", "/admin/messages"],
  finance: ["/admin", "/admin/payments", "/admin/businesses", "/admin/creators", "/admin/prices", "/admin/numbers"],
  maker: ["/admin", "/admin/concierge"],
};

function seedId(key: string): string {
  const h = createHash("sha256").update(`firstwish-seed:${key}`).digest();
  const b = Buffer.alloc(16);
  b.writeUIntBE(Date.UTC(2026, 10, 15), 0, 6);
  h.copy(b, 6, 0, 10);
  b[6] = 0x70 | (b[6] & 0x0f);
  b[8] = 0x80 | (b[8] & 0x3f);
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export async function seedRoleTable(db: PrismaService): Promise<void> {
  await db.roleAccess.createMany({
    data: Object.entries(ROLE_SECTIONS).map(([role, sections]) => ({ id: seedId(`role:${role}`), role, sections })),
    skipDuplicates: true,
  });
}

/** A route that needs a signed-in user (no decorator), to prove a staff token never opens a user route. */
@Controller("probe-b03")
export class UserProbe {
  @Get("user") me(@CurrentPrincipal() p: Principal) {
    return { kind: p.kind };
  }
}

/** Staff tokens go to the real staff verifier; anything else to the test user tokens. */
class StaffThenTest extends AccessTokenVerifier {
  staff: StaffTokenVerifier | null = null;
  constructor(private readonly users: TestTokens) {
    super();
  }
  async verify(token: string): Promise<Principal | null> {
    return (await this.staff?.verify(token)) ?? (await this.users.verify(token));
  }
}

export interface StaffApp extends TestApp {
  db: PrismaService;
  users: TestTokens;
}

export async function createStaffApp(): Promise<StaffApp> {
  const users = new TestTokens();
  const verifier = new StaffThenTest(users);
  const t = await createTestApp({
    controllers: [UserProbe],
    now: new Date(),
    configure: (b) => b.overrideProvider(AccessTokenVerifier).useValue(verifier),
  });
  verifier.staff = t.app.get(StaffTokenVerifier);
  const db = t.app.get(PrismaService);
  await seedRoleTable(db);
  return { ...t, db, users };
}

const ids = new UuidV7Maker();
export const tag = () => randomBytes(4).toString("hex");

export async function makeStaff(db: PrismaService, roles: StaffAccountRoles[], status: StaffAccountStatus = "active") {
  const t = tag();
  return db.staffAccount.create({ data: { id: ids.next(), email: `staff-${t}@example.test`, name: `Staff ${t}`, roles, status } });
}

/** Asks for a code, reads it from the stand-in email, verifies it. Returns the verify response. */
export async function signIn(t: StaffApp, email: string) {
  const code = await t.http().post("/v1/admin/auth/code").send({ email });
  if (code.status !== 204) throw new Error(`code ${code.status}`);
  const mail = t.email.lastTo(email);
  const digits = /(\d{6})/.exec(mail?.text ?? "")?.[1];
  if (!digits) throw new Error("no code email");
  return t.http().post("/v1/admin/auth/verify").send({ email, code: digits });
}

export async function tokenFor(t: StaffApp, roles: StaffAccountRoles[]) {
  const s = await makeStaff(t.db, roles);
  const r = await signIn(t, s.email);
  return { staff: s, token: (r.body as { accessToken: string }).accessToken };
}
