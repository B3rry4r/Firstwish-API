import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvError, loadEnv } from "../../../common/env/env";
import { standinEnv } from "../../../../test/kit/env";
import { SPEC } from "../render-jobs.service";
import { StandinVideoRenderer, videoRendererFor } from "../video-renderer";

const dir = mkdtempSync(join(tmpdir(), "r3c-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const req = (jobId: string) => ({ wishId: "w-1", jobId, kind: "status-video" as const, width: 1080, height: 1920, seconds: 60, token: "tok-" + jobId });
const problems = (raw: Record<string, string | undefined>): string[] => {
  try {
    loadEnv(raw);
    return [];
  } catch (e) {
    if (!(e instanceof EnvError)) throw e;
    return e.problems.map((p) => p.name);
  }
};
const hold = (file?: string, spent: () => boolean = () => false) => {
  const r = videoRendererFor({ PROVIDERS: "standin", STANDIN_VIDEO: "hold", ...(file ? { STANDIN_RENDER_HOLD_FILE: file } : {}), RENDER_STANDIN_HOLD_SECONDS: 5 }) as StandinVideoRenderer;
  r.holdUntilSpent = () => Promise.resolve(spent());
  return r;
};

describe("R3C (IK7a): the hold is asked for by a test", () => {
  it("1. boot: STANDIN_RENDER_HOLD_FILE is allowed and refused exactly as STANDIN_RENDER_TOKENS", () => {
    const f = join(dir, "h");
    expect(problems({ ...standinEnv(), STANDIN_RENDER_HOLD_FILE: f })).toEqual([]);
    expect(problems({ ...standinEnv(), PROVIDERS: "live", STANDIN_RENDER_HOLD_FILE: f })).toContain("STANDIN_RENDER_HOLD_FILE");
    expect(problems({ ...standinEnv(), NODE_ENV: "production", STANDIN_RENDER_HOLD_FILE: f })).toContain("STANDIN_RENDER_HOLD_FILE");
  });

  it("2. file present: the render holds until the token is read", async () => {
    const f = join(dir, "present");
    writeFileSync(f, "");
    let spent = false;
    const r = hold(f, () => spent);
    let done = false;
    const p = r.render(req("a")).then((x) => ((done = true), x));
    await wait(350);
    expect(done).toBe(false);
    spent = true;
    rmSync((await p).path);
  });

  it("3. file absent: made at once; with the name not set it holds as before", async () => {
    const t0 = Date.now();
    rmSync((await hold(join(dir, "none")).render(req("b"))).path);
    expect(Date.now() - t0).toBeLessThan(300);
    let spent = false;
    const r = hold(undefined, () => spent);
    let done = false;
    const p = r.render(req("c")).then((x) => ((done = true), x));
    await wait(350);
    expect(done).toBe(false);
    spent = true;
    rmSync((await p).path);
  });

  it("4. removed mid-hold: the running hold still ends by the read, the abort or the cap", async () => {
    const f = join(dir, "mid");
    writeFileSync(f, "");
    let spent = false;
    const r = hold(f, () => spent);
    let done = false;
    const p = r.render(req("d")).then((x) => ((done = true), x));
    await wait(200);
    rmSync(f);
    await wait(250);
    expect(done).toBe(false);
    spent = true;
    rmSync((await p).path);
    const ac = new AbortController();
    writeFileSync(f, "");
    const q = hold(f).render(req("e"), ac.signal);
    await wait(150);
    rmSync(f);
    ac.abort();
    await expect(q).rejects.toThrow(/aborted/);
    writeFileSync(f, "");
    const c = hold(f);
    c.holdSeconds = 0.3;
    const t0 = Date.now();
    const cap = c.render(req("f"));
    rmSync(f);
    rmSync((await cap).path);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
  });

  it("5. IK6a: a status video is 60 seconds, the keepsake 60", () => {
    expect(SPEC["status-video"].seconds).toBe(60);
    expect(SPEC["keepsake-export"].seconds).toBe(60);
  });
});
