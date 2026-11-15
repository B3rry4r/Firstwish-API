import { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../prisma.service";
import { lockAccount, lockBusinessOwner } from "../account-lock";
import { UuidV7Maker } from "../../ids/uuidv7";
import { AppError } from "../../errors/app-error";

/* AA1: nothing is written to an account after it is erased. The write and the erase take the same row lock. */

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as unknown as PrismaService;
const ids = new UuidV7Maker();

async function makeAccount(): Promise<string> {
  const id = ids.next();
  await db.account.create({ data: { id, lastSide: "creator", name: "Ada" } });
  return id;
}

/** A guarded write: lock first, then write (the shape every account write takes). */
const writeName = (id: string, name: string) =>
  db.$transaction(async (tx) => {
    await lockAccount(tx, id);
    await tx.account.update({ where: { id }, data: { name } });
  });

/** The erase: same lock with allowErased, then blank and stamp. */
const erase = (id: string) =>
  db.$transaction(async (tx) => {
    const a = await lockAccount(tx, id, { allowErased: true });
    if (a.erasedAt) return;
    await tx.account.update({ where: { id }, data: { name: null, erasedAt: new Date() } });
  });

beforeAll(() => db.$connect());
afterAll(() => db.$disconnect());

describe("account lock (AA1)", () => {
  it("lets a write through on a live account", async () => {
    const id = await makeAccount();
    await writeName(id, "Bola");
    expect((await db.account.findUniqueOrThrow({ where: { id } })).name).toBe("Bola");
  });

  it("refuses a write after erase with 401 account_erased", async () => {
    const id = await makeAccount();
    await erase(id);
    const err = await writeName(id, "Late").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getStatus()).toBe(401);
    expect((await db.account.findUniqueOrThrow({ where: { id } })).name).toBeNull();
  });

  it("answers 404 for a missing account or an id that is not a uuid, never a 500", async () => {
    for (const id of [ids.next(), "not-a-uuid", "'; drop table account; --"]) {
      const err = await db.$transaction((tx) => lockAccount(tx, id)).catch((e: unknown) => e);
      expect((err as AppError).getStatus()).toBe(404);
    }
  });

  it("erasing twice changes nothing", async () => {
    const id = await makeAccount();
    await erase(id);
    const first = (await db.account.findUniqueOrThrow({ where: { id } })).erasedAt;
    await erase(id);
    expect((await db.account.findUniqueOrThrow({ where: { id } })).erasedAt).toEqual(first);
  });

  it("a business write locks its owner account and is refused once that is erased", async () => {
    const owner = await makeAccount();
    const businessId = ids.next();
    await db.business.create({ data: { id: businessId, accountId: owner } });
    await db.$transaction((tx) => lockBusinessOwner(tx, businessId));
    await erase(owner);
    const err = await db.$transaction((tx) => lockBusinessOwner(tx, businessId)).catch((e: unknown) => e);
    expect((err as AppError).getStatus()).toBe(401);
  });

  it("racing erase against a write, 10 times: the write either lands before the erase's blanking or is refused, never after", async () => {
    for (let i = 0; i < 10; i++) {
      const id = await makeAccount();
      const results = await Promise.allSettled([writeName(id, "Racer"), erase(id)]);
      const row = await db.account.findUniqueOrThrow({ where: { id } });
      expect(row.erasedAt).not.toBeNull();
      // erase blanks the name; a write that landed after it would leave "Racer" behind
      expect(row.name).toBeNull();
      const w = results[0];
      if (w.status === "rejected") expect((w.reason as AppError).getStatus()).toBe(401);
    }
  });

  it("racing many writes against an erase, 10 times: no write survives the erase", async () => {
    for (let i = 0; i < 10; i++) {
      const id = await makeAccount();
      await Promise.allSettled([writeName(id, "a"), writeName(id, "b"), erase(id), writeName(id, "c"), writeName(id, "d")]);
      const row = await db.account.findUniqueOrThrow({ where: { id } });
      expect(row.erasedAt).not.toBeNull();
      expect(row.name).toBeNull();
    }
  });
});
