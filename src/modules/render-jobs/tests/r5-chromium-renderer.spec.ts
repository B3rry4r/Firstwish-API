import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { createSocket } from "node:dgram";
import { createServer as createTcp } from "node:net";
import { ChromiumVideoRenderer, chooseScenes, plainWords, DEFAULT_FONT_HOSTS, defaultAllowedHosts, hostAllowed, maskToken, type ChromiumRendererOptions } from "../chromium-video-renderer";
import { RENDER_TEMP_PREFIX, type RenderRequest } from "../video-renderer";

/**
 * R5: the Chromium adapter. These specs need Chromium, ffmpeg, ffprobe, a protocol driver (playwright-core) and the web's stepped clock file;
 * where one is missing the whole block is SKIPPED with the words below (CI without them). They run against a tiny stand-in web page of
 * their own (no database, no real wish): the adapter's job is the clock, the frames, the encode, the cut, the abort, the allowlist.
 * Where they are: RENDER_CHROMIUM_PATH, RENDER_CLOCK_PATH, RENDER_PLAYWRIGHT_MODULE (defaults are this machine's).
 */
const CHROMIUM = process.env.RENDER_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
/* the web's page script for the clock: the stand-in serves its text as GET /render-clock.js (test code reads the web's pure module; the ADAPTER imports nothing) */
const WEB_SHIM = process.env.WEB_CLOCK_SHIM_MJS || "/home/user/Firstwish-web/scripts/lib/clock-shim.mjs";
const PLAYWRIGHT = process.env.RENDER_PLAYWRIGHT_MODULE || "/opt/node-tools/node_modules/playwright-core";
const FFMPEG = process.env.RENDER_FFMPEG_PATH || "/usr/bin/ffmpeg";
const FFPROBE = "/usr/bin/ffprobe";
const missing = [
  [CHROMIUM, "Chromium (RENDER_CHROMIUM_PATH)"],
  [FFMPEG, "ffmpeg"],
  [FFPROBE, "ffprobe"],
  [WEB_SHIM, "the web's scripts/lib/clock-shim.mjs (WEB_CLOCK_SHIM_MJS)"],
  [PLAYWRIGHT, "playwright-core (RENDER_PLAYWRIGHT_MODULE)"],
]
  .filter(([p]) => !existsSync(p))
  .map(([, what]) => what);
const real = missing.length === 0 ? describe : describe.skip;
const WHY = missing.length ? ` (SKIPPED: not on this machine: ${missing.join(", ")})` : "";

const W = 360;
const H = 640;
const req = (token: string, over: Partial<RenderRequest & { epochMs: number }> = {}): RenderRequest => ({ wishId: "w1", jobId: "r5job", kind: "status-video", width: W, height: H, seconds: 60, token, ...over });

