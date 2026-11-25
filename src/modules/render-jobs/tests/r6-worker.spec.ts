import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobsService } from "../../jobs/jobs.service";
import { LOST_WORDS, RenderJobsService } from "../render-jobs.service";
import { RenderWorker } from "../render-worker.service";
import { procStart, sweepRenderLeftovers } from "../render-leftovers";
import { bindVideoRenderer } from "../video-binding";
import { NoVideoRenderer, StandinVideoRenderer, VideoRenderer } from "../video-renderer";
import { boot, routeStorage } from "../../concierge/tests/kit";
import { ownDatabase } from "../../../../test/kit/own-db";

/** R6: the video maker's own worker: the loop outside the tick, losses counted on the row, dead holders, leftovers, the binding both ways. */
const NOW = new Date("2027-07-07T09:00:00.000Z");
const MIN = 60_000;

describe("R6: the video maker's worker", () => {
  let k: Awaited<ReturnType<typeof boot>>;
  let svc: RenderJobsService;
  let jobs: JobsService;
  let worker: RenderWorker;
  let route: ReturnType<typeof routeStorage>;
  const r = new StandinVideoRenderer();
  const ownDb = ownDatabase("r6w");
  beforeAll(async () => {
    ownDb.use();
    k = await boot("r6w", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(r) });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
    jobs = k.t.app.get(JobsService);
    worker = k.t.app.get(RenderWorker);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
    ownDb.drop();
  });
  beforeEach(() => {
    k.t.clock.set(NOW);
    jobs.register("render-video", () => undefined);
    svc.register();
  });
  const ask = (auth: string, id: string) => k.t.http().post(`/v1/wishes/${id}/video`).set("Authorization", auth).send({});
  const asked = async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    return (await ask(a.auth, w).expect(200)).body.item.id as string;
  };
  const row = (id: string) => k.db.renderJob.findUniqueOrThrow({ where: { id } });
  const job = (id: string) => k.db.job.findFirstOrThrow({ where: { subjectId: id, type: "render_video" } });

  it("1. a render is taken by its own loop, never by the serial tick; the loop starts it and does not wait", async () => {
    const id = await asked();
    jobs.takeOutOfTick("render-video");
    expect(await jobs.runDue(5, [id])).toBe(0);
    expect((await row(id)).status).toBe("queued");
    r.takes = 300;
    const t0 = performance.now();
    const taken = await jobs.startDue(["render-video"]);
    expect(taken).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(250); // started, not finished
    for (let i = 0; i < 100 && (await row(id)).status === "queued"; i++) await new Promise((x) => setTimeout(x, 10));
    expect((await row(id)).status).toBe("rendering");
    expect((await row(id)).workerId).toBe(svc.workerId);
    await taken?.done;
    r.takes = 0;
    expect((await row(id)).failureWords).toBeNull();
    expect((await row(id)).status).toBe("done");
    expect(await jobs.startDue(["render-video"])).toBeNull();
  });

  it("2. losses are counted on the render row: lost once is taken again and finishes, lost twice is failed for good with words, and Ask again starts clean", async () => {
    const id = await asked();
    const lease = svc.leaseMs() + MIN;
    /** the holder took the row and died: rendering, stamped long ago; the job is due again */
    const holderDied = async (): Promise<void> => {
      await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "outputFileId" = NULL, "workerId" = 'dead:1:1', "updatedAt" = ${new Date(k.t.clock.now().getTime() - lease)} WHERE id = ${id}::uuid`;
      await k.db.$executeRaw`UPDATE job SET status = 'scheduled', "runAt" = ${k.t.clock.now()} WHERE "subjectId" = ${id}`;
    };
    await holderDied();
    await (await jobs.startDue(["render-video"]))?.done;
    expect((await row(id)).failureWords).toBeNull();
    expect(await row(id)).toMatchObject({ status: "done", losses: 1 });
    await holderDied();
    await (await jobs.startDue(["render-video"]))?.done;
    const lost = await row(id);
    expect(lost).toMatchObject({ status: "failed", losses: 2, failureWords: LOST_WORDS });
    expect(lost.tokenHash).toBeNull();
    // the person asks again: the same row, clean
    const wish = await k.db.wish.findUniqueOrThrow({ where: { id: lost.wishId } });
    const auth = (await k.db.account.findUniqueOrThrow({ where: { id: wish.accountId } })).id;
    expect(auth).toBeTruthy();
  });

  it("3. a worker of this machine that is gone releases its row at once: queued with one loss, then failed for good with words at the second", async () => {
    const id = await asked();
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "workerId" = ${`${svc.workerId.split(":")[0]}:999999:1`} WHERE id = ${id}::uuid`;
    await k.db.$executeRaw`UPDATE job SET status = 'running' WHERE "subjectId" = ${id}`;
    expect(await svc.releaseDeadHolders()).toBe(1);
    expect(await row(id)).toMatchObject({ status: "queued", losses: 1 });
    expect((await job(id)).status).toBe("scheduled");
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "workerId" = ${`${svc.workerId.split(":")[0]}:999999:1`} WHERE id = ${id}::uuid`;
    await k.db.$executeRaw`UPDATE job SET status = 'running' WHERE "subjectId" = ${id}`;
    expect(await svc.releaseDeadHolders()).toBe(1);
    expect(await row(id)).toMatchObject({ status: "failed", losses: 2, failureWords: LOST_WORDS });
    // a row held by THIS process is not released, nor one of another machine
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "workerId" = ${svc.workerId} WHERE id = ${id}::uuid`;
    expect(await svc.releaseDeadHolders()).toBe(0);
    await k.db.$executeRaw`UPDATE render_job SET "workerId" = 'other-machine:1:1' WHERE id = ${id}::uuid`;
    expect(await svc.releaseDeadHolders()).toBe(0);
  });

  it("4. the leftover sweep stops a browser a dead worker left (only the very process written down) and removes the old folders and files", async () => {
    const root = mkdtempSync(join(tmpdir(), "r6-sweep-"));
    const child = spawn("sleep", ["60"], { stdio: "ignore", detached: true });
    const impostor = spawn("sleep", ["60"], { stdio: "ignore", detached: true });
    try {
      const pid = child.pid as number;
      const start = procStart(pid);
      expect(start).toBeGreaterThan(0);
      const work = join(root, "fw-render-job1-aaa-work");
      mkdirSync(join(work, "profile"), { recursive: true });
      // the owner is a process that does not exist; one child is the real process, one is a pid whose start time does not match (a reused id)
      writeFileSync(join(work, "children.json"), JSON.stringify({ owner: { pid: 999999, start: 1 }, children: [{ kind: "ffmpeg", pid, start }, { kind: "ffmpeg", pid: impostor.pid, start: start + 100000 }] }));
      const live = join(root, "fw-render-job2-bbb-work");
      mkdirSync(live, { recursive: true });
      writeFileSync(join(live, "children.json"), JSON.stringify({ owner: { pid: process.pid, start: procStart(process.pid) }, children: [] }));
      writeFileSync(join(root, "fw-render-job3-ccc.mp4"), "x");
      writeFileSync(join(root, "keep-me.txt"), "x");
      const res = await sweepRenderLeftovers(10 * MIN, Date.now(), root);
      expect(res.stopped).toBe(1);
      await new Promise((x) => setTimeout(x, 200));
      expect(procStart(pid)).toBe(0); // gone
      expect(procStart(impostor.pid as number)).toBeGreaterThan(0); // not the written process: left alone
      expect(existsSync(work)).toBe(false);
      expect(existsSync(live)).toBe(true); // a live owner's young folder stays
      expect(existsSync(join(root, "fw-render-job3-ccc.mp4"))).toBe(true); // young: stays
      const later = await sweepRenderLeftovers(10 * MIN, Date.now() + 20 * MIN, root);
      expect(later.removed).toBeGreaterThanOrEqual(2);
      expect(existsSync(join(root, "keep-me.txt"))).toBe(true);
    } finally {
      for (const c of [child, impostor]) {
        try {
          process.kill(c.pid as number, "SIGKILL");
        } catch {
          /* gone */
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("5. the binding: live providers with nothing set is the 'not configured' maker with the missing parts named; standin is the stand-in; the web role takes no render", async () => {
    const noDb = { renderJob: {} } as never;
    const clock = { now: () => NOW };
    const off = await bindVideoRenderer({ PROVIDERS: "live" } as never, noDb, clock, {});
    expect(off).toBeInstanceOf(NoVideoRenderer);
    expect(off.configured()).toBe(false);
    expect(off.describe().missing.join(" ")).toMatch(/RENDER_WEB_ORIGIN.*RENDER_TOKEN_SECRET/);
    expect((await off.ping()).state).toBe("error");
    const bad = await bindVideoRenderer({ PROVIDERS: "live", RENDER_WEB_ORIGIN: "http://127.0.0.1:1", RENDER_TOKEN_SECRET: "x".repeat(40), RENDER_CHROMIUM_PATH: "/nowhere/chrome" } as never, noDb, clock, {});
    expect(bad.configured()).toBe(false);
    expect(bad.describe().missing.join(" ")).toMatch(/Chromium is not at \/nowhere\/chrome/);
    const standin = await bindVideoRenderer({ PROVIDERS: "standin" } as never, noDb, clock, {});
    expect(standin).toBeInstanceOf(StandinVideoRenderer);
    expect(standin.describe().real).toBe(false);
    expect(worker.status().concurrency).toBe(2); // the stand-in's default
  });
});
