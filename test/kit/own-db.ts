import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "../..");

/**
 * A database of this spec's own, for a spec that reads or counts rows other specs also make (a list that is one page, the newest price-book
 * version, a counter): in the shared database another spec's rows move the answer; in its own it cannot. It is a copy of the migrated
 * template (scripts/db.mjs), named <prefix>_test_<tag>_<pid>, so the prefix rules of the test runner hold. Call `use()` first in beforeAll,
 * before the app is made (the app reads DATABASE_URL then), and `drop()` last in afterAll.
 */
export function ownDatabase(tag: string): { use: () => void; drop: () => void } {
  const prefix = process.env.TEST_DB_PREFIX || "fw";
  const name = `${prefix}_test_${tag}_${process.pid}`;
  const before = process.env.DATABASE_URL;
  return {
    use() {
      const made = spawnSync(process.execPath, [join(ROOT, "scripts/db.mjs"), "create", name, prefix], { encoding: "utf8" });
      if (made.status !== 0) throw new Error(`no database: ${made.stderr}`);
      process.env.DATABASE_URL = made.stdout.trim().split("\n").pop();
    },
    drop() {
      if (before === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = before;
      spawnSync(process.execPath, [join(ROOT, "scripts/db.mjs"), "drop", name], { encoding: "utf8" });
    },
  };
}