/** The stand-in web: /render/<token> is a page chosen by the token's first word. Scenes are 15 frames each (500 ms of stepped time). */
const RED = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==", "base64");
const SCENES = `["opening","cover","a","b","c","d","ending"]`;
const page = (body: string, script: string): string => `<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>html,body{margin:0;background:#123}body{color:#fff;font:40px sans-serif}</style></head><body>${body}<script>${script}</script></body></html>`;
/** `gate` is the page's own wait before it says ready: a REAL network read, as the web's render page has (the stepped clock is at 0 until then: IK6g). */
const play = (every = 500, endless = false, gate = `fetch("/asset.txt").then((r) => r.text())`, atStart = ""): string => `
  const R = window.__render = { ready: false, scene: 0, sceneName: "", scenes: [], done: false };
  const names = ${SCENES}; let t0 = 0;
  const start = (i) => { R.scenes.push({ name: names[i], at: Math.round(performance.now() - t0) }); R.scene = R.scenes.length; R.sceneName = names[i]; document.body.style.background = "hsl(" + (i * 50) + ",60%,35%)"; document.body.textContent = names[i]; };
  const go = () => { ${atStart} t0 = performance.now(); R.ready = true; let i = 0; start(0);
    const next = () => { if (++i < names.length) setTimeout(() => { start(i); next(); }, ${every}); else if (!${endless}) setTimeout(() => { R.done = true; }, 750); else setTimeout(next, ${every}); };
    next(); };
  (${gate}).then(go, go);`;
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
  timerthrows: () => page("", `${play()} setTimeout(() => { throw new Error("timer boom"); }, 900);`),
  rafthrows: () => page("", `${play()} setTimeout(() => requestAnimationFrame(() => { throw new Error("frame boom"); }), 900);`),
  navsame: () => page("", `${play()} setTimeout(() => { location.href = "/render/other-zzzzzzzzzz"; }, 900);`),
  face: () =>
    page("", `${play()}
      const d = document.createElement("div"); d.style.cssText = "position:fixed;left:8px;top:8px;font:28px monospace;color:#fff;white-space:pre";
      document.documentElement.appendChild(d);
      requestAnimationFrame(function f() { d.textContent = Date.now() + "\\n" + Math.round(performance.now() * 1000) / 1000; requestAnimationFrame(f); });`),
  kinds: (h) => {
    const urls = [`ws://127.0.0.1:${portB}/a`, `wss://127.0.0.1:${portB}/a`, `ws://127.0.0.1:${portC}/a`, `wss://127.0.0.1:${portC}/a`, `ws://${h}/a`, `wss://${h}/a`, "ws://203.0.113.9:81/a", "wss://other.invalid/a"];
    const B = `http://127.0.0.1:${portB}`;
    return page("", `${play()}
      const urls = ${JSON.stringify(urls)}; const t = (f) => { try { f(); } catch (e) {} };
      t(() => fetch("${B}/f").catch(() => {})); t(() => { new Image().src = "${B}/i.png"; });
      t(() => { const x = new XMLHttpRequest(); x.open("GET", "${B}/x"); x.send(); }); t(() => new EventSource("${B}/e"));
      t(() => navigator.sendBeacon("${B}/b", "x"));
      t(() => { const f = document.createElement("iframe"); f.src = "${B}/frame"; document.body.appendChild(f); });
      t(() => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "${B}/s.css"; document.head.appendChild(l); });
      for (const u of urls) t(() => new WebSocket(u));
      t(() => { const w = new Worker(URL.createObjectURL(new Blob(["for (const u of " + JSON.stringify(urls) + ") { try { new WebSocket(u); } catch (e) {} }"]))); });
      t(() => { const f = document.createElement("iframe"); document.documentElement.appendChild(f); const W = f.contentWindow.WebSocket; for (const u of urls) t(() => new W(u)); const K = f.contentWindow.Worker; t(() => new K(URL.createObjectURL(new Blob(["for (const u of " + JSON.stringify(urls) + ") { try { new WebSocket(u); } catch (e) {} }"])))); });
      t(() => { const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:127.0.0.1:${portD}" }] }); p.createDataChannel("x"); p.createOffer().then((o) => p.setLocalDescription(o)); });
      t(() => new WebTransport("https://127.0.0.1:${portD}/wt"));`);
  },
  hangs: () => page("", `${play()} setTimeout(() => { window.__vt.step = () => new Promise(() => {}); }, 700);`),
  /* R5 round 2 (H1): ready comes from REAL work only (a zero-delay timer, a frame callback at time 0, a network read); the clock must still be at exactly 0 then */
  h1fast: () => h1(0),
  h1slow: () => h1(2600),
  pic3: () => picPage(3000),
  pic10: () => picPage(10000),
  pichang: () => picPage(-1),
};
const h1 = (ms: number): string =>
  page("", play(500, false, `Promise.all([new Promise((r) => setTimeout(r, 0)), new Promise((r) => { requestAnimationFrame((ts) => { window.__raf0 = ts; r(); }); window.__vt.frame(); }), fetch("/asset.txt?ms=${ms}")])`,
    `if (performance.now() !== 0 || window.__raf0 !== 0) R.error = "virtual time moved before ready: " + performance.now() + " ms, first frame callback at " + window.__raf0;`));
/** a page that says ready at once and shows one full-size picture, which the stand-in web serves after `ms` real milliseconds (-1: never finishes) */
const picPage = (ms: number): string =>
  page("", `${play()} { const i = document.createElement("img"); i.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;z-index:9"; i.src = "/pic.png?ms=${ms}"; document.documentElement.appendChild(i); }`);

let server: Server;
let host = "";
const seen: string[] = [];
let shimText = "";
let portB = 0;
let portC = 0;
let portD = 0;
const tcpSeen = { b: 0, c: 0 };
let udpSeen = 0;
const closers: (() => void)[] = [];
/** What the stand-in serves at /render-clock.js: the web's text, or a spoiled one (a spec sets it, and puts it back). */
let clockMode: "good" | "double" | "nofreeze" | "html" | "garbage" | "huge" | "redirect" = "good";
let clockHits = 0;
const upgrades: string[] = [];
const spoil = (mode: typeof clockMode): { type: string; body: string } => {
  if (mode === "double") return { type: "text/javascript", body: `${shimText}\n;(() => { const s = window.__vt.step; window.__vt.step = (ms) => s(ms * 2); })();` };
  if (mode === "nofreeze") return { type: "text/javascript", body: `${shimText}\n;window.__vt.freeze = function () {};` };
  if (mode === "html") return { type: "text/html", body: "<html>not a script</html>" };
  if (mode === "garbage") return { type: "text/javascript", body: "this is {{ not javascript" };
  if (mode === "huge") return { type: "text/javascript", body: `${shimText}\n/*${"x".repeat(300 * 1024)}*/` };
  return { type: "text/javascript; charset=utf-8", body: shimText };
};
const origin = (): string => `http://${host}`;

