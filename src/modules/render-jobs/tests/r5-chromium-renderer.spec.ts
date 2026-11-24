import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { ChromiumVideoRenderer, chooseScenes, DEFAULT_FONT_HOSTS, defaultAllowedHosts, hostAllowed, loadClockShim, maskToken, type ChromiumRendererOptions } from "../chromium-video-renderer";
import { RENDER_TEMP_PREFIX, type RenderRequest } from "../video-renderer";

/**
 * R5: the Chromium adapter. These specs need Chromium, ffmpeg, ffprobe, a protocol driver (playwright-core) and the web's stepped clock file;
 * where one is missing the whole block is SKIPPED with the words below (CI without them). They run against a tiny stand-in web page of
 * their own (no database, no real wish): the adapter's job is the clock, the frames, the encode, the cut, the abort, the allowlist.
 * Where they are: RENDER_CHROMIUM_PATH, RENDER_CLOCK_PATH, RENDER_PLAYWRIGHT_MODULE (defaults are this machine's).
 */
const CHROMIUM = process.env.RENDER_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const CLOCK = process.env.RENDER_CLOCK_PATH || "/home/user/Firstwish-web/scripts/lib/stepped-clock.mjs";
const PLAYWRIGHT = process.env.RENDER_PLAYWRIGHT_MODULE || "/opt/node-tools/node_modules/playwright-core";
const FFMPEG = process.env.RENDER_FFMPEG_PATH || "/usr/bin/ffmpeg";
const FFPROBE = "/usr/bin/ffprobe";
const missing = [
  [CHROMIUM, "Chromium (RENDER_CHROMIUM_PATH)"],
  [FFMPEG, "ffmpeg"],
  [FFPROBE, "ffprobe"],
  [CLOCK, "the web's scripts/lib/stepped-clock.mjs (RENDER_CLOCK_PATH)"],
  [PLAYWRIGHT, "playwright-core (RENDER_PLAYWRIGHT_MODULE)"],
]
  .filter(([p]) => !existsSync(p))
  .map(([, what]) => what);
const real = missing.length === 0 ? describe : describe.skip;
const WHY = missing.length ? ` (SKIPPED: not on this machine: ${missing.join(", ")})` : "";

const W = 360;
const H = 640;
const req = (token: string, over: Partial<RenderRequest> = {}): RenderRequest => ({ wishId: "w1", jobId: "r5job", kind: "status-video", width: W, height: H, seconds: 60, token, ...over });

/** The stand-in web: /render/<token> is a page chosen by the token's first word. Scenes are 15 frames each (500 ms of stepped time). */
const SCENES = `["opening","cover","a","b","c","d","ending"]`;
const page = (body: string, script: string): string => `<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>html,body{margin:0;background:#123}body{color:#fff;font:40px sans-serif}</style></head><body>${body}<script>${script}</script></body></html>`;
const play = (every = 500, endless = false): string => `
  const R = window.__render = { ready: false, scene: 0, sceneName: "", scenes: [], done: false };
  const names = ${SCENES}; let t0 = 0;
  const start = (i) => { R.scenes.push({ name: names[i], at: Math.round(performance.now() - t0) }); R.scene = R.scenes.length; R.sceneName = names[i]; document.body.style.background = "hsl(" + (i * 50) + ",60%,35%)"; document.body.textContent = names[i]; };
  setTimeout(() => { t0 = performance.now(); R.ready = true; let i = 0; start(0);
    const next = () => { if (++i < names.length) setTimeout(() => { start(i); next(); }, ${every}); else if (!${endless}) setTimeout(() => { R.done = true; }, 750); else setTimeout(next, ${every}); };
    next(); }, 300);`;
