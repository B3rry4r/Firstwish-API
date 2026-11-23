import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { tmpdir } from "node:os";
import { EnvError, loadEnv } from "../../../common/env/env";
import { MANIFEST_VARS } from "../../../common/env/env.schema";
import { standinEnv } from "../../../../test/kit/env";
import { JobsService, LEASE_MS, maxTriesOf } from "../../jobs/jobs.service";
import { RenderJobsService, RENDER_LEASE_MS } from "../render-jobs.service";
import { NoVideoRenderer, RENDER_TEMP_PREFIX, StandinVideoRenderer, VideoRenderer, videoRendererFor } from "../video-renderer";
import { boot, ids, routeStorage } from "../../concierge/tests/kit";
import { RUN } from "../../../../test/kit/unique";

const NOW = new Date("2027-07-07T09:00:00.000Z");
const MB = 1024 * 1024;
type Kit = Awaited<ReturnType<typeof boot>>;
let n = 0;

/** A full collection, so the memory read is what is held, not what is waiting to be collected. */
const collect = (): void => {
  setFlagsFromString("--expose-gc");
  (runInNewContext("gc") as () => void)();
};

/** What a render left in the temp folder (every temp file of a render starts with RENDER_TEMP_PREFIX). */
const leftovers = async (): Promise<string[]> => (await readdir(tmpdir())).filter((f) => f.startsWith(RENDER_TEMP_PREFIX)).sort();
const waitFor = async (what: () => boolean | Promise<boolean>, ms = 4000): Promise<void> => {
  const end = Date.now() + ms;
  while (!(await what())) {
    if (Date.now() > end) throw new Error("waited too long");
    await new Promise((r) => setTimeout(r, 15));
  }
};
/** a promise a test settles by hand; a render holds on it */
const gate = (): { wait: Promise<void>; open: () => void } => {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
};

