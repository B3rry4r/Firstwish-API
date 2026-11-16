import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvError } from "../../env/env";
import { StandinEmail } from "../adapters/standins";
import { signInApp } from "../../../modules/sessions/tests/sign-in.kit";

const mode = (p: string) => statSync(p).mode & 0o777;
const problem = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof EnvError)) throw e;
    return e.problems.map((p) => `${p.name}: ${p.problem}`).join("; ");
  }
  return "";
};

/** API-BASE-3: the stand-in mail file holds sign-in codes (mode 0600) and a bad path is a clear config error at boot. */
describe("stand-in mail file (STANDIN_MAIL_OUTBOX)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ab3-outbox-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("is created with mode 0600 and each line written keeps it", async () => {
    const file = join(dir, "new.jsonl");
    const mail = new StandinEmail(file);
    expect(mode(file)).toBe(0o600);
    await mail.send({ to: "a@example.com", subject: "Your code", text: "123456", template: "code" });
    expect(mode(file)).toBe(0o600);
  });

  it("a file that was there already with wider rights is narrowed to 0600", () => {
    const file = join(dir, "old.jsonl");
    writeFileSync(file, "", { mode: 0o644 });
    chmodSync(file, 0o644);
    expect(mode(file)).toBe(0o644);
    new StandinEmail(file);
    expect(mode(file)).toBe(0o600);
  });

  it("a directory, or a folder that is not there, is a config error naming STANDIN_MAIL_OUTBOX when the stand-in is made", () => {
    const folder = join(dir, "a-folder");
    mkdirSync(folder);
    expect(problem(() => new StandinEmail(folder))).toMatch(/STANDIN_MAIL_OUTBOX: it is a directory/);
    expect(problem(() => new StandinEmail(join(dir, "missing", "mail.jsonl")))).toMatch(/STANDIN_MAIL_OUTBOX: it cannot be opened for writing \(ENOENT\)/);
  });

  it("the app itself refuses to boot with a directory as the path (no throw at send time)", async () => {
    const saved = process.env.STANDIN_MAIL_OUTBOX;
    process.env.STANDIN_MAIL_OUTBOX = dir;
    try {
      await expect(signInApp()).rejects.toThrow(/STANDIN_MAIL_OUTBOX.*directory/);
    } finally {
      if (saved === undefined) delete process.env.STANDIN_MAIL_OUTBOX;
      else process.env.STANDIN_MAIL_OUTBOX = saved;
    }
  }, 60000);
});
