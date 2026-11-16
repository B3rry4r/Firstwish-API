import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvError, loadEnv } from "../../env/env";
import { signInApp, uniqueEmail, uniqueIp } from "../../../modules/sessions/tests/sign-in.kit";
import { standinEnv } from "../../../../test/kit/env";

/** HK1: the stand-in email's outbox file. */
describe("HK1 STANDIN_MAIL_OUTBOX", () => {
  const dir = mkdtempSync(join(tmpdir(), "ppr-outbox-"));
  const saved = process.env.STANDIN_MAIL_OUTBOX;
  afterAll(() => {
    if (saved === undefined) delete process.env.STANDIN_MAIL_OUTBOX;
    else process.env.STANDIN_MAIL_OUTBOX = saved;
    rmSync(dir, { recursive: true, force: true });
  });

  it("a sign-in code asked through the real route appears in the file as one JSON line, and signs in", async () => {
    const file = join(dir, "mail.jsonl");
    process.env.STANDIN_MAIL_OUTBOX = file;
    const t = await signInApp();
    try {
      const contact = uniqueEmail("outbox");
      const ask = await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact });
      expect(ask.status).toBe(200);
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const msg = JSON.parse(lines[0]) as Record<string, string>;
      expect(Object.keys(msg).sort()).toEqual(["at", "subject", "template", "text", "to"]);
      expect(msg.to).toBe(contact);
      expect(msg.template).toBe("code");
      expect(Number.isNaN(Date.parse(msg.at))).toBe(false);
      const code = /(\d{6})/.exec(msg.text)?.[1];
      expect(code).toBeDefined();
      const verify = await t.http().post("/v1/auth/codes/verify").set("X-Forwarded-For", uniqueIp()).send({ contact, code });
      expect(verify.status).toBe(200);
      expect(typeof verify.body.accessToken).toBe("string");
    } finally {
      await t.close();
    }
  }, 60000);

  it("unset: nothing is written", async () => {
    const file = join(dir, "unset.jsonl");
    delete process.env.STANDIN_MAIL_OUTBOX;
    const t = await signInApp();
    try {
      const ask = await t.http().post("/v1/auth/codes").set("X-Forwarded-For", uniqueIp()).send({ contact: uniqueEmail("nofile") });
      expect(ask.status).toBe(200);
      expect(t.email.sent.length).toBeGreaterThan(0);
      expect(existsSync(file)).toBe(false);
      expect(readdirSync(dir)).not.toContain("unset.jsonl");
    } finally {
      await t.close();
    }
  }, 60000);

  const problems = (raw: Record<string, string | undefined>): string[] => {
    try {
      loadEnv(raw);
      return [];
    } catch (e) {
      if (!(e instanceof EnvError)) throw e;
      return e.problems.map((p) => p.name);
    }
  };

  it("refuses to start when set with the real email provider (PROVIDERS=live)", () => {
    expect(problems({ ...standinEnv(), PROVIDERS: "live", STANDIN_MAIL_OUTBOX: "/tmp/x.jsonl" })).toContain("STANDIN_MAIL_OUTBOX");
    expect(problems({ ...standinEnv(), STANDIN_MAIL_OUTBOX: "/tmp/x.jsonl" })).toEqual([]);
  });

  it("refuses to start when set in production, and the app itself fails to boot", async () => {
    expect(problems({ ...standinEnv(), NODE_ENV: "production", STANDIN_MAIL_OUTBOX: "/tmp/x.jsonl" })).toContain("STANDIN_MAIL_OUTBOX");
    process.env.STANDIN_MAIL_OUTBOX = join(dir, "never.jsonl");
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await expect(signInApp()).rejects.toThrow(/STANDIN_MAIL_OUTBOX/);
    } finally {
      process.env.NODE_ENV = was;
    }
  }, 60000);
});
