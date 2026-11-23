import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Logger } from "@nestjs/common";
import { JobsService } from "../../jobs/jobs.service";
import { RenderJobsService } from "../render-jobs.service";
import { RENDER_TEMP_PREFIX, StandinVideoRenderer, VideoRenderer, type RenderedFile, type RenderRequest } from "../video-renderer";
import { boot, routeStorage } from "../../concierge/tests/kit";

/** P-R1: every case goes THROUGH THE JOB PATH (the queue's claim and run), on the stand-in clock where time matters. */
const NOW = new Date("2027-07-07T09:00:00.000Z");
const MB = 1024 * 1024;
const MIN = 60_000;
const waitFor = async (what: () => boolean | Promise<boolean>, ms = 5000): Promise<void> => {
  const end = Date.now() + ms;
  while (!(await what())) {
    if (Date.now() > end) throw new Error("waited too long");
    await new Promise((r) => setTimeout(r, 15));
  }
};
const leftovers = async (): Promise<string[]> => (await readdir(tmpdir())).filter((f) => f.startsWith(RENDER_TEMP_PREFIX)).sort();

class Odd extends StandinVideoRenderer {
  fixedPath: string | null = null;
  override async render(input: RenderRequest, signal?: AbortSignal): Promise<RenderedFile> {
    if (this.fixedPath) return { path: this.fixedPath, contentType: "video/mp4", bytes: 5 };
    return super.render(input, signal);
  }
}

