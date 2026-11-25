import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { ChromiumVideoRenderer, childEnv } from "../chromium-video-renderer";
import { JobsService } from "../../jobs/jobs.service";
import { RenderJobsService } from "../render-jobs.service";
import { procStart, sweepRenderLeftovers } from "../render-leftovers";
import { StandinVideoRenderer, VideoRenderer } from "../video-renderer";
import { boot } from "../../concierge/tests/kit";
import { ownDatabase } from "../../../../test/kit/own-db";

/** R6 round 1 (IK6j): the recorder's children get a short environment; a hostname proves nothing about a holder; a live owner's folder is never swept. */
const SECRETS = { DATABASE_URL: "postgres://s", JWT_ACCESS_SECRET: "jwt-s", INTERNAL_TOKEN: "int-s", RENDER_TOKEN_SECRET: "rts-s" };
const NOW = new Date("2027-07-07T09:00:00.000Z");

describe("R6 IK6j 1: the recorder's children never see the server's secrets", () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const [k, v] of Object.entries(SECRETS)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("a real child started with childEnv has no secret in /proc/<pid>/environ", () => {
    const c = spawn("sleep", ["30"], { stdio: "ignore", env: childEnv({ HOME: "/tmp/x" }) });
    try {
      const environ = readFileSync(`/proc/${c.pid}/environ`, "utf8");
      for (const k of Object.keys(SECRETS)) expect(environ).not.toContain(k);
      expect(environ).toContain("HOME=/tmp/x");
    } finally {
      c.kill("SIGKILL");
    }
  });

  it("the browser launch of the boot check gets the short environment", async () => {
    const dir = mkdtempSync(join(tmpdir(), "r6-pw-"));
    const seen = join(dir, "seen.json");
    const mod = join(dir, "fake-pw.js");
    writeFileSync(mod, `module.exports = { chromium: { launch: async (o) => { require("fs").writeFileSync(${JSON.stringify(seen)}, JSON.stringify(o.env)); return { close: async () => undefined }; } } };`);
    try {
      const r = new ChromiumVideoRenderer({ webOrigin: "http://127.0.0.1:1", chromiumPath: "/bin/sh", ffmpegPath: "/usr/bin/ffmpeg", playwrightModule: mod });
      const why = await r.probe();
      if (why && /ffmpeg|ffprobe/.test(why)) return; // no encoder on this machine: the launch is not reached
      expect(why).toBeNull();
      const env = JSON.parse(readFileSync(seen, "utf8")) as Record<string, string>;
      for (const k of Object.keys(SECRETS)) expect(env[k]).toBeUndefined();
      expect(Object.keys(env).filter((n) => !["HOME", "LANG", "PATH", "TMPDIR"].includes(n))).toEqual([]);
      expect(env.HOME).toContain("fw-render-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("R6 IK6j 3: the leftovers sweep keeps a live owner's folder and children", () => {
  it("an old folder of a live owner stays with its child, whatever its age; the same folder of a dead owner goes", async () => {
    const root = mkdtempSync(join(tmpdir(), "r6-sweep2-"));
    const child = spawn("sleep", ["60"], { stdio: "ignore", detached: true });
    try {
      const pid = child.pid as number;
      const rec = (owner: { pid: number; start: number }) => JSON.stringify({ owner, children: [{ kind: "ffmpeg", pid, start: procStart(pid) }] });
      const live = join(root, "fw-render-live-work");
      mkdirSync(live, { recursive: true });
      writeFileSync(join(live, "children.json"), rec({ pid: process.pid, start: procStart(process.pid) }));
      const old = new Date(Date.now() - 3 * 3600_000);
      utimesSync(live, old, old);
      const res = await sweepRenderLeftovers(10 * 60_000, Date.now(), root);
      expect(res).toEqual({ stopped: 0, removed: 0 });
      expect(existsSync(live)).toBe(true);
      expect(procStart(pid)).toBeGreaterThan(0);
      writeFileSync(join(live, "children.json"), rec({ pid: 999999, start: 1 }));
      const res2 = await sweepRenderLeftovers(10 * 60_000, Date.now(), root);
      expect(res2).toEqual({ stopped: 1, removed: 1 });
      expect(existsSync(live)).toBe(false);
    } finally {
      try {
        process.kill(child.pid as number, "SIGKILL");
      } catch {
        /* gone */
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("R6 IK6j 2: who held a render row", () => {
  let k: Awaited<ReturnType<typeof boot>>;
  let svc: RenderJobsService;
  const ownDb = ownDatabase("r6i");
  const envOf = () => (svc as unknown as { env: { RENDER_WORKER_ID?: string } }).env;
  beforeAll(async () => {
    ownDb.use();
    k = await boot("r6i", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new StandinVideoRenderer()) });
    svc = k.t.app.get(RenderJobsService);
    k.t.app.get(JobsService).register("render-video", () => undefined);
    svc.register();
  });
  afterAll(async () => {
    await k.t.close();
    ownDb.drop();
  });
  afterEach(() => {
    delete envOf().RENDER_WORKER_ID;
  });
  const held = async (holder: string): Promise<string> => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    const id = (await k.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(200)).body.item.id as string;
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "workerId" = ${holder}, "updatedAt" = ${k.t.clock.now()} WHERE id = ${id}::uuid`;
    await k.db.$executeRaw`UPDATE job SET status = 'running' WHERE "subjectId" = ${id}`;
    return id;
  };
  const status = async (id: string) => (await k.db.renderJob.findUniqueOrThrow({ where: { id } })).status;

  it("a row held by a different id with a live lease is never freed", async () => {
    envOf().RENDER_WORKER_ID = "machine-a";
    const id = await held("machine-b:999999:1");
    expect(await svc.releaseDeadHolders()).toBe(0);
    expect(await status(id)).toBe("rendering");
    const id2 = await held(`${hostname()}:999999:1`); // a hostname-shaped holder is no proof either
    expect(await svc.releaseDeadHolders()).toBe(0);
    expect(await status(id2)).toBe("rendering");
  });

  it("the same id after a restart is freed at once", async () => {
    envOf().RENDER_WORKER_ID = "machine-a";
    const id = await held("machine-a:999999:1");
    expect(svc.workerId.startsWith("machine-a:")).toBe(true);
    expect(await svc.releaseDeadHolders()).toBeGreaterThanOrEqual(1);
    expect(await status(id)).toBe("queued");
  });

  it("with no id set, nothing is freed early: only lease expiry frees", async () => {
    const id = await held("machine-a:999999:1");
    expect(svc.workerId.startsWith("-:")).toBe(true);
    expect(await svc.releaseDeadHolders()).toBe(0);
    expect(await status(id)).toBe("rendering");
  });
});
