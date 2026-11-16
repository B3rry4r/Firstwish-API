import { randomBytes } from "node:crypto";
import { PrismaService } from "../../../common/db/prisma.service";
import { UuidV7Maker } from "../../../common/ids/uuidv7";
import { createTestApp, TestApp } from "../../../../test/kit/app";
import { seedRoleTable } from "../../staff-accounts/tests/staff-kit";

export const ids = new UuidV7Maker();
export const hex = (n = 4) => randomBytes(n).toString("hex");

export interface Kit extends TestApp {
  db: PrismaService;
  token: (role: string) => string;
  auth: (role: string) => { authorization: string };
  staffIds: Record<string, string>;
}

const ROLES = ["owner", "ops", "moderator", "reviewer", "support", "finance", "maker"] as const;

/** The app with one staff token per role (named by the role), its own clock and the seeded role table. */
export async function makeKit(now: Date, configure?: Parameters<typeof createTestApp>[0] extends infer O ? (O extends { configure?: infer C } ? C : never) : never): Promise<Kit> {
  const t = await createTestApp({ now, configure });
  const db = t.app.get(PrismaService);
  await seedRoleTable(db);
  const staffIds: Record<string, string> = {};
  for (const r of ROLES) {
    const staff = await db.staffAccount.create({ data: { id: ids.next(), email: `${r}-${hex()}@example.test`, name: `Staff ${r}`, roles: [r], status: "active" } });
    staffIds[r] = staff.id;
    t.tokens.set(r, { kind: "staff", staffId: staff.id, roles: [r] });
  }
  t.tokens.set("person", { kind: "user", accountId: ids.next(), sides: ["person"] });
  return { ...t, db, staffIds, token: (r) => r, auth: (r) => ({ authorization: `Bearer ${r}` }) };
}

export async function makeAccount(db: PrismaService, over: { name?: string; contact?: string; phone?: string } = {}) {
  const id = ids.next();
  return db.account.create({
    data: { id, name: over.name ?? `Person ${hex()}`, contact: over.contact ?? `p-${hex()}@example.test`, phone: over.phone ?? "+2348031472093", sides: ["person"], lastSide: "person" },
  });
}

export async function makeWish(db: PrismaService, accountId: string, over: Record<string, unknown> = {}) {
  const id = ids.next();
  const no = `T${hex(5)}`;
  const w = await db.wish.create({
    data: { id, accountId, status: "sealed", kind: "love", occasion: "birthday", styleSlug: "classic", timeZone: "Africa/Lagos", no, name: "Ada", letter: "SECRET WORDS OF THE LETTER", photos: [{ file: "SECRET-PHOTO" }], ...over } as never,
  });
  const slug = `ada-${hex(2)}`;
  await db.wishLink.create({ data: { id: ids.next(), slug, wishId: id, active: true } });
  return { ...w, slug };
}

export async function makePayment(db: PrismaService, over: Record<string, unknown> = {}) {
  return db.payment.create({
    data: {
      id: ids.next(), purpose: "ticket", lines: [], amountKobo: 500000n, currency: "NGN", priceBookVersion: 1, status: "succeeded", provider: "paystack",
      providerReference: `ref-${hex(6)}`, idempotencyKey: `idem-${hex(6)}`, verifiedAt: new Date(), ...over,
    } as never,
  });
}
