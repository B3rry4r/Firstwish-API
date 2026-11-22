import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { StaffAccountRoles } from "@prisma/client";
import { uniqueAddress } from "../../../../test/kit/app";
import { account, B12App, b12App, bearer, NOW, Who } from "../../people/tests/b12-kit";
import { seedRoleTable } from "../../staff-accounts/tests/staff-kit";
import { testSlug, testWishNo, RUN } from "../../../../test/kit/unique";

export { account, bearer, NOW, uniqueAddress };
export type { B12App, Who };

const ROOT = join(__dirname, "../../../..");
let seq = 0;
const run = RUN;

export async function b13App(): Promise<B12App> {
  const t = await b12App();
  // The reference rows (the price book above all) are not in a fresh test database: a route that reads the book answers 503 until the seed has run.
  // Run alone, these specs had no other spec to seed it first; the seed is idempotent (fixed ids, upserts), as in the 60-odd specs that run it.
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/seed.mjs")], { cwd: ROOT, env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`seed failed: ${r.stderr}`);
  await seedRoleTable(t.db);
  return t;
}

/** A staff member with a real row (a decision names who made it), and a token. */
export async function staffOf(t: B12App, role: StaffAccountRoles = "moderator"): Promise<{ id: string; token: string }> {
  const id = t.id();
  await t.db.staffAccount.create({ data: { id, email: `b13-staff-${run}-${++seq}@example.com`, name: "Staff", roles: [role], status: "active" } });
  const token = `b13-staff-${id}`;
  t.tokens.set(token, { kind: "staff", staffId: id, roles: [role] });
  return { id, token };
}

/** A wish that is live now: opened, in its term, with an active link. */
export async function liveWish(t: B12App, owner: Who, over: { name?: string; status?: "live" | "resting" | "sealed" | "draft"; passcodeHash?: string } = {}): Promise<{ id: string; no: string; slug: string }> {
  const id = t.id();
  const no = testWishNo();
  const slug = testSlug("ada");
  await t.db.wish.create({
    data: {
      id, accountId: owner.accountId, status: over.status ?? "live", kind: "birthday", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", no,
      name: over.name ?? "Ada", opensAt: new Date(NOW.getTime() - 86_400_000), openedAt: new Date(NOW.getTime() - 3_600_000), endsAt: new Date(NOW.getTime() + 7 * 86_400_000),
      passcodeHash: over.passcodeHash ?? null, content: { letter: "private words" },
    },
  });
  await t.db.wishLink.create({ data: { id: t.id(), slug, wishId: id, active: true } });
  return { id, no, slug };
}
