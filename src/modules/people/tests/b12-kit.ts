import { PrismaService } from "../../../common/db/prisma.service";
import type { Side } from "../../../common/auth/principal";
import { IdGenerator } from "../../../common/ports/ids.port";
import { createTestApp, TestApp } from "../../../../test/kit/app";

/* Test helpers for B12: accounts and businesses made straight in the database, tokens from the kit's token map. */

export interface B12App extends TestApp {
  db: PrismaService;
  id: () => string;
}

/** Today in Lagos is 2027-01-10 (a non-leap year; 2028 is leap). */
export const NOW = new Date("2027-01-10T09:00:00.000Z");

export async function b12App(now: Date = NOW): Promise<B12App> {
  const t = await createTestApp({ now });
  const ids = t.app.get(IdGenerator);
  return { ...t, db: t.app.get(PrismaService), id: () => ids.id() };
}

let seq = 0;
const run = `${process.pid}${Date.now() % 100000}`;

export interface Who {
  accountId: string;
  token: string;
  email: string;
}

export async function account(t: B12App, sides: Side[] = ["person"]): Promise<Who> {
  const accountId = t.id();
  const email = `b12-${run}-${++seq}@example.com`;
  const dbSides = sides.filter((s): s is "creator" | "business" => s !== "person");
  await t.db.account.create({ data: { id: accountId, contact: email, sides: ["person", ...dbSides], lastSide: "person" } });
  const token = `tok-${accountId}`;
  t.tokens.set(token, { kind: "user", accountId, sides: ["person", ...dbSides] });
  return { accountId, token, email };
}

/** An account with the business side that owns a new business. */
export async function businessOwner(t: B12App): Promise<Who & { businessId: string }> {
  const who = await account(t, ["person", "business"]);
  const businessId = t.id();
  await t.db.business.create({ data: { id: businessId, accountId: who.accountId, name: "Shop" } });
  return { ...who, businessId };
}

export function staff(t: B12App): string {
  const token = `staff-${++seq}`;
  t.tokens.set(token, { kind: "staff", staffId: t.id(), roles: ["owner"] });
  return token;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
