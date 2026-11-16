import { PrismaClient } from "@prisma/client";

/**
 * Specs that read or change the payout threshold (one row, shared by every spec in the run's database) take this lock for
 * their whole file, so one never changes the figure while another counts against it. Session-level advisory lock on a
 * connection of its own; released by the file's afterAll (or by the connection closing).
 */
const KEY = 748202;

export async function holdSettingLock(): Promise<() => Promise<void>> {
  const url = new URL(process.env.DATABASE_URL as string);
  url.searchParams.set("connection_limit", "1");
  const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await client.$executeRaw`SELECT pg_advisory_lock(${KEY})`;
  return async () => {
    await client.$executeRaw`SELECT pg_advisory_unlock(${KEY})`;
    await client.$disconnect();
  };
}
