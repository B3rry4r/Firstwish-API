import { PrismaClient } from "@prisma/client";
import { holdSettingLockForFile } from "./setting-lock";

const KEY = 748202;

// the book's limits are shared by every spec in the run's database: a spec that uploads holds the setting lock for its file
holdSettingLockForFile();

describe("the setting lock a spec file takes with holdSettingLockForFile", () => {
  it("is held while the file's tests run: no other connection can take it, so no other spec changes the book's limits meanwhile", async () => {
    const other = new PrismaClient();
    try {
      const got = await other.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${KEY}) AS ok`;
      expect(got[0].ok).toBe(false);
    } finally {
      await other.$disconnect();
    }
  });
});