const pages: Record<string, (host: string, token: string) => string> = {
  good: () => page("", play()),
  long: () => page("", play(500, true)),
  said: () => page("", `window.__render = { ready: false, scene: 0, sceneName: "", scenes: [], done: false, error: "404 This render is not available." };`),
  throws: (_h, token) => page("", `${play()} setTimeout(() => queueMicrotask(() => { throw new Error("boom at " + location.href + " " + ${JSON.stringify(token)}); }), 900);`),
  leaves: (host) => page("", `${play()} setTimeout(() => { location.href = "http://${host}/elsewhere"; }, 900);`),
  strays: () => page("", `${play()} for (const u of ["http://203.0.113.7/pic.png", "http://169.254.169.254/latest/meta-data/", "http://other.invalid/x.js"]) { const i = new Image(); i.src = u; } fetch("http://169.254.169.254/x").catch(() => {});`),
  exact: () =>
    page("", `${play()}
      const d0 = Date.now(); let frames = 0, last = performance.now();
      const raf = () => { frames++; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
      setTimeout(() => {
        const p0 = performance.now(); const dd0 = Date.now();
        [500, 1000, 1500].forEach((ms) => setTimeout(() => {
          const dp = performance.now() - p0, dd = Date.now() - dd0;
          if (Math.abs(dp - ms) > 0.001 || Math.abs(dd - ms) > 1) window.__render.error = "clock drift: " + dp + " " + dd + " for " + ms;
        }, ms));
        setTimeout(() => { if (frames < 30 || frames > 80) window.__render.error = "clock drift: " + frames + " frames"; }, 1600);
      }, 400);`),
  hangs: () => page("", `${play()} setTimeout(() => { window.__vt.step = () => new Promise(() => {}); }, 700);`),
};

let server: Server;
let host = "";
const seen: string[] = [];
const origin = (): string => `http://${host}`;