beforeAll(async () => {
  if (missing.length) return;
  shimText = (JSON.parse(spawnSync(process.execPath, ["--input-type=module", "-e", `import { pathToFileURL } from "node:url"; const m = await import(pathToFileURL(process.argv[1]).href); process.stdout.write(JSON.stringify(m.CLOCK_SHIM));`, WEB_SHIM], { encoding: "utf8" }).stdout) as string);
  server = createServer((rq, rs) => {
    if (rq.url === "/to-b.png") return void rs.writeHead(302, { location: `http://127.0.0.1:${portB}/landed.png` }).end();
    if (rq.url === "/render-clock.js") {
      clockHits++;
      if (clockMode === "redirect") return void rs.writeHead(302, { location: "http://203.0.113.7/render-clock.js" }).end();
      const c = spoil(clockMode);
      return void rs.writeHead(200, { "content-type": c.type, "cache-control": "no-store" }).end(c.body);
    }
    const asset = /^\/(asset\.txt|pic\.png)\?ms=(-?\d+)$/.exec(rq.url ?? "") ?? (rq.url === "/asset.txt" ? ["", "asset.txt", "0"] : null);
    if (asset) {
      const ms = Number(asset[2]);
      if (ms < 0) return void rs.writeHead(200, { "content-type": "image/png", "content-length": "99999" }).write("x");
      return void setTimeout(() => (asset[1] === "pic.png" ? rs.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }).end(RED) : rs.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }).end("x")), ms);
    }
    seen.push((rq.url ?? "").replace(/^\/render\/[^/]+/, "/render/[token]"));
    const m = /^\/render\/([^/?#]+)/.exec(rq.url ?? "");
    if (!m) {
      rs.writeHead(404).end("no");
      return;
    }
    const token = decodeURIComponent(m[1]);
    const kind = token.split("-")[0];
    if (kind === "redir") return void rs.writeHead(200, { "content-type": "text/html" }).end(page('<img src="/to-b.png">', play()));
    rs.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" }).end((pages[kind] ?? pages.good)?.(host, token));
  });
  server.on("upgrade", (_q, sock) => {
    upgrades.push("web");
    sock.destroy();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  for (const k of ["b", "c"] as const) {
    const t = createTcp((c) => {
      tcpSeen[k]++;
      c.destroy();
    });
    await new Promise<void>((r) => t.listen(0, "127.0.0.1", r));
    const port = (t.address() as AddressInfo).port;
    if (k === "b") portB = port;
    else portC = port;
    closers.push(() => t.close());
  }
  const u = createSocket("udp4");
  u.on("message", () => udpSeen++);
  await new Promise<void>((r) => u.bind(0, "127.0.0.1", () => r()));
  portD = u.address().port;
  closers.push(() => u.close());
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const c of closers) c();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

const mine = async (): Promise<string[]> => (await readdir(tmpdir())).filter((f) => f.startsWith(`${RENDER_TEMP_PREFIX}r5job-`) || f.startsWith(`${RENDER_TEMP_PREFIX}r5x-`)).sort();
/** Live processes of a group (a zombie only waits for init to reap it: it is not a process left behind). */
const groupMembers = (pid: number): number[] =>
  spawnSync("ps", ["-eo", "pid=,pgid=,stat="], { encoding: "utf8" }).stdout.split("\n").map((l) => l.trim().split(/\s+/)).filter(([p, g, st]) => (Number(g) === pid || Number(p) === pid) && st && !st.startsWith("Z")).map(([p]) => Number(p));
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
    webOrigin: origin(), chromiumPath: CHROMIUM, ffmpegPath: FFMPEG, playwrightModule: PLAYWRIGHT,
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
    const target = pids.filter((c) => c.kind === victim && alive(c.pid)).pop();
    expect(target).toBeDefined();
    process.kill((target as { pid: number }).pid, "SIGKILL");
    const err = (await done) as Error;
    expect(err.message).toMatch(victim === "chromium" ? /Chromium stopped|render page|Target|closed/i : /ffmpeg/i);
    expect(err.message).not.toContain("llllllllllll");
    for (const c of pids) expect(groupMembers(c.pid)).toEqual([]);
    expect(await mine()).toEqual([]);
  }, 90_000);
});