describe("P-R1: the render job path", () => {
  let k: Awaited<ReturnType<typeof boot>>;
  let route: ReturnType<typeof routeStorage>;
  let r: Odd;
  let svc: RenderJobsService;
  let jobs: JobsService;
  let envOf: { RENDER_CONCURRENCY: number };
  // a temp folder of this spec's own, so what other specs list in the shared one is not disturbed
  const tmpWas = process.env.TMPDIR;
  const own = mkdtempSync(join(tmpdir(), "pr1-tmp-"));
  beforeAll(async () => {
    process.env.TMPDIR = own;
    r = new Odd();
    k = await boot("pr1", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(r) });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
    jobs = k.t.app.get(JobsService);
    envOf = (svc as unknown as { env: { RENDER_CONCURRENCY: number } }).env;
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
    if (tmpWas === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = tmpWas;
    rmSync(own, { recursive: true, force: true });
  });
  beforeEach(async () => {
    Object.assign(r, { fileBytes: null, hold: null, holdFirstOnly: false, takes: 0, failWith: null, fixedPath: null, aborted: 0, maxActive: 0 });
    r.rendered.length = 0;
    envOf.RENDER_CONCURRENCY = 2;
    svc.erasePollMs = 5000;
    route.fail = false;
    k.t.clock.set(NOW);
    jobs.register("render-video", () => undefined);
    svc.register();
    await k.db.jobKindConfig.updateMany({ where: { kind: "render-video" }, data: { timeLimitSeconds: 1200 } });
  });
  const claim = (id: string): Promise<{ id: string } | null> => (jobs as unknown as { claim: (o: string[]) => Promise<{ id: string } | null> }).claim([id]);
  const ask = (auth: string, id: string) => k.t.http().post(`/v1/wishes/${id}/video`).set("Authorization", auth).send({});
  const asked = async () => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    return { a, w, id: (await ask(a.auth, w).expect(200)).body.item.id as string };
  };
  const row = (id: string) => k.db.renderJob.findUniqueOrThrow({ where: { id } });
  const job = (id: string) => k.db.job.findFirstOrThrow({ where: { subjectId: id, type: "render_video" } });
  const objs = (): number => (k.t.storage as unknown as { objects: Map<string, unknown> }).objects.size;
  /** the worker took the job (claimed it, set the row to rendering) and died: nothing more is written by it */
  const lose = async (id: string): Promise<Date> => {
    const c = await claim(id);
    expect(c).not.toBeNull();
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "updatedAt" = ${k.t.clock.now()} WHERE id = ${id}::uuid`;
    return (await job(id)).runAt;
  };
  let real: typeof fetch;
  beforeAll(() => {
    real = globalThis.fetch; // the storage router the kit installed
  });
  afterEach(() => {
    globalThis.fetch = real;
  });
  /** storage that waits for `gate` after the first piece, and stops when the request's signal aborts */
  const slowStore = (state: { inWrite: boolean }, gate: Promise<void>, after?: () => Promise<void>): void => {
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("https://storage.standin.invalid/")) return real(input as never, init);
      state.inWrite = true;
      let first = true;
      for await (const c of init?.body as unknown as AsyncIterable<Uint8Array>) {
        void c;
        if (first) {
          first = false;
          await Promise.race([gate, new Promise((_, no) => init?.signal?.addEventListener("abort", () => no(new Error("aborted")), { once: true }))]);
        }
      }
      if (after) await after();
      k.t.storage.put(decodeURI(new URL(url).pathname.replace(/^\/[^/]+\//, "")), Buffer.from("x"), "video/mp4");
      return new Response("", { status: 200 });
    });
  };

  describe("H1 a worker lost mid-render", () => {
    it("lost once, then done: the retaken job takes the row over at the job's own lease and finishes it", async () => {
      const { id } = await asked();
      const lease = await lose(id);
      k.t.clock.set(new Date(lease.getTime() + 1000));
      expect(await jobs.runDue(5, [id])).toBe(1);
      expect((await row(id)).status).toBe("done");
      expect(r.rendered).toHaveLength(1);
      expect(await job(id)).toMatchObject({ status: "succeeded", attempts: 2 });
    });

    it("lost twice, then failed: the wish read says failed, the job is parked, and the person asks again on the same job (no second payment)", async () => {
      const { a, w, id } = await asked();
      const first = await lose(id);
      k.t.clock.set(new Date(first.getTime() + 1000));
      const second = await lose(id); // the second worker took it and died too
      expect(await job(id)).toMatchObject({ attempts: 2 });
      k.t.clock.set(new Date(second.getTime() + 1000));
      await jobs.runDue(5, [id]);
      expect((await row(id)).status).toBe("failed");
      expect(r.rendered).toHaveLength(0);
      expect((await job(id)).status).toBe("dead");
      expect((await k.t.app.get(RenderJobsService).latest(a.id, w)).status).toBe("failed");
      const again = await ask(a.auth, w).expect(200);
      expect(again.body.item).toMatchObject({ id, status: "queued" });
      expect(await k.db.renderJob.count({ where: { wishId: w } })).toBe(1);
      expect(await jobs.runDue(5, [id])).toBe(1);
      expect((await row(id)).status).toBe("done");
    });

    it("a skipped run over a row still held never marks the job succeeded", async () => {
      const { id } = await asked();
      const lease = await lose(id);
      // the retaken job arrives while the first holder's row is not yet past its own lease (a row stamped later than the claim)
      await k.db.$executeRaw`UPDATE render_job SET "updatedAt" = ${new Date(lease.getTime() + 5 * MIN)} WHERE id = ${id}::uuid`;
      k.t.clock.set(new Date(lease.getTime() + 1000));
      await jobs.runDue(5, [id]);
      expect((await job(id)).status).not.toBe("succeeded");
      expect((await row(id)).status).toBe("rendering");
    });
  });

  describe("M2 a render waiting for a place does not spend its limit", () => {
    it("with RENDER_CONCURRENCY=1 the second job goes back to the queue at once, without a try, and renders later", async () => {
      envOf.RENDER_CONCURRENCY = 1;
      const A = await asked();
      const B = await asked();
      let open!: () => void;
      r.hold = new Promise<void>((x) => (open = x));
      r.holdFirstOnly = true;
      const runA = jobs.runDue(5, [A.id]);
      await waitFor(() => r.active === 1);
      const timeout = new Promise<string>((x) => setTimeout(() => x("waiting"), 800));
      const outcome = await Promise.race([jobs.runDue(5, [B.id]).then(() => "returned"), timeout]);
      expect(outcome).toBe("returned");
      expect(await job(B.id)).toMatchObject({ status: "scheduled", attempts: 0 });
      expect((await row(B.id)).status).toBe("queued");
      open();
      await runA;
      k.t.clock.set(new Date(NOW.getTime() + 5 * MIN));
      expect(await jobs.runDue(5, [B.id])).toBe(1);
      expect((await row(B.id)).status).toBe("done");
      expect(await job(B.id)).toMatchObject({ status: "succeeded" });
    });

    it("L2: a render that waits for a place and whose wish is erased leaves the line at once (job path, and a direct run)", async () => {
      envOf.RENDER_CONCURRENCY = 1;
      svc.erasePollMs = 20;
      const A = await asked();
      const B = await asked();
      const C = await asked();
      r.hold = new Promise<void>(() => undefined);
      r.holdFirstOnly = true;
      void jobs.runDue(5, [A.id]);
      await waitFor(() => r.active === 1);
      await k.db.wish.update({ where: { id: B.w }, data: { erasedAt: NOW } });
      await Promise.race([jobs.runDue(5, [B.id]), new Promise((x) => setTimeout(x, 800))]);
      expect((await row(B.id)).status).toBe("failed");
      // a direct run in the line
      const direct = svc.run(C.id);
      await new Promise((x) => setTimeout(x, 50));
      await k.db.wish.update({ where: { id: C.w }, data: { erasedAt: NOW } });
      const left = await Promise.race([direct.then(() => "left"), new Promise<string>((x) => setTimeout(() => x("still waiting"), 800))]);
      expect(left).toBe("left");
      expect((await row(C.id)).status).toBe("failed");
      // free the holder by erasing its wish
      await k.db.wish.update({ where: { id: A.w }, data: { erasedAt: NOW } });
      await waitFor(async () => (await row(A.id)).status !== "rendering");
    });
  });

  describe("M3 an erase, or the time limit, during the store write", () => {
    for (const what of ["erase", "limit"] as const) {
      it(`${what}: the upload stops, no file row and no storage object stay now, the row ends failed`, async () => {
        const { a, w, id } = await asked();
        r.fileBytes = 3 * MB;
        if (what === "limit") await k.db.jobKindConfig.updateMany({ where: { kind: "render-video" }, data: { timeLimitSeconds: 1 } });
        else svc.erasePollMs = 20;
        const f0 = await k.db.storedFile.count({ where: { ownerAccountId: a.id } });
        const o0 = objs();
        const temp0 = await leftovers();
        const state = { inWrite: false };
        let release!: () => void;
        slowStore(state, new Promise<void>((x) => (release = x)));
        const run = jobs.runDue(5, [id]);
        await waitFor(() => state.inWrite);
        if (what === "erase") await k.db.wish.update({ where: { id: w }, data: { erasedAt: NOW } });
        await new Promise((x) => setTimeout(x, what === "limit" ? 1500 : 200));
        release();
        await run;
        await waitFor(async () => (await row(id)).status !== "rendering");
        await new Promise((x) => setTimeout(x, 100));
        expect((await row(id)).status).toBe("failed");
        expect((await row(id)).outputFileId).toBeNull();
        expect(await k.db.storedFile.count({ where: { ownerAccountId: a.id } })).toBe(f0);
        expect(objs()).toBe(o0);
        await waitFor(async () => (await leftovers()).length === temp0.length);
        expect(await leftovers()).toEqual(temp0);
      }, 20_000);
    }

    it("erased after the last byte was kept: the file row and object go now, not in a queued cleanup", async () => {
      const { a, w, id } = await asked();
      const f0 = await k.db.storedFile.count({ where: { ownerAccountId: a.id } });
      const o0 = objs();
      slowStore({ inWrite: false }, Promise.resolve(), async () => {
        await k.db.wish.update({ where: { id: w }, data: { erasedAt: NOW } });
      });
      await jobs.runDue(5, [id]);
      expect((await row(id)).status).toBe("failed");
      expect(await k.db.storedFile.count({ where: { ownerAccountId: a.id } })).toBe(f0);
      expect(objs()).toBe(o0);
    });
  });

  describe("L1 the job stores and deletes only a file inside its own temp folder", () => {
    for (const name of ["outside", "symlink"] as const) {
      it(`${name}: refused, the job fails with words in the log, nothing is read and nothing is deleted`, async () => {
        const dir = join(tmpdir(), `pr1-outside-${process.pid}-${name}`);
        mkdirSync(dir, { recursive: true });
        const victim = join(dir, "victim.mp4");
        writeFileSync(victim, "hello");
        let path = victim;
        if (name === "symlink") {
          path = join(tmpdir(), `${RENDER_TEMP_PREFIX}pr1-link-${process.pid}.mp4`);
          symlinkSync(victim, path);
        }
        r.fixedPath = path;
        const { id } = await asked();
        const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        let streamed = 0;
        globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
          if (!String(input).startsWith("https://storage.standin.invalid/")) return real(input as never, init);
          for await (const c of init?.body as unknown as AsyncIterable<Uint8Array>) streamed += c.length;
          return new Response("", { status: 200 });
        });
        try {
          await jobs.runDue(5, [id]);
          expect((await row(id)).status).toBe("failed");
          expect(streamed).toBe(0);
          expect(existsSync(victim)).toBe(true);
          expect(existsSync(path)).toBe(true);
          expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/outside|temp folder|link/i);
        } finally {
          warn.mockRestore();
          rmSync(dir, { recursive: true, force: true });
          if (name === "symlink") rmSync(path, { force: true });
        }
      });
    }
  });

  it("L3: migration 20261208090000 has a down note", () => {
    const sql = readFileSync(join(__dirname, "../../../../prisma/migrations/20261208090000_render_video_job_kind_r1/migration.sql"), "utf8");
    expect(sql).toMatch(/^-- DOWN/m);
    expect(sql).toMatch(/DELETE FROM "job_kind_config" WHERE "kind" = 'render-video'/);
  });
});