beforeAll(async () => {
  if (missing.length) return;
  server = createServer((rq, rs) => {
    seen.push((rq.url ?? "").replace(/^\/render\/[^/]+/, "/render/[token]"));
    const m = /^\/render\/([^/?#]+)/.exec(rq.url ?? "");
    if (!m) {
      rs.writeHead(404).end("no");
      return;
    }
    const token = decodeURIComponent(m[1]);
    const kind = token.split("-")[0];
    rs.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end((pages[kind] ?? pages.good)?.(host, token));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

const mine = async (): Promise<string[]> => (await readdir(tmpdir())).filter((f) => f.startsWith(`${RENDER_TEMP_PREFIX}r5job-`) || f.startsWith(`${RENDER_TEMP_PREFIX}r5x-`)).sort();
const groupMembers = (pid: number): number[] => spawnSync("ps", ["-eo", "pid=,pgid="], { encoding: "utf8" }).stdout.split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter(([p, g]) => g === pid || p === pid).map(([p]) => p);
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const probe = (file: string): { codec: string; w: number; h: number; fps: string; frames: number; seconds: number; streams: string; faststart: boolean } => {
  const r = JSON.parse(spawnSync(FFPROBE, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt:format=duration", "-of", "json", file], { encoding: "utf8" }).stdout) as { streams: { codec_name: string; width: number; height: number; r_frame_rate: string; nb_read_frames: string; pix_fmt: string }[]; format: { duration: string } };
  const s = r.streams[0];
  const all = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim();
  const head = readFileSync(file).subarray(0, 65536);
  return { codec: `${s.codec_name}/${s.pix_fmt}`, w: s.width, h: s.height, fps: s.r_frame_rate, frames: Number(s.nb_read_frames), seconds: Number(r.format.duration), streams: all, faststart: head.indexOf("moov") > 0 && head.indexOf("moov") < (head.indexOf("mdat") < 0 ? 1e9 : head.indexOf("mdat")) };
};

function make(over: Partial<ChromiumRendererOptions> = {}): { r: ChromiumVideoRenderer; pids: { kind: string; pid: number }[]; logs: string[] } {
  const pids: { kind: string; pid: number }[] = [];
  const logs: string[] = [];
  const line = (t: unknown): void => void logs.push(String(t));
  const r = new ChromiumVideoRenderer({
    webOrigin: origin(), chromiumPath: CHROMIUM, ffmpegPath: FFMPEG, clockPath: CLOCK, playwrightModule: PLAYWRIGHT,
    onSpawn: (kind, pid) => pids.push({ kind, pid }), logger: { log: line, warn: line, error: line }, frameTimeoutMs: 20_000, ...over,
  });
  return { r, pids, logs };
}
const clean = async (): Promise<void> => {
  for (const f of await mine()) await rm(`${tmpdir()}/${f}`, { recursive: true, force: true });
};
afterEach(async () => {
  if (!missing.length) await clean();
});

describe(`R5 pure parts${WHY ? "" : ""}`, () => {
  it("masks the token in every shape it can appear", () => {
    const t = "Ab/Cd+12345678";
    const out = maskToken(`GET http://x/render/${encodeURIComponent(t)} failed at /v1/render/${t}/wish and ${t}`, t);
    expect(out).not.toContain("12345678");
    expect(out).not.toContain("Ab");
    expect(maskToken("http://h/render/abcdefgh/x")).toBe("http://h/render/[token]/x");
  });
  it("allows only the listed hosts, never the metadata address, and takes the default list from the origins", () => {
    const list = defaultAllowedHosts({ webOrigin: "https://web.example", apiOrigin: "https://api.example:8443", storageHosts: ["*.store.example"] });
    expect(list).toEqual(expect.arrayContaining(["web.example", "api.example:8443", "*.store.example", ...DEFAULT_FONT_HOSTS]));
    expect(hostAllowed("https://web.example/render/x", list)).toBe(true);
    expect(hostAllowed("https://api.example:8443/v1/x", list)).toBe(true);
    expect(hostAllowed("https://api.example/v1/x", list)).toBe(false);
    expect(hostAllowed("https://b1.store.example/f.jpg", list)).toBe(true);
    expect(hostAllowed("https://store.example/f.jpg", list)).toBe(false);
    expect(hostAllowed("https://evil.example/", list)).toBe(false);
    expect(hostAllowed("http://169.254.169.254/latest", [...list, "169.254.169.254"])).toBe(false);
    expect(hostAllowed("http://metadata.google.internal/", ["metadata.google.internal"])).toBe(false);
  });
  it("cuts whole middle scenes only, the middle-most first, and never inside the opening or the ending", () => {
    const names = ["opening", "cover", "a", "b", "c", "d", "ending"];
    const frames = [30, 30, 100, 100, 100, 100, 45];
    expect(chooseScenes(names, frames, 10_000)).toEqual(names.map(() => true));
    const k = chooseScenes(names, frames, 400);
    expect(k.slice(0, 2)).toEqual([true, true]);
    expect(k[6]).toBe(true);
    expect(frames.filter((_, i) => k[i]).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(400);
    expect(k.filter((x) => !x).length).toBe(2);
    expect([k[3], k[4]]).toEqual([false, false]);
    /* the opening and the ending alone are over the limit: they stay whole */
    expect(chooseScenes(names, frames, 10)).toEqual([true, true, false, false, false, false, true]);
    /* no ending named: the last scene is the ending */
    expect(chooseScenes(["cover", "x", "y"], [10, 50, 10], 30)).toEqual([true, false, true]);
  });
  it("is not configured without its programs, and says why when pinged", async () => {
    const r = new ChromiumVideoRenderer({ webOrigin: "http://127.0.0.1:1", chromiumPath: "/nope/chrome", logger: { log: () => undefined, warn: () => undefined, error: () => undefined } });
    expect(r.configured()).toBe(false);
    const p = await r.ping();
    expect(p).toMatchObject({ state: "error" });
    await expect(r.render(req("good-1"))).rejects.toThrow(/not ready/);
    await expect(new ChromiumVideoRenderer({ webOrigin: "http://127.0.0.1:1" }).render(req("")).catch((e: Error) => e.message)).resolves.toMatch(/no token/);
  });
});

real(`R5 the Chromium renderer, on a stand-in web page${WHY}`, () => {
  it("renders a clip: h264 yuv420p, the request's size, 30 fps, the page's own length, faststart, no sound, a file the job accepts, nothing left", async () => {
    const { r, pids, logs } = make();
    const out = await r.render(req("good-aaaaaaaaaaaa"));
    expect(out.contentType).toBe("video/mp4");
    expect(out.path.startsWith(`${tmpdir()}/${RENDER_TEMP_PREFIX}r5job-`)).toBe(true);
    const p = probe(out.path);
    expect(p).toMatchObject({ codec: "h264/yuv420p", w: W, h: H, fps: "30/1", streams: "video", faststart: true });
    /* 7 scenes: six of 15 frames from ready, the ending 15 then 750 ms (23 frames) = 106 ticks plus the first frame */
    const last = r.lastRun?.scenes ?? [];
    expect(last.map((s) => s.name)).toEqual(["opening", "cover", "a", "b", "c", "d", "ending"]);
    expect(last.every((s) => s.kept)).toBe(true);
    expect(p.frames).toBe(r.lastRun?.frames);
    expect(Math.abs(p.seconds - p.frames / 30)).toBeLessThan(0.1);
    expect(p.frames).toBeGreaterThan(100);
    expect(out.bytes).toBeGreaterThan(1000);
    expect(readFileSync(out.path).length).toBe(out.bytes);
    expect(await mine()).toEqual([out.path.slice(tmpdir().length + 1)]);
    for (const c of pids) expect(groupMembers(c.pid)).toEqual([]);
    expect(logs.join("\n")).not.toContain("aaaaaaaaaaaa");
    expect(pids.filter((c) => c.kind === "chromium")).toHaveLength(1);
  }, 90_000);

  it("a wish longer than the request keeps the opening and the ending whole and drops whole middle scenes", async () => {
    const { r } = make();
    const out = await r.render(req("good-bbbbbbbbbbbb", { seconds: 3 }));
    const s = r.lastRun?.scenes ?? [];
    expect(s[0]).toMatchObject({ name: "opening", kept: true });
    expect(s[1]).toMatchObject({ name: "cover", kept: true });
    expect(s[s.length - 1]).toMatchObject({ name: "ending", kept: true });
    const dropped = s.filter((x) => !x.kept);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((x) => !["opening", "cover", "ending"].includes(x.name))).toBe(true);
    const keptFrames = s.filter((x) => x.kept).reduce((a, b) => a + b.frames, 0);
    expect(r.lastRun?.keptFrames).toBe(keptFrames);
    const p = probe(out.path);
    expect(p.frames).toBe(keptFrames);
    expect(p.seconds).toBeLessThan((r.lastRun?.frames ?? 0) / 30);
    /* a request that is long enough keeps all of it */
    const all = await make().r.render(req("good-cccccccccccc", { seconds: 60 }));
    expect(probe(all.path).frames).toBeGreaterThan(p.frames);
  }, 120_000);

  it("the page's own words fail the job, with no file; the token is in no message and no log", async () => {
    const { r, logs } = make();
    const err = await r.render(req("said-dddddddddddd")).catch((e: Error) => e);
    expect((err as Error).message).toBe("the render page said: 404 This render is not available.");
    expect(await mine()).toEqual([]);
    expect(logs.join("\n")).not.toContain("dddddddddddd");
  }, 60_000);

  it("a page error fails the job and the address in the message is masked", async () => {
    const { r, logs } = make();
    const err = (await r.render(req("throws-eeeeeeeeeeee")).catch((e: Error) => e)) as Error;
    expect(err.message).toMatch(/^the render page threw: boom at /);
    expect(err.message).not.toContain("eeeeeeeeeeee");
    expect(logs.join("\n")).not.toContain("eeeeeeeeeeee");
    expect(await mine()).toEqual([]);
  }, 60_000);

  it("a navigation away fails the job", async () => {
    const { r, pids } = make();
    await expect(r.render(req("leaves-ffffffffffff"))).rejects.toThrow("the render page navigated away");
    expect(await mine()).toEqual([]);
    for (const c of pids) expect(groupMembers(c.pid)).toEqual([]);
  }, 60_000);

  it("a frame that never comes fails the job with words", async () => {
    const { r } = make({ frameTimeoutMs: 1500 });
    await expect(r.render(req("hangs-gggggggggggg"))).rejects.toThrow(/did not answer a step within 2 s|a frame never came/);
    expect(await mine()).toEqual([]);
  }, 60_000);

  it("blocks every host that is not allowed, counts them by host (never by address), and the metadata address always", async () => {
    const { r } = make();
    await r.render(req("strays-hhhhhhhhhhhh"));
    const run = r.lastRun;
    expect(run?.blocked).toBeGreaterThanOrEqual(4);
    expect(run?.blockedHosts.join(" ")).toMatch(/203\.0\.113\.7/);
    expect(run?.blockedHosts.join(" ")).toMatch(/169\.254\.169\.254/);
    expect(run?.blockedHosts.join(" ")).toMatch(/other\.invalid/);
    expect(run?.blockedHosts.join(" ")).not.toContain("hhhhhhhhhhhh");
    expect(run?.allowedRequests).toBeGreaterThan(0);
    /* even when listed, the metadata address stays blocked */
    const again = make({ allowedHosts: [host, "169.254.169.254", "203.0.113.7", "other.invalid"] });
    await again.r.render(req("strays-iiiiiiiiiiii"));
    expect(again.r.lastRun?.blockedHosts.join(" ")).toMatch(/169\.254\.169\.254/);
    expect(again.r.lastRun?.blockedHosts.join(" ")).not.toMatch(/203\.0\.113\.7/);
    /* the token went only in the page's address */
    expect(seen.filter((u) => u.includes("hhhhhhhhhhhh"))).toEqual([]);
  }, 90_000);

  it("an abort kills Chromium and ffmpeg by process id at once, removes the file and the profile folder, and rejects", async () => {
    const { r, pids, logs } = make();
    const ac = new AbortController();
    const done = r.render(req("long-jjjjjjjjjjjj"), ac.signal).catch((e: Error) => e);
    const t0 = Date.now();
    while (!pids.some((c) => c.kind === "ffmpeg") && Date.now() - t0 < 30_000) await new Promise((x) => setTimeout(x, 50));
    await new Promise((x) => setTimeout(x, 1500));
    expect((await mine()).some((f) => f.endsWith("-work"))).toBe(true);
    const at = Date.now();
    ac.abort();
    const err = (await done) as Error;
    expect(err.message).toBe("render aborted");
    expect(Date.now() - at).toBeLessThan(3000);
    for (const c of pids) {
      expect(alive(c.pid)).toBe(false);
      expect(groupMembers(c.pid)).toEqual([]);
    }
    expect(await mine()).toEqual([]);
    expect(logs.join("\n")).not.toContain("jjjjjjjjjjjj");
    /* an abort before the start */
    const early = new AbortController();
    early.abort();
    await expect(make().r.render(req("good-kkkkkkkkkkkk"), early.signal)).rejects.toThrow("render aborted");
    expect(await mine()).toEqual([]);
  }, 90_000);

  it.each(["chromium", "ffmpeg"] as const)("a crash of %s fails the job with words and leaves nothing behind", async (victim) => {
    const { r, pids } = make();
    const done = r.render(req("long-llllllllllll")).catch((e: Error) => e);
    const t0 = Date.now();
    while (!pids.some((c) => c.kind === "ffmpeg") && Date.now() - t0 < 30_000) await new Promise((x) => setTimeout(x, 50));
    await new Promise((x) => setTimeout(x, 800));
    const target = pids.filter((c) => c.kind === victim).pop();
    expect(target).toBeDefined();
    process.kill((target as { pid: number }).pid, "SIGKILL");
    const err = (await done) as Error;
    expect(err.message).toMatch(victim === "chromium" ? /Chromium stopped|render page|Target|closed/i : /ffmpeg/i);
    expect(err.message).not.toContain("llllllllllll");
    for (const c of pids) expect(groupMembers(c.pid)).toEqual([]);
    expect(await mine()).toEqual([]);
  }, 90_000);
});

real(`R5 the stepped clock is the web's, and drift is loud${WHY}`, () => {
  it("the shim is read from the web's own file and keeps its contract: a stepped clock moves performance.now, Date.now and timers by exact steps, one animation frame a step", async () => {
    const shim = loadClockShim(CLOCK);
    expect(shim.source).toContain("window.__vt");
    expect(shim.sha256).toBe(createHash("sha256").update(readFileSync(CLOCK)).digest("hex"));
    /* the page checks itself: at each of its timers (every 500 ms of stepped time) the clock reads exactly that, and a frame callback comes once a step */
    const { r } = make();
    const out = await r.render(req("exact-mmmmmmmmmmmm", { seconds: 60 }));
    expect(out.bytes).toBeGreaterThan(0);
    expect(r.lastRun?.frames).toBeGreaterThan(100);
  }, 90_000);

  it("a pinned hash that does not match fails the render loudly before any browser starts", async () => {
    const { r, pids } = make({ clockSha256: "0".repeat(64) });
    await expect(r.render(req("good-nnnnnnnnnnnn"))).rejects.toThrow(/drift/);
    expect(pids).toEqual([]);
    expect(await r.ping()).toMatchObject({ state: "error" });
    const ok = make({ clockSha256: loadClockShim(CLOCK).sha256 });
    expect(await ok.r.ping()).toMatchObject({ state: "ok" });
  }, 60_000);
});