const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const frameHashes = (file: string): string[] =>
  spawnSync(FFMPEG, ["-v", "error", "-i", file, "-f", "framemd5", "-"], { encoding: "utf8", maxBuffer: 1 << 26 }).stdout.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(",").pop()?.trim() ?? "");

describe("R5 round 1: the allow-list and the metadata address (pure)", () => {
  it("H1: an entry matches host AND port; an entry with no port means the scheme's own port only", () => {
    const only = ["web.example"];
    expect(hostAllowed("https://web.example/x", only)).toBe(true);
    expect(hostAllowed("https://web.example:443/x", only)).toBe(true);
    expect(hostAllowed("https://web.example:6379/", only)).toBe(false);
    expect(hostAllowed("http://web.example:6379/", only)).toBe(false);
    expect(hostAllowed("wss://web.example:6379/", only)).toBe(false);
    expect(hostAllowed("https://web.example:6379/", ["web.example:6379"])).toBe(true);
    expect(hostAllowed("https://web.example/", ["web.example:6379"])).toBe(false);
    expect(hostAllowed("https://web.example/", ["web.example:443"])).toBe(true);
    expect(hostAllowed("https://a.store.example:6379/", ["*.store.example"])).toBe(false);
    expect(hostAllowed("https://a.store.example/", ["*.store.example"])).toBe(true);
    expect(hostAllowed("https://a.store.example:8443/", ["*.store.example:8443"])).toBe(true);
    expect(hostAllowed("https://a.store.example/", ["*.store.example:8443"])).toBe(false);
  });
  it("H1: the metadata address is blocked in IPv4, IPv4-mapped IPv6 and decimal (and hex) forms, even when listed", () => {
    const forms = ["169.254.169.254", "[::ffff:169.254.169.254]", "[::ffff:a9fe:a9fe]", "[0:0:0:0:0:ffff:a9fe:a9fe]", "2852039166", "0xa9fea9fe", "0251.0376.0251.0376", "[fd00:ec2::254]", "[fd00:ec2:0:0:0:0:0:254]", "metadata.google.internal", "169.254.1.1"];
    for (const f of forms) {
      expect([f, hostAllowed(`http://${f}/latest/meta-data/`, [f, f.replace(/^\[|\]$/g, ""), "*.internal"])]).toEqual([f, false]);
    }
    expect(hostAllowed("http://[::ffff:7f00:1]:8080/", ["[::ffff:7f00:1]:8080"])).toBe(true);
  });
  it("M5: the adapter imports and runs no code from the website (no child node, no dynamic import)", () => {
    const src = readFileSync(`${__dirname}/../chromium-video-renderer.ts`, "utf8");
    expect(src).not.toMatch(/--input-type|execFileSync|execSync|\bimport\s*\(|vm\.run|new Function\(|\beval\(/);
  });
});

real(`R5 round 1 on a stand-in web page${WHY}`, () => {
  it("H1: no WebSocket, WebRTC or WebTransport ever connects (not to another port of the host, a listed host, any host), and no other kind reaches an unlisted host or port", async () => {
    const before = { b: tcpSeen.b, c: tcpSeen.c, u: udpSeen, up: upgrades.length };
    const { r } = make({ allowedHosts: [host, `127.0.0.1:${portC}`] });
    await r.render(req("kinds-oooooooooooo"));
    await sleepMs(500);
    expect({ b: tcpSeen.b - before.b, c: tcpSeen.c - before.c, udp: udpSeen - before.u, webUpgrades: upgrades.length - before.up }).toEqual({ b: 0, c: 0, udp: 0, webUpgrades: 0 });
    const run = r.lastRun;
    expect(run?.blocked).toBeGreaterThanOrEqual(10);
    const hosts = run?.blockedHosts.join(" ") ?? "";
    expect(hosts).toContain(`127.0.0.1:${portB}`);
    expect(hosts).toMatch(/203\.0\.113\.9:81/);
    expect(hosts).toMatch(/other\.invalid/);
  }, 90_000);

  it("H1: a redirect from the web origin to an unlisted port of the same host is refused", async () => {
    const before = tcpSeen.b;
    const { r } = make();
    await r.render(req("redir-ppppppppppp"));
    expect(tcpSeen.b - before).toBe(0);
    expect(r.lastRun?.blockedHosts.join(" ")).toContain(`127.0.0.1:${portB}`);
  }, 60_000);

  it("M2: an abort at any moment of Chromium's start (0 to 900 ms, five times each) rejects in under 2 s with 'render aborted' and leaves nothing", async () => {
    for (const ms of [0, 100, 200, 300, 400, 600, 900]) {
      for (let k = 0; k < 5; k++) {
        const { r, pids } = make();
        const ac = new AbortController();
        const done = r.render(req(`good-abort${ms}k${k}xxxx`), ac.signal).catch((e: Error) => e);
        await sleepMs(ms);
        const at = Date.now();
        ac.abort();
        const err = (await done) as Error;
        const took = Date.now() - at;
        expect({ ms, k, msg: err.message, fast: took < 2000 }).toEqual({ ms, k, msg: "render aborted", fast: true });
        for (const c of pids) expect(alive(c.pid)).toBe(false);
        expect(await mine()).toEqual([]);
      }
    }
  }, 280_000);

  it("M3: the same wish rendered twice with the same epochMs has every decoded frame equal; another epochMs differs", async () => {
    const epochMs = 1_700_000_000_000;
    const a = await make().r.render(req("face-qqqqqqqqqqqq", { epochMs, seconds: 60 }));
    const ha = frameHashes(a.path);
    const b = await make().r.render(req("face-rrrrrrrrrrrr", { epochMs, seconds: 60 }));
    const hb = frameHashes(b.path);
    expect(ha.length).toBeGreaterThan(80);
    expect(hb.length).toBe(ha.length);
    expect(hb.filter((h, i) => h !== ha[i]).length).toBe(0);
    const c = await make().r.render(req("face-ssssssssssss", { epochMs: epochMs + 5000, seconds: 60 }));
    expect(frameHashes(c.path).filter((h, i) => h !== ha[i]).length).toBeGreaterThan(10);
  }, 180_000);

  it("M4: a throw in a stepped timer or a frame callback fails the render with the page's words and hands out no video", async () => {
    for (const [tok, words] of [["timerthrows-tttttttttttt", "timer boom"], ["rafthrows-uuuuuuuuuuuu", "frame boom"]]) {
      const { r } = make();
      const err = (await r.render(req(tok)).catch((e: Error) => e)) as Error;
      expect(err.message).toMatch(new RegExp(`^the render page threw: .*${words}`));
      expect(await mine()).toEqual([]);
    }
  }, 90_000);

  it("M5: the clock script is fetched from RENDER_WEB_ORIGIN/render-clock.js at each render; its self-check costs a few hundred ms", async () => {
    clockMode = "good";
    const h0 = clockHits;
    const { r } = make();
    await r.render(req("good-vvvvvvvvvvvv"));
    expect(clockHits - h0).toBe(1);
    expect(r.lastRun?.clockCheckMs).toBeGreaterThan(0);
    expect(r.lastRun?.clockCheckMs).toBeLessThan(5000);
    await r.render(req("good-wwwwwwwwwwww"));
    expect(clockHits - h0).toBe(2);
    process.stdout.write(`clock self-check cost: ${r.lastRun?.clockCheckMs} ms\n`);
  }, 120_000);

  it.each([["double"], ["nofreeze"], ["html"], ["garbage"]] as const)("M5: a clock that is '%s' fails as clock drift before any recording, with no file", async (mode) => {
    clockMode = mode;
    try {
      const { r } = make();
      const err = (await r.render(req("good-xxxxxxxxxxxx")).catch((e: Error) => e)) as Error;
      expect(err.message).toMatch(/clock drift/);
      expect(r.lastRun?.frames ?? 0).toBe(0);
      expect(await mine()).toEqual([]);
    } finally {
      clockMode = "good";
    }
  }, 60_000);

  it("M5: a clock bigger than 256 KB, a redirect, and an address outside the allow-list are refused with words", async () => {
    try {
      clockMode = "huge";
      await expect(make().r.render(req("good-yyyyyyyyyyyy"))).rejects.toThrow(/clock drift.*256 KB|256 KB/);
      clockMode = "redirect";
      await expect(make().r.render(req("good-yyyyyyyyyyyy"))).rejects.toThrow(/clock/);
    } finally {
      clockMode = "good";
    }
    const h0 = clockHits;
    await expect(make({ allowedHosts: ["web.example"] }).r.render(req("good-yyyyyyyyyyyy"))).rejects.toThrow(/clock.*allow/);
    expect(clockHits - h0).toBe(0);
    expect(await mine()).toEqual([]);
  }, 90_000);

  it("M5/L8: RENDER_CLOCK_PATH overrides the fetch; the optional pin holds; a broken clock file fails with plain words (no command line)", async () => {
    const dir = tmpdir();
    const good = `${dir}/pr5-clock-good.js`;
    const bad = `${dir}/pr5-clock-bad.js`;
    writeFileSync(good, shimText);
    writeFileSync(bad, "export const nothing = {{ broken");
    try {
      const h0 = clockHits;
      const { r } = make({ clockPath: good, clockSha256: createHash("sha256").update(shimText).digest("hex") });
      await rm((await r.render(req("good-zzzzzzzzzzzz"))).path, { force: true });
      expect(clockHits - h0).toBe(0);
      await expect(make({ clockPath: good, clockSha256: "0".repeat(64) }).r.render(req("good-zzzzzzzzzzzz"))).rejects.toThrow(/drift/);
      const err = (await make({ clockPath: bad }).r.render(req("good-zzzzzzzzzzzz")).catch((e: Error) => e)) as Error;
      expect(err.message).toMatch(/clock drift/);
      expect(err.message).not.toMatch(/Command failed|--input-type|node:|\bnode\b/);
      const gone = (await make({ clockPath: `${dir}/pr5-clock-missing.js` }).r.render(req("good-zzzzzzzzzzzz")).catch((e: Error) => e)) as Error;
      expect(gone.message).toMatch(/clock/);
      expect(gone.message).not.toMatch(/ENOENT|Command failed|--input-type/);
    } finally {
      await rm(good, { force: true });
      await rm(bad, { force: true });
    }
    expect(await mine()).toEqual([]);
  }, 120_000);

  it("L8: a navigation to another page of the same host fails with plain words", async () => {
    const { r } = make();
    const err = (await r.render(req("navsame-aaaaaaaaaaaa")).catch((e: Error) => e)) as Error;
    expect(err.message).toBe("the render page navigated away");
    expect(await mine()).toEqual([]);
  }, 60_000);

  it("L7: an ffmpeg that dies while flushing a scene fails the render at once, not at the end of play", async () => {
    const wrap = `${tmpdir()}/pr5-ffmpeg-wrap.sh`;
    writeFileSync(wrap, `#!/bin/sh\nfor last; do :; done\ncase "$last" in *seg-0.ts) cat >/dev/null; sleep 1; echo boom >&2; exit 1;; esac\nexec ${FFMPEG} "$@"\n`, { mode: 0o755 });
    try {
      const { r, pids } = make({ ffmpegPath: wrap });
      const t0 = Date.now();
      const err = (await r.render(req("long-bbbbbbbbbbbb")).catch((e: Error) => e)) as Error;
      expect(err.message).toMatch(/ffmpeg/);
      expect(Date.now() - t0).toBeLessThan(15_000);
      for (const c of pids) expect(groupMembers(c.pid)).toEqual([]);
      expect(await mine()).toEqual([]);
    } finally {
      await rm(wrap, { force: true });
    }
  }, 40_000);
});

/* ---- R5 round 2 (IK6g) ---- */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readlinkSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { join as pjoin } from "node:path";

/** The first moment of a frame (the middle pixel of decoded frame n, as r g b). */
const pixel = (file: string, n: number, x: number, y: number): number[] => [...spawnSync(FFMPEG, ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${n}),crop=2:2:${x}:${y}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 20 }).stdout].slice(0, 3);
/** Every listening TCP socket of this machine: port -> the process ids that hold it (from /proc). */
const listening = (): Map<number, number[]> => {
  const inodes = new Map<string, number>();
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"].filter((x) => existsSync(x))) {
    for (const l of readFileSync(f, "utf8").split("\n").slice(1)) {
      const c = l.trim().split(/\s+/);
      if (c[3] === "0A") inodes.set(c[9], parseInt(c[1].split(":")[1], 16));
    }
  }
  const out = new Map<number, number[]>();
  for (const port of inodes.values()) out.set(port, out.get(port) ?? []);
  for (const d of readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${d}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/${d}/fd/${fd}`));
        const port = m ? inodes.get(m[1]) : undefined;
        if (port !== undefined) out.get(port)?.push(Number(d));
      } catch {
        /* gone */
      }
    }
  }
  return out;
};
const waitFor = async (what: () => boolean, ms: number): Promise<boolean> => {
  for (const end = Date.now() + ms; Date.now() < end; await sleepMs(40)) if (what()) return true;
  return what();
};
const raw = (port: number, text: string): Promise<string> =>
  new Promise((resolve) => {
    const s = netConnect(port, "127.0.0.1", () => s.write(text));
    let got = "";
    s.on("data", (d) => (got += d.toString("latin1")));
    s.on("close", () => resolve(got));
    s.on("error", () => resolve(got));
    setTimeout(() => s.destroy(), 1500);
  });

real(`R5 round 2 on a stand-in web page${WHY}`, () => {
  it("H1: the clock is at exactly 0 until ready, whatever the page waits on; the same wish twice with one epochMs has 0 frames that differ, with a slow read in one run too; frame 0 is the first moment", async () => {
    const epochMs = 1_700_000_000_000;
    const a = await make().r.render(req("h1fast-aaaaaaaaaaaa", { epochMs, seconds: 60 }));
    const b = await make().r.render(req("h1slow-bbbbbbbbbbbb", { epochMs, seconds: 60 }));
    const ha = frameHashes(a.path);
    const hb = frameHashes(b.path);
    expect(ha.length).toBeGreaterThan(80);
    expect(hb.length).toBe(ha.length);
    expect(hb.filter((h, i) => h !== ha[i]).length).toBe(0);
    /* frame 0 shows the first scene ("opening": hsl(0,60%,35%)), not a later moment */
    const [r, g, bl] = pixel(a.path, 0, W - 30, 10);
    expect({ rgb: [r, g, bl], near: r > 120 && g < 70 && bl < 70 }).toEqual({ rgb: [r, g, bl], near: true });
  }, 120_000);

  it("M4: a picture that is merely slow (3 s, 10 s) is in the first frame; one that never completes FAILS in plain words inside the limit and hands out no video", async () => {
    for (const [tok, ms] of [["pic3-cccccccccccc", 3000], ["pic10-dddddddddddd", 10_000]] as const) {
      const f = await make({ assetTimeoutMs: 30_000 }).r.render(req(tok, { epochMs: 1_700_000_000_000, seconds: 60 }));
      const [r, g, bl] = pixel(f.path, 0, W / 2, H / 2);
      expect({ ms, rgb: [r, g, bl], red: r > 200 && g < 60 && bl < 60 }).toEqual({ ms, rgb: [r, g, bl], red: true });
      await rm(f.path, { force: true });
    }
    const t0 = Date.now();
    const err = (await make({ assetTimeoutMs: 4000 }).r.render(req("pichang-eeeeeeeeeeee", { seconds: 60 })).catch((e: Error) => e)) as Error | RenderedLike;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/picture or a font did not finish loading within 4 s/);
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(await mine()).toEqual([]);
  }, 120_000);

  it("H2: Chromium listens on no port during a render, and no local port gives the token away", async () => {
    const { r, pids } = make();
    const token = "long-ffffffffffffffffffff";
    const done = r.render(req(token)).catch((e: Error) => e);
    expect(await waitFor(() => pids.some((c) => c.kind === "ffmpeg"), 30_000)).toBe(true);
    await sleepMs(1200);
    const chromium = pids.find((c) => c.kind === "chromium")?.pid ?? -1;
    const group = new Set(groupMembers(chromium));
    expect(group.size).toBeGreaterThan(0);
    const ports = listening();
    const held = [...ports].filter(([, owners]) => owners.some((p) => group.has(p))).map(([port]) => port);
    expect(held).toEqual([]);
    /* a sweep of every listening port of the machine: no body, on any usual debugging path, holds the token */
    for (const port of ports.keys()) {
      for (const path of ["/json/list", "/json/version", "/json", "/"]) {
        const body = await raw(port, `GET ${path} HTTP/1.0\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
        expect({ port, leaks: body.includes("ffffffffffffffffffff") }).toEqual({ port, leaks: false });
      }
    }
    pids.forEach((c) => c.kind === "chromium" && process.kill(-c.pid, "SIGKILL"));
    await done;
  }, 120_000);

  it("M5: the proxy asks for a secret made for this render: another local process gets 407 for a listed host as well as for an unlisted one, and the render itself works", async () => {
    const { r, pids, logs } = make();
    const done = r.render(req("long-gggggggggggggggggggg")).catch((e: Error) => e);
    expect(await waitFor(() => pids.some((c) => c.kind === "ffmpeg"), 30_000)).toBe(true);
    await sleepMs(800);
    const known = new Set([Number(host.split(":")[1]), portB, portC]);
    const mineHeld = [...listening()].filter(([port, owners]) => owners.includes(process.pid) && !known.has(port)).map(([port]) => port);
    expect(mineHeld.length).toBe(1);
    const proxy = mineHeld[0];
    for (const target of [host, "203.0.113.7:80", "169.254.169.254:80"]) {
      expect({ target, get: /^HTTP\/1\.1 407/.test(await raw(proxy, `GET http://${target}/asset.txt HTTP/1.1\r\nHost: ${target}\r\n\r\n`)) }).toEqual({ target, get: true });
      expect({ target, connect: /^HTTP\/1\.1 407/.test(await raw(proxy, `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)) }).toEqual({ target, connect: true });
    }
    const ps = spawnSync("ps", ["-eo", "args="], { encoding: "utf8" }).stdout;
    expect(ps).not.toMatch(/--proxy-server=[^ ]*@/);
    expect(ps).not.toMatch(/proxy-auth|proxy-pass/i);
    pids.forEach((c) => c.kind === "chromium" && process.kill(-c.pid, "SIGKILL"));
    await done;
    expect(logs.join("\n")).not.toMatch(/proxy-auth|Basic /i);
    /* and a whole render with the secret in place works */
    await make().r.render(req("good-hhhhhhhhhhhh"));
  }, 120_000);

  it("L: plain words for 'write EPIPE' and 'Target page ... closed'; a clean render counts no blocked request (Chromium's own background calls are not the page's)", async () => {
    expect(plainWords("write EPIPE")).toBe("ffmpeg stopped taking frames");
    expect(plainWords("page.evaluate: Target page, context or browser has been closed")).toBe("Chromium stopped");
    expect(plainWords("Target closed")).toBe("Chromium stopped");
    expect(plainWords("something else entirely")).toBe("something else entirely");
    const { r } = make();
    await r.render(req("good-iiiiiiiiiiii"));
    expect({ blocked: r.lastRun?.blocked, hosts: r.lastRun?.blockedHosts }).toEqual({ blocked: 0, hosts: [] });
  }, 60_000);

  it("H3: SIGKILL of the node process mid-render leaves no Chromium, no ffmpeg, no proxy port and no listening port of theirs within 5 s", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require("typescript") as typeof import("typescript");
    const out = mkdtempSync(pjoin(tmpdir(), "r5h3-"));
    const root = pjoin(__dirname, "..", "..", "..");
    for (const f of ["modules/render-jobs/chromium-video-renderer", "modules/render-jobs/video-renderer", "common/ports/ping"]) {
      const js = ts.transpileModule(readFileSync(pjoin(root, `${f}.ts`), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      const dest = pjoin(out, `${f}.js`);
      mkdirSync(pjoin(dest, ".."), { recursive: true });
      writeFileSync(dest, js);
    }
    const script = pjoin(out, "child.cjs");
    writeFileSync(script, `
      const { ChromiumVideoRenderer } = require(${JSON.stringify(pjoin(out, "modules/render-jobs/chromium-video-renderer.js"))});
      const o = JSON.parse(process.argv[2]);
      const quiet = { log() {}, warn() {}, error() {} };
      const r = new ChromiumVideoRenderer({ ...o.options, onSpawn: (k, pid) => console.log(JSON.stringify({ k, pid })), logger: quiet });
      r.render(o.req).then(() => process.exit(0), (e) => { console.log("ERR " + e.message); process.exit(1); });`);
    const child = spawn(process.execPath, [script, JSON.stringify({ options: { webOrigin: origin(), chromiumPath: CHROMIUM, ffmpegPath: FFMPEG, playwrightModule: PLAYWRIGHT }, req: req("long-jjjjjjjjjjjjjjjj") })], {
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, NODE_PATH: pjoin(root, "..", "node_modules") },
    });
    const kids: { k: string; pid: number }[] = [];
    child.stdout.on("data", (d: Buffer) => {
      for (const l of d.toString().split("\n")) if (l.startsWith("{")) kids.push(JSON.parse(l));
    });
    expect(await waitFor(() => kids.some((c) => c.k === "ffmpeg"), 40_000)).toBe(true);
    await sleepMs(1500);
    const chromium = kids.find((c) => c.k === "chromium")?.pid ?? -1;
    const before = new Set([...kids.map((c) => c.pid), ...groupMembers(chromium)]);
    const theirs = [...listening()].filter(([, owners]) => owners.some((p) => p === child.pid || before.has(p))).map(([port]) => port);
    expect(theirs.length).toBeGreaterThan(0); /* the proxy at least */
    const gone = (): boolean => [...before].every((p) => !spawnSync("ps", ["-o", "stat=", "-p", String(p)], { encoding: "utf8" }).stdout.trim() || spawnSync("ps", ["-o", "stat=", "-p", String(p)], { encoding: "utf8" }).stdout.trim().startsWith("Z"));
    process.kill(child.pid as number, "SIGKILL");
    const t0 = Date.now();
    const ok = await waitFor(() => gone() && [...listening().keys()].every((p) => !theirs.includes(p)), 5000);
    const left = [...before].filter((p) => alive(p) && !spawnSync("ps", ["-o", "stat=", "-p", String(p)], { encoding: "utf8" }).stdout.trim().startsWith("Z"));
    if (!ok) left.forEach((p) => { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } });
    expect({ ok, left, tookMs: Date.now() - t0 < 5200 }).toEqual({ ok: true, left: [], tookMs: true });
    await rm(out, { recursive: true, force: true });
  }, 90_000);
});
type RenderedLike = { path: string };
