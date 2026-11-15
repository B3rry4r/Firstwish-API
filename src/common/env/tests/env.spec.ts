import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EnvError, loadEnv } from "../env";
import { MANIFEST_VARS, RUNTIME_VARS } from "../env.schema";
import { standinEnv } from "../../../../test/kit/env";

const manifest = JSON.parse(readFileSync(join(__dirname, "../../../../.pipeline/env-manifest.json"), "utf8")) as {
  vars: { name: string; secret: boolean }[];
};

function problemsOf(raw: Record<string, string | undefined>): string[] {
  try {
    loadEnv(raw);
    return [];
  } catch (e) {
    if (!(e instanceof EnvError)) throw e;
    return e.problems.map((p) => p.name);
  }
}

describe("env schema", () => {
  it("lists exactly the variables of .pipeline/env-manifest.json, plus the runtime-only ones", () => {
    expect(MANIFEST_VARS.map((v) => v.name)).toEqual(manifest.vars.map((v) => v.name));
    const runtime = RUNTIME_VARS.map((v) => v.name);
    expect(runtime).toEqual(["NODE_ENV", "PORT", "PROVIDERS"]);
    expect(runtime.filter((n) => manifest.vars.some((v) => v.name === n))).toEqual([]);
  });

  it("boots with the stand-in environment", () => {
    const env = loadEnv(standinEnv());
    expect(env.PROVIDERS).toBe("standin");
    expect(env.PORT).toBe(3000);
    expect(env.RENDER_CONCURRENCY).toBe(2);
    expect(env.WEB_ORIGINS).toEqual(["http://localhost:3000"]);
  });

  it("fails naming the missing variable", () => {
    const raw = { ...standinEnv(), DATABASE_URL: undefined };
    expect(() => loadEnv(raw)).toThrow(/DATABASE_URL: missing \(PostgreSQL connection\)/);
    expect(problemsOf(raw)).toEqual(["DATABASE_URL"]);
  });

  it("treats an empty value as missing", () => {
    expect(problemsOf({ ...standinEnv(), REDIS_URL: "  " })).toEqual(["REDIS_URL"]);
  });

  it("with PROVIDERS=live needs every provider variable, and the storage adapter's own", () => {
    const missing = problemsOf({ ...standinEnv(), PROVIDERS: "live", STORAGE_DRIVER: "spaces" });
    expect(missing).toEqual(
      expect.arrayContaining(["PAYSTACK_SECRET_KEY", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "SCREENING_PROVIDER", "SPACES_BUCKET"]),
    );
    expect(missing).not.toContain("R2_BUCKET");
  });

  it("defaults PROVIDERS to live, so a bare environment never runs on stand-ins", () => {
    const raw = { ...standinEnv(), PROVIDERS: undefined };
    expect(problemsOf(raw)).toContain("PAYSTACK_SECRET_KEY");
  });

  it("refuses stand-ins in production", () => {
    expect(problemsOf({ ...standinEnv(), NODE_ENV: "production" })).toEqual(["PROVIDERS"]);
  });

  it("refuses short secrets, bad URLs and unknown choices", () => {
    expect(problemsOf({ ...standinEnv(), JWT_ACCESS_SECRET: "short", PUBLIC_SITE_URL: "not a url", STORAGE_DRIVER: "s3" })).toEqual([
      "JWT_ACCESS_SECRET",
      "PUBLIC_SITE_URL",
      "STORAGE_DRIVER",
    ]);
  });
});