describe("R1 cases 1 to 4: the video port gives a file, takes an abort, has its own time and honours RENDER_CONCURRENCY", () => {
  let k: Kit;
  let route: ReturnType<typeof routeStorage>;
  let renderer: StandinVideoRenderer;
  let svc: RenderJobsService;
  let jobs: JobsService;
  beforeAll(async () => {
    renderer = new StandinVideoRenderer();
    k = await boot("r1p", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(renderer) });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
    jobs = k.t.app.get(JobsService);
  });
  afterAll(async () => {
    route.restore();
    await k.t.close();
  });
  beforeEach(async () => {
    route.fail = false;
    renderer.on = true;
    renderer.failWith = null;
    renderer.fileBytes = null;
    renderer.hold = null;
    renderer.holdFirstOnly = false;
    renderer.takes = 0;
    renderer.rendered.length = 0;
    renderer.aborted = 0;
    renderer.maxActive = 0;
    svc.erasePollMs = 5000;
    k.t.clock.set(NOW);
    jobs.register("render-video", () => undefined);
    svc.register();
    await k.db.jobKindConfig.updateMany({ where: { kind: "render-video" }, data: { timeLimitSeconds: 1200 } });
  });

  const ask = (auth: string, id: string) => k.t.http().post(`/v1/wishes/${id}/video`).set("Authorization", auth).send({});
  const asked = async (): Promise<{ a: { id: string; auth: string }; w: string; id: string }> => {
    const a = await k.account();
    const w = await k.wish(a.id, { ticket: "signature" });
    return { a, w, id: (await ask(a.auth, w).expect(200)).body.item.id };
  };
  const row = (id: string) => k.db.renderJob.findUniqueOrThrow({ where: { id } });

  it("1. the result is a file on disk with its size; the job streams a 40 MB file to the store without holding it, and removes the temp file after a success and after a failure", async () => {
    const direct = await renderer.render({ wishId: ids.next(), kind: "status-video", width: 1080, height: 1920, seconds: 30 });
    expect(Buffer.isBuffer((direct as unknown as { bytes: unknown }).bytes)).toBe(false);
    expect(direct).toMatchObject({ contentType: "video/mp4" });
    expect((await stat(direct.path)).size).toBe(direct.bytes);
    await rm(direct.path);

    const { a, id } = await asked();
    renderer.fileBytes = 40 * MB;
    // storage here only counts what streams past (nothing is kept in this process), so the memory seen is the job's own
    const real = globalThis.fetch;
    const seen = { bytes: 0, maxChunk: 0, peakBuffers: 0, peakRss: 0, chunks: 0, sha: createHash("sha256"), streamed: false };
    globalThis.fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (!url.startsWith("https://storage.standin.invalid/")) return real(input as never, init);
      const body = init?.body as ReadableStream<Uint8Array> | Uint8Array;
      seen.streamed = !(body instanceof Uint8Array);
      for await (const c of body as unknown as AsyncIterable<Uint8Array>) {
        seen.bytes += c.length;
        seen.maxChunk = Math.max(seen.maxChunk, c.length);
        seen.sha.update(c);
        if (++seen.chunks % 8 === 0) collect();
        const m = process.memoryUsage();
        seen.peakBuffers = Math.max(seen.peakBuffers, m.arrayBuffers);
        seen.peakRss = Math.max(seen.peakRss, m.rss);
      }
      const key = decodeURI(new URL(url).pathname.replace(/^\/[^/]+\//, ""));
      k.t.storage.put(key, Buffer.from("x"), "video/mp4");
      return new Response("", { status: 200 });
    };
    const before = leftovers();
    collect();
    const m0 = process.memoryUsage();
    try {
      expect(await svc.run(id)).toBe("done");
    } finally {
      globalThis.fetch = real;
    }
    expect(seen.streamed).toBe(true);
    expect(seen.bytes).toBe(40 * MB);
    expect(seen.maxChunk).toBeLessThan(4 * MB);
    // a whole 40 MB buffer would raise both of these by 40 MB or more
    expect(seen.peakBuffers - m0.arrayBuffers).toBeLessThan(16 * MB);
    expect(seen.peakRss - m0.rss).toBeLessThan(60 * MB);
    const f = await k.db.storedFile.findUniqueOrThrow({ where: { id: (await row(id)).outputFileId as string } });
    expect(f).toMatchObject({ ownerAccountId: a.id, purpose: "render", kind: "video", bytes: BigInt(40 * MB) });
    expect(f.sha256).toBe(seen.sha.digest("hex"));
    expect(await leftovers()).toEqual(await before);

    // a failure after the file was made (storage refuses it): still no temp file, and the person can ask again
    const second = await asked();
    route.fail = true;
    renderer.fileBytes = 3 * MB;
    expect(await svc.run(second.id)).toBe("failed");
    route.fail = false;
    expect((await row(second.id)).status).toBe("failed");
    expect(await leftovers()).toEqual(await before);
    // a failure in the renderer itself
    renderer.failWith = "boom";
    const third = await asked();
    expect(await svc.run(third.id)).toBe("failed");
    expect(await leftovers()).toEqual(await before);
    renderer.failWith = null;
    expect((await ask(second.a.auth, second.w).expect(200)).body.item.status).toBe("queued");
  }, 60_000);

  it("1. the store's hash and size for a small file match the file (the streamed write keeps what the bytes write kept)", async () => {
    const { id } = await asked();
    expect(await svc.run(id)).toBe("done");
    const f = await k.db.storedFile.findUniqueOrThrow({ where: { id: (await row(id)).outputFileId as string } });
    const bytes = (await k.t.storage.readStart(f.objectKey, 1000)) as Buffer;
    expect(f.bytes).toBe(BigInt(bytes.length));
    expect(f.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("2. the job's time limit ends: the stand-in sees the abort, the job ends failed, nothing is left, and the person asks again", async () => {
    await k.db.jobKindConfig.updateMany({ where: { kind: "render-video" }, data: { timeLimitSeconds: 1 } });
    const { a, w, id } = await asked();
    renderer.hold = new Promise<void>(() => undefined); // a render that never ends
    const before = await leftovers();
    expect(await jobs.runDue(5, [id])).toBe(1);
    expect(renderer.aborted).toBe(1);
    await waitFor(async () => (await row(id)).status === "failed");
    const run = await k.db.jobRun.findFirstOrThrow({ where: { job: { subjectId: id } }, orderBy: { startedAt: "desc" } });
    expect(run).toMatchObject({ outcome: "failed" });
    expect(run.error).toMatch(/timeout/);
    expect((await row(id)).outputFileId).toBeNull();
    expect(await leftovers()).toEqual(before);
    // asked again: queued, and with the renderer free it ends done
    renderer.hold = null;
    await k.db.jobKindConfig.updateMany({ where: { kind: "render-video" }, data: { timeLimitSeconds: 1200 } });
    expect((await ask(a.auth, w).expect(200)).body.item).toMatchObject({ id, status: "queued" });
    expect(await jobs.runDue(5, [id])).toBe(1);
    expect((await row(id)).status).toBe("done");
  }, 30_000);

  it("2. the wish is erased mid-render: the stand-in sees the abort, nothing is written (IK4a), no temp file stays", async () => {
    svc.erasePollMs = 20;
    const { a, w, id } = await asked();
    renderer.hold = new Promise<void>(() => undefined);
    const files = await k.db.storedFile.count({ where: { ownerAccountId: a.id } });
    const before = await leftovers();
    const running = svc.run(id);
    await waitFor(() => renderer.active === 1);
    await k.db.wish.update({ where: { id: w }, data: { erasedAt: NOW } });
    expect(await running).toBe("failed");
    expect(renderer.aborted).toBe(1);
    expect(await row(id)).toMatchObject({ status: "failed", outputFileId: null });
    expect(await k.db.storedFile.count({ where: { ownerAccountId: a.id } })).toBe(files);
    expect(await leftovers()).toEqual(before);
    await ask(a.auth, w).expect(404); // an erased wish is not asked again (IK4a)
  });

  it("3. the render-video kind has a 20 minute limit; the lease and RENDER_LEASE_MS are longer; a 12 minute render is not taken twice", async () => {
    expect((await k.db.jobKindConfig.findUniqueOrThrow({ where: { kind: "render-video" } })).timeLimitSeconds).toBe(1200);
    await svc.setTimeLimit(); // RENDER_TIME_LIMIT_SECONDS defaults to 1200
    expect((await k.db.jobKindConfig.findUniqueOrThrow({ where: { kind: "render-video" } })).timeLimitSeconds).toBe(1200);
    expect(RENDER_LEASE_MS).toBeGreaterThan(20 * 60_000);
    expect(LEASE_MS).toBeLessThan(20 * 60_000); // the lease every other kind keeps
    const { id } = await asked();
    const g = gate();
    renderer.hold = g.wait;
    renderer.holdFirstOnly = true;
    const first = jobs.runDue(5, [id]);
    await waitFor(() => renderer.active === 1);
    const job = await k.db.job.findFirstOrThrow({ where: { subjectId: id, type: "render_video" } });
    expect(job.status).toBe("running");
    expect(job.runAt.getTime() - NOW.getTime()).toBeGreaterThan(20 * 60_000); // leased past its limit
    // the stand-in clock: 12 minutes into the render (the old lease was 10)
    k.t.clock.set(new Date(NOW.getTime() + 12 * 60_000));
    expect(await jobs.runDue(5, [id])).toBe(0); // the job is not claimed again
    expect(await svc.run(id)).toBe("skipped"); // nor the render row
    expect(renderer.rendered).toHaveLength(1);
    g.open();
    expect(await first).toBe(1);
    expect((await row(id)).status).toBe("done");
    expect(renderer.rendered).toHaveLength(1);
  });

  it("3. a run that lost its worker is taken again only after the new lease", async () => {
    const { id } = await asked();
    await k.db.$executeRaw`UPDATE render_job SET status = 'rendering', "updatedAt" = ${NOW} WHERE id = ${id}::uuid`;
    k.t.clock.set(new Date(NOW.getTime() + 12 * 60_000));
    expect(await svc.run(id)).toBe("skipped");
    k.t.clock.set(new Date(NOW.getTime() + 26 * 60_000));
    expect(await svc.run(id)).toBe("done");
  });

  it("3. tries: a render-video job gets 2 tries, then it is parked (dead); another kind still gets 5", async () => {
    expect(maxTriesOf("render-video")).toBe(2);
    expect(maxTriesOf("render_video")).toBe(2);
    expect(maxTriesOf("open-wish")).toBe(5);
    const key = `r1-${RUN}-${++n}`;
    let calls = 0;
    jobs.register("render-video", () => {
      calls++;
      throw new Error("lost");
    });
    await jobs.schedule("render-video", NOW, key);
    expect(await jobs.runDue(5, [key])).toBe(1);
    expect(await k.db.job.findFirstOrThrow({ where: { subjectId: key } })).toMatchObject({ status: "failed", attempts: 1 });
    k.t.clock.set(new Date(NOW.getTime() + 3_600_000));
    expect(await jobs.runDue(5, [key])).toBe(1);
    expect(await k.db.job.findFirstOrThrow({ where: { subjectId: key } })).toMatchObject({ status: "dead", attempts: 2 });
    k.t.clock.set(new Date(NOW.getTime() + 7_200_000));
    expect(await jobs.runDue(5, [key])).toBe(0);
    expect(calls).toBe(2);
  });

  it("4. with RENDER_CONCURRENCY at its default 2, two asked videos render at the same time", async () => {
    const one = await asked();
    const two = await asked();
    renderer.takes = 120;
    expect(await Promise.all([svc.run(one.id), svc.run(two.id)])).toEqual(["done", "done"]);
    expect(renderer.maxActive).toBe(2);
  });
});

describe("R1 case 4: RENDER_CONCURRENCY=1 renders two asked videos one after the other", () => {
  let k: Kit;
  let renderer: StandinVideoRenderer;
  let svc: RenderJobsService;
  let route: ReturnType<typeof routeStorage>;
  const was = process.env.RENDER_CONCURRENCY;
  beforeAll(async () => {
    process.env.RENDER_CONCURRENCY = "1";
    renderer = new StandinVideoRenderer();
    k = await boot("r1c", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(renderer) });
    route = routeStorage(k.t);
    svc = k.t.app.get(RenderJobsService);
  });
  afterAll(async () => {
    route.restore();
    if (was === undefined) delete process.env.RENDER_CONCURRENCY;
    else process.env.RENDER_CONCURRENCY = was;
    await k.t.close();
  });

  it("the stand-in records no overlap; the second waits queued-in-process and both end done", async () => {
    const mk = async () => {
      const a = await k.account();
      const w = await k.wish(a.id, { ticket: "signature" });
      return (await k.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(200)).body.item.id as string;
    };
    const [x, y, z] = [await mk(), await mk(), await mk()];
    renderer.takes = 100;
    expect(await Promise.all([svc.run(x), svc.run(y), svc.run(z)])).toEqual(["done", "done", "done"]);
    expect(renderer.maxActive).toBe(1);
    expect(renderer.rendered).toHaveLength(3);
  });

  it("a run that waits for its place leaves when its signal aborts, and the row stays queued", async () => {
    const mk = async () => {
      const a = await k.account();
      const w = await k.wish(a.id, { ticket: "signature" });
      return (await k.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(200)).body.item.id as string;
    };
    const [x, y] = [await mk(), await mk()];
    const g = gate();
    renderer.hold = g.wait;
    renderer.takes = 0;
    const first = svc.run(x);
    await waitFor(() => renderer.active === 1);
    const ac = new AbortController();
    const second = svc.run(y, ac.signal);
    ac.abort();
    await expect(second).rejects.toThrow(/stopped/);
    expect((await k.db.renderJob.findUniqueOrThrow({ where: { id: y } })).status).toBe("queued");
    g.open();
    expect(await first).toBe("done");
    renderer.hold = null;
  });
});

describe("R1 case 5: the render env is named and optional; the production binding is not configured, so nothing that includes the video sells", () => {
  const NAMES = ["RENDER_WEB_ORIGIN", "RENDER_TOKEN_SECRET", "RENDER_CHROMIUM_PATH", "RENDER_FFMPEG_PATH", "RENDER_TIME_LIMIT_SECONDS", "RENDER_TOKEN_TTL_SECONDS"];
  const live = {
    PROVIDERS: "live",
    RENDER_WEB_ORIGIN: "https://web.example.test",
    RENDER_TOKEN_SECRET: "r1-render-token-secret-0123456789abcdef",
    RENDER_CHROMIUM_PATH: "/usr/bin/google-chrome",
    RENDER_FFMPEG_PATH: "/usr/bin/ffmpeg",
  };

  it("each name is in the schema and the manifest, optional, with what it is for", () => {
    const manifest = (JSON.parse(readFileSync(join(__dirname, "../../../../.pipeline/env-manifest.json"), "utf8")) as { vars: { name: string; purpose: string; secret: boolean; readBySource?: boolean }[] }).vars;
    for (const name of [...NAMES, "RENDER_CONCURRENCY"]) {
      const spec = MANIFEST_VARS.find((v) => v.name === name);
      expect(spec).toBeDefined();
      expect(spec?.need).toBe("optional");
      expect(spec?.purpose.length).toBeGreaterThan(20);
      expect(manifest.find((v) => v.name === name)?.purpose.length).toBeGreaterThan(20);
    }
    expect(manifest.find((v) => v.name === "RENDER_TOKEN_SECRET")?.secret).toBe(true);
    expect(manifest.find((v) => v.name === "RENDER_CONCURRENCY")?.readBySource).toBe(true);
  });

  it("with none of them set the app boots, with the defaults of the plan; a bad value is named", () => {
    const env = loadEnv(standinEnv());
    expect(env).toMatchObject({ RENDER_CONCURRENCY: 2, RENDER_TIME_LIMIT_SECONDS: 1200, RENDER_TOKEN_TTL_SECONDS: 900, RENDER_CHROMIUM_PATH: "/usr/bin/google-chrome", RENDER_FFMPEG_PATH: "/usr/bin/ffmpeg" });
    expect(env.RENDER_WEB_ORIGIN).toBeUndefined();
    expect(env.RENDER_TOKEN_SECRET).toBeUndefined();
    const problems = (raw: Record<string, string>): string[] => {
      try {
        loadEnv(raw);
        return [];
      } catch (e) {
        if (!(e instanceof EnvError)) throw e;
        return e.problems.map((p) => p.name);
      }
    };
    expect(problems({ ...standinEnv(), RENDER_WEB_ORIGIN: "not a url", RENDER_TOKEN_SECRET: "short", RENDER_TIME_LIMIT_SECONDS: "soon" }).sort()).toEqual(["RENDER_TIME_LIMIT_SECONDS", "RENDER_TOKEN_SECRET", "RENDER_WEB_ORIGIN"]);
  });

  it("the live binding is not configured even with every render variable set (no real adapter exists)", async () => {
    const r = videoRendererFor(live);
    expect(r).toBeInstanceOf(NoVideoRenderer);
    expect(r.configured()).toBe(false);
    expect((await r.ping()).state).toBe("error");
    await expect(r.render({ wishId: ids.next(), kind: "status-video", width: 1080, height: 1920, seconds: 30 })).rejects.toThrow(/no video renderer is configured/);
  });

  describe("PROVIDERS=live binds it: nothing is sold that includes the portrait video (IK3, IK3a), and an ask is 503", () => {
    let k: Kit;
    beforeAll(async () => {
      k = await boot("r1l", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(videoRendererFor(live)) });
    });
    afterAll(() => k.t.close());
    const start = (auth: string, body: Record<string, unknown>) => k.t.http().post("/v1/payments").set("Authorization", auth).set("Idempotency-Key", `r1l-${RUN}-${++n}-k`).send(body);

    it("the video extra, the Signature and Premiere tickets and the Pass start no payment; an ask for a video the person holds is 503 and makes no job", async () => {
      const a = await k.account();
      const sent = k.t.payments.started.length;
      const w = await k.wish(a.id, { status: "draft", name: "Ada", ticket: "keepsake" });
      const extra = await start(a.auth, { purpose: "extra", id: "portrait-video", subjectId: w });
      expect([extra.status, extra.body.error.code]).toEqual([409, "extra_not_sold"]);
      for (const ticket of ["signature", "premiere"]) {
        const d = await k.wish(a.id, { status: "draft", name: "Ada" });
        const r = await start(a.auth, { purpose: "ticket", ticket, subjectId: d });
        expect([r.status, r.body.error.code]).toEqual([409, "extra_not_sold"]);
      }
      expect((await start(a.auth, { purpose: "pass" })).status).toBe(409);
      expect(k.t.payments.started.length).toBe(sent);
      expect(await k.db.payment.count({ where: { accountId: a.id } })).toBe(0);
      expect((await k.t.http().get(`/v1/wishes/${w}`).set("Authorization", a.auth)).body.extrasOpen["extra.portrait-video"]).toBe(false);
      const held = await k.wish(a.id, { ticket: "signature" });
      const ask = await k.t.http().post(`/v1/wishes/${held}/video`).set("Authorization", a.auth).send({});
      expect([ask.status, ask.body.error.code]).toEqual([503, "video_unavailable"]);
      expect(await k.db.renderJob.count({ where: { wishId: held } })).toBe(0);
    });
  });
});

describe("R1 case 6 (IK6): a premiere-clip is on the wire and in the database, and nothing makes or sells one", () => {
  let k: Kit;
  beforeAll(async () => {
    k = await boot("r1k", NOW, { configure: (b) => b.overrideProvider(VideoRenderer).useValue(new StandinVideoRenderer()) });
  });
  afterAll(() => k.t.close());

  it("the kind is in the database enum and the wire type; asking makes only a status video or a keepsake export; no line sells a clip", async () => {
    const enumValues = (await k.db.$queryRaw<{ v: string }[]>`SELECT unnest(enum_range(NULL::"RenderJobKind"))::text AS v`).map((r) => r.v);
    expect(enumValues).toContain("premiere-clip");
    const src = readFileSync(join(__dirname, "../../../contracts/types.ts"), "utf8");
    expect(src).toMatch(/premiere-clip/);
    const a = await k.account();
    const kinds = new Set<string>();
    // the ask takes no kind: a body that names premiere-clip is refused
    const first = await k.wish(a.id, { ticket: "signature" });
    await k.t.http().post(`/v1/wishes/${first}/video`).set("Authorization", a.auth).send({ kind: "premiere-clip" }).expect(422);
    for (const over of [{ ticket: "signature" }, { ticket: "premiere" }, { ticket: "moment", adds: ["extra.portrait-video"] }, { status: "resting", ticket: "moment", restingSince: NOW }]) {
      const w = await k.wish(a.id, over);
      const r = await k.t.http().post(`/v1/wishes/${w}/video`).set("Authorization", a.auth).send({}).expect(200);
      kinds.add(r.body.item.kind);
    }
    expect([...kinds].sort()).toEqual(["keepsake-export", "status-video"]);
    expect(await k.db.renderJob.count({ where: { kind: "premiere_clip" as never } })).toBe(0);
    // no source line makes one: the only place the service names it is the wire view of a row that already has it
    const service = readFileSync(join(__dirname, "../render-jobs.service.ts"), "utf8");
    expect(service.split("\n").filter((l) => /premiere[-_]clip/.test(l))).toHaveLength(1);
    expect(Object.keys(JSON.parse(JSON.stringify((await k.db.entitlements.findFirstOrThrow({ orderBy: { id: "desc" } })).tickets))).some((t) => /clip/i.test(t))).toBe(false);
  });
});
