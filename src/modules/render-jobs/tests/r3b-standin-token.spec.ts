import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvError, loadEnv } from "../../../common/env/env";
import { PrismaService } from "../../../common/db/prisma.service";
import { standinEnv } from "../../../../test/kit/env";
import { uniqueAddress } from "../../../../test/kit/app";
import { boot, routeStorage } from "../../concierge/tests/kit";
import { RenderJobsService } from "../render-jobs.service";
import { RENDER_TEMP_PREFIX, StandinVideoRenderer, VideoRenderer, videoRendererFor } from "../video-renderer";

const NOW = new Date("2027-08-07T09:00:00.000Z");
const dir = mkdtempSync(join(tmpdir(), "r3b-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
type Kit = Awaited<ReturnType<typeof boot>>;

const problems = (raw: Record<string, string | undefined>): string[] => {
  try {
    loadEnv(raw);
    return [];
  } catch (e) {
    if (!(e instanceof EnvError)) throw e;
    return e.problems.map((p) => p.name);
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const req = (jobId: string, token = "tok-" + jobId) => ({ wishId: "w-1", jobId, kind: "status-video" as const, width: 1080, height: 1920, seconds: 60, token });
const lines = (file: string) => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);

describe("R3B (IK7): the stand-in renderer's token file and hold, for test stacks", () => {
  it("1. boot: STANDIN_RENDER_TOKENS needs PROVIDERS=standin and a NODE_ENV other than production, with words", () => {
    const file = join(dir, "t.jsonl");
    expect(problems({ ...standinEnv(), STANDIN_RENDER_TOKENS: file })).toEqual([]);
    expect(problems({ ...standinEnv(), PROVIDERS: "live", STANDIN_RENDER_TOKENS: file })).toContain("STANDIN_RENDER_TOKENS");
    expect(problems({ ...standinEnv(), NODE_ENV: "production", STANDIN_RENDER_TOKENS: file })).toContain("STANDIN_RENDER_TOKENS");
    try {
      loadEnv({ ...standinEnv(), NODE_ENV: "production", STANDIN_RENDER_TOKENS: file });
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/STANDIN_RENDER_TOKENS.*refused.*stand-in/);
    }
  });

  it("2. boot: STANDIN_VIDEO=hold is allowed with the stand-ins and refused with live providers or in production; other words still refused", () => {
    expect(problems({ ...standinEnv(), STANDIN_VIDEO: "hold" })).toEqual([]);
    expect(problems({ ...standinEnv(), STANDIN_VIDEO: "fail" })).toEqual([]);
    expect(problems({ ...standinEnv(), PROVIDERS: "live", STANDIN_VIDEO: "hold" })).toContain("STANDIN_VIDEO");
    expect(problems({ ...standinEnv(), NODE_ENV: "production", STANDIN_VIDEO: "hold" })).toContain("STANDIN_VIDEO");
    expect(problems({ ...standinEnv(), STANDIN_VIDEO: "slow" })).toContain("STANDIN_VIDEO");
    expect(problems({ ...standinEnv(), RENDER_STANDIN_HOLD_SECONDS: "abc" })).toContain("RENDER_STANDIN_HOLD_SECONDS");
  });

  it("1. a line {jobId, wishId, kind, width, height, seconds, token} is appended, the file is made 0600; unset writes nothing anywhere", async () => {
    const file = join(dir, "lines.jsonl");
    const r = videoRendererFor({ PROVIDERS: "standin", STANDIN_RENDER_TOKENS: file }) as StandinVideoRenderer;
    const a = await r.render(req("j1"));
    const b = await r.render(req("j2"));
    expect(existsSync(a.path)).toBe(true);
    rmSync(a.path);
    rmSync(b.path);
    expect(lines(file)).toEqual([
      { jobId: "j1", wishId: "w-1", kind: "status-video", width: 1080, height: 1920, seconds: 60, token: "tok-j1" },
      { jobId: "j2", wishId: "w-1", kind: "status-video", width: 1080, height: 1920, seconds: 60, token: "tok-j2" },
    ]);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const before = readdirSync(dir).sort();
    const quiet = videoRendererFor({ PROVIDERS: "standin" }) as StandinVideoRenderer;
    rmSync((await quiet.render(req("j3"))).path);
    expect(readdirSync(dir).sort()).toEqual(before);
  });

  it("1. with live providers nothing is written even if the name is given", async () => {
    const file = join(dir, "live.jsonl");
    const r = videoRendererFor({ PROVIDERS: "live", STANDIN_RENDER_TOKENS: file });
    expect(r.configured()).toBe(false);
    await expect(r.render(req("x"))).rejects.toThrow();
    expect(existsSync(file)).toBe(false);
  });

  it("2. hold: waits after its line until the token is spent; the cap ends it; an abort ends it at once with no file", async () => {
    const file = join(dir, "hold.jsonl");
    let spent = false;
    const r = new StandinVideoRenderer();
    r.tokenFile = file;
    r.holdUntilSpent = () => Promise.resolve(spent);
    let done = false;
    const p = r.render(req("h1")).then((f) => ((done = true), f));
    await wait(350);
    expect(done).toBe(false);
    expect(lines(file)).toHaveLength(1);
    spent = true;
    const out = await p;
    expect(readFileSync(out.path, "utf8")).toBe("standin-video:w-1:status-video");
    rmSync(out.path);
    // cap
    const c = new StandinVideoRenderer();
    c.holdUntilSpent = () => Promise.resolve(false);
    c.holdSeconds = 0.3;
    const t0 = Date.now();
    rmSync((await c.render(req("h2"))).path);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    // abort
    const mark = `${RENDER_TEMP_PREFIX}h3-`;
    const ac = new AbortController();
    const h = new StandinVideoRenderer();
    h.holdUntilSpent = () => Promise.resolve(false);
    const q = h.render(req("h3"), ac.signal);
    await wait(150);
    ac.abort();
    await expect(q).rejects.toThrow(/aborted/);
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith(mark))).toEqual([]);
  });
});

describe("R3B (IK7): through the real routes, a job still rendering when its page reads", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  let svc: RenderJobsService;
  const file = join(dir, "stack.jsonl");
  beforeAll(async () => {
    k = await boot("r3b", NOW, {
      configure: (b) =>
        b.overrideProvider(VideoRenderer).useFactory({ inject: [PrismaService], factory: (db: PrismaService) => videoRendererFor({ PROVIDERS: "standin", STANDIN_VIDEO: "hold", STANDIN_RENDER_TOKENS: file, RENDER_STANDIN_HOLD_SECONDS: 30 }, db) }),
    });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  const http = () => k.t.http();
  const me = uniqueAddress();
  async function ask() {
    const a = await k.account();
    const w = await k.wish(a.id, { status: "sealed", ticket: "keepsake", adds: ["extra.portrait-video"], opensAt: new Date(NOW.getTime() + 86_400_000) });
    const job = (await http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({})).body.item as { id: string };
    return { a, w, job };
  }
  const tokenOf = async (jobId: string) => {
    for (let i = 0; i < 200; i++) {
      const l = existsSync(file) ? lines(file).find((x) => x.jobId === jobId) : undefined;
      if (l) return String(l.token);
      await wait(25);
    }
    throw new Error("no token line");
  };

  it("2. the job holds while rendering; the read with its token answers 200 once; then done and the wish read says ready", async () => {
    const { a, w, job } = await ask();
    const run = svc.run(job.id);
    const token = await tokenOf(job.id);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect((await k.db.renderJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("rendering");
    expect((await http().get(`/v1/wishes/${w}`).set("Authorization", a.auth)).body.video).not.toBe("ready");
    const first = await http().get(`/v1/render/${token}/wish`).set("X-Forwarded-For", me);
    expect(first.status).toBe(200);
    expect(await run).toBe("done");
    expect((await http().get(`/v1/render/${token}/wish`).set("X-Forwarded-For", me)).status).toBe(404);
    expect((await http().get(`/v1/wishes/${w}`).set("Authorization", a.auth)).body.video).toBe("ready");
  }, 60000);

  it("2. an abort during the hold ends the job at once with no file (IK4a)", async () => {
    const { job } = await ask();
    const ac = new AbortController();
    const run = svc.run(job.id, ac.signal);
    await tokenOf(job.id);
    const t0 = Date.now();
    ac.abort();
    expect(await run).toBe("failed");
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith(`${RENDER_TEMP_PREFIX}${job.id}-`))).toEqual([]);
  }, 60000);
});
