import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { Logger } from "@nestjs/common";
import { type PortPing, pingError, pingWith } from "../../common/ports/ping";
import { RENDER_TEMP_PREFIX, VideoRenderer, type RenderedFile, type RenderRequest } from "./video-renderer";

/**
 * R5: the real video renderer behind the VideoRenderer port. It opens the web's render page (RENDER_WEB_ORIGIN + /render/<token>) in a
 * headless Chromium that it starts itself (so it holds the process id and can kill it), freezes the web's stepped clock from the page's
 * first script, steps time 1/30 s at a time, captures each frame over the browser protocol and pipes it to ffmpeg (H.264, yuv420p, no sound).
 *
 * How the pieces are chosen (the brief's decisions):
 *  - The stepped clock is the WEB's module (scripts/lib/stepped-clock.mjs). The API holds no copy: the renderer reads CLOCK_SHIM from the file
 *    named by RENDER_CLOCK_PATH (the web checkout the worker ships with), so the two cannot drift by hand. Drift is loud: RENDER_CLOCK_SHA256
 *    (optional) pins the file and a mismatch fails the render with words; a spec runs the shim in Chromium and fails if the clock's calls
 *    (freeze, step, now) no longer step time exactly.
 *  - Playwright is only the protocol driver (connectOverCDP to the Chromium this class started). `playwright-core` (or `playwright`) must be
 *    resolvable on the worker (RENDER_PLAYWRIGHT_MODULE names it by path); it is a deploy item, not a dependency of the web-facing server.
 *  - Frames never touch the disk as pictures. Each whole scene is encoded as its own short H.264 segment (MPEG-TS, a few MB); at the page's
 *    `done` the segments that fit the length are joined without re-encoding (IK6a: the opening and the ending whole, whole middle scenes dropped).
 *
 * Nothing here ever logs, stores or names a file with the token: every message passes through `mask`.
 */

export interface ChromiumRendererOptions {
  /** The web origin, e.g. https://firstwish.example (RENDER_WEB_ORIGIN). */
  webOrigin: string;
  /** Hosts (host or host:port; "*.x.y" matches subdomains) Chromium may reach. Default: the origins below, the storage hosts and the font hosts. */
  allowedHosts?: string[];
  apiOrigin?: string;
  storageHosts?: string[];
  fontHosts?: string[];
  chromiumPath?: string;
  ffmpegPath?: string;
  /** The web's scripts/lib/stepped-clock.mjs. */
  clockPath?: string;
  /** When set, the clock file must hash to this (hex sha256), else the render fails loudly. */
  clockSha256?: string;
  /** Where playwright-core is (a path to the module); else `playwright-core` / `playwright` are looked up. */
  playwrightModule?: string;
  /** Where a render keeps its work (default: the temp folder; the finished file is always put there). */
  tmpRoot?: string;
  fps?: number;
  /** ffmpeg: constant-rate-factor and the cap in kilobits a second (default 23 and 1800: a 60 s file is under 14 MB). */
  crf?: number;
  maxKbps?: number;
  preset?: string;
  /** How long to wait for the page's ready (real milliseconds), and for any one frame to come back. */
  readyTimeoutMs?: number;
  frameTimeoutMs?: number;
  /** A proof script or a spec learns each child process id as it starts (to sample its memory, or to kill it). Never a token. */
  onSpawn?: (kind: "chromium" | "ffmpeg", pid: number) => void;
  logger?: Pick<Logger, "log" | "warn" | "error">;
}

export interface ChromiumRunStats {
  jobId: string;
  frames: number;
  keptFrames: number;
  scenes: { name: string; frames: number; kept: boolean }[];
  blocked: number;
  blockedHosts: string[];
  allowedRequests: number;
  readyMs: number;
  totalMs: number;
}

const META_HOSTS = ["169.254.169.254", "metadata.google.internal", "metadata", "fd00:ec2::254", "100.100.100.200"];
export const DEFAULT_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/** Every place a token can show: the page's address and the read's address. */
export function maskToken(text: string, token?: string): string {
  let out = String(text);
  if (token) {
    for (const t of new Set([token, encodeURIComponent(token)])) if (t.length >= 4) out = out.split(t).join("[token]");
  }
  return out.replace(/(\/render\/)[^/\s?#"'<>)]+/g, "$1[token]");
}

function hostOf(url: string): { host: string; hostname: string } | null {
  try {
    const u = new URL(url);
    return { host: u.host.toLowerCase(), hostname: u.hostname.toLowerCase().replace(/^\[|\]$/g, "") };
  } catch {
    return null;
  }
}

function isMetadata(hostname: string): boolean {
  return META_HOSTS.includes(hostname) || /^169\.254\./.test(hostname) || hostname.startsWith("fe80:");
}

/** The default allowed hosts: the two origins, the storage hosts and the font hosts. */
export function defaultAllowedHosts(o: Pick<ChromiumRendererOptions, "webOrigin" | "apiOrigin" | "storageHosts" | "fontHosts">): string[] {
  const out = new Set<string>();
  for (const origin of [o.webOrigin, o.apiOrigin]) {
    const h = origin ? hostOf(origin) : null;
    if (h) out.add(h.host);
  }
  for (const s of o.storageHosts ?? []) out.add(s.toLowerCase());
  for (const f of o.fontHosts ?? DEFAULT_FONT_HOSTS) out.add(f.toLowerCase());
  return [...out];
}

/** A request is allowed when its host (or host:port) is listed, or a "*.suffix" entry matches; the metadata addresses never are. */
export function hostAllowed(url: string, allowed: readonly string[]): boolean {
  const h = hostOf(url);
  if (!h || isMetadata(h.hostname)) return false;
  return allowed.some((a) => {
    const e = a.toLowerCase();
    if (e.startsWith("*.")) return h.hostname.endsWith(e.slice(1)) && h.hostname.length > e.length - 1;
    return e === h.host || e === h.hostname;
  });
}

/** Settings from the environment (R6 wires these into the env check; here they are only read). */
export function chromiumRendererOptionsFromEnv(env: NodeJS.ProcessEnv): ChromiumRendererOptions | null {
  const webOrigin = env.RENDER_WEB_ORIGIN?.trim();
  if (!webOrigin) return null;
  const list = (v?: string): string[] => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const storage = list(env.RENDER_STORAGE_HOSTS);
  const endpoint = env.SPACES_ENDPOINT ? hostOf(env.SPACES_ENDPOINT.includes("://") ? env.SPACES_ENDPOINT : `https://${env.SPACES_ENDPOINT}`) : null;
  if (endpoint) storage.push(endpoint.host, `*.${endpoint.hostname}`);
  if (env.R2_ACCOUNT_ID) storage.push(`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, `*.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  const opts: ChromiumRendererOptions = { webOrigin, apiOrigin: env.API_PUBLIC_URL, storageHosts: storage };
  const allowed = list(env.RENDER_ALLOWED_HOSTS);
  if (allowed.length) opts.allowedHosts = allowed;
  if (env.RENDER_CHROMIUM_PATH) opts.chromiumPath = env.RENDER_CHROMIUM_PATH;
  if (env.RENDER_FFMPEG_PATH) opts.ffmpegPath = env.RENDER_FFMPEG_PATH;
  if (env.RENDER_CLOCK_PATH) opts.clockPath = env.RENDER_CLOCK_PATH;
  if (env.RENDER_CLOCK_SHA256) opts.clockSha256 = env.RENDER_CLOCK_SHA256;
  if (env.RENDER_PLAYWRIGHT_MODULE) opts.playwrightModule = env.RENDER_PLAYWRIGHT_MODULE;
  return opts;
}

/** Loads CLOCK_SHIM from the web's ES module in a child node (so it works the same under every module system). Cached by path and time. */
const shimCache = new Map<string, { mtime: number; source: string; sha256: string }>();
export function loadClockShim(clockPath: string): { source: string; sha256: string } {
  const st = statSync(clockPath);
  const hit = shimCache.get(clockPath);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `import { pathToFileURL } from "node:url"; const m = await import(pathToFileURL(process.argv[1]).href); process.stdout.write(JSON.stringify({ shim: m.CLOCK_SHIM }));`, clockPath],
    { encoding: "utf8", maxBuffer: 1 << 24, timeout: 20000 },
  );
  const shim = (JSON.parse(out) as { shim?: unknown }).shim;
  if (typeof shim !== "string" || !shim.includes("__vt")) throw new Error("the stepped clock file does not export CLOCK_SHIM (the web's module changed: the renderer must be brought up to date)");
  const entry = { mtime: st.mtimeMs, source: shim, sha256: createHash("sha256").update(readFileSync(clockPath)).digest("hex") };
  shimCache.set(clockPath, entry);
  return entry;
}

/* ---- the little part of Playwright this file touches ---- */
interface PwPage {
  on(ev: string, fn: (...a: any[]) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  goto(url: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
  /** An expression (or an async function call) run in the page. */
  evaluate<R>(expression: string): Promise<R>;
  mainFrame(): unknown;
}
interface PwContext {
  route(match: string, h: (r: PwRoute) => unknown): Promise<void>;
  addInitScript(s: string): Promise<void>;
  newPage(): Promise<PwPage>;
  newCDPSession(p: PwPage): Promise<{ send(m: string, p?: object): Promise<{ data: string }> }>;
  on(ev: string, fn: (...a: any[]) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  close(): Promise<void>;
}
interface PwRoute {
  request(): { url(): string };
  abort(code?: string): Promise<void>;
  continue(): Promise<void>;
}
interface PwBrowser {
  newContext(o: object): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { connectOverCDP(url: string, o?: { timeout?: number }): Promise<PwBrowser> };
}

function loadPlaywright(explicit?: string): PwModule {
  const req = createRequire(__filename);
  const names = [explicit, process.env.RENDER_PLAYWRIGHT_MODULE, "playwright-core", "playwright", "/opt/node-tools/node_modules/playwright-core"].filter((x): x is string => !!x);
  for (const n of names) {
    try {
      return req(n) as PwModule;
    } catch {
      /* next */
    }
  }
  throw new Error("playwright-core is not installed on this machine (RENDER_PLAYWRIGHT_MODULE names where it is)");
}

class RenderStop extends Error {}

export class ChromiumVideoRenderer extends VideoRenderer {
  private readonly o: Required<Pick<ChromiumRendererOptions, "fps" | "crf" | "maxKbps" | "preset" | "readyTimeoutMs" | "frameTimeoutMs">> & ChromiumRendererOptions;
  private readonly log: Pick<Logger, "log" | "warn" | "error">;
  /** The numbers of the newest finished (or failed) run, for a proof script and a spec; never holds the token. */
  lastRun: ChromiumRunStats | null = null;

  constructor(options: ChromiumRendererOptions) {
    super();
    this.o = { fps: 30, crf: 23, maxKbps: 1800, preset: "veryfast", readyTimeoutMs: 150_000, frameTimeoutMs: 60_000, ...options };
    this.log = options.logger ?? new Logger("chromium-video-renderer");
  }

  private get chromiumPath(): string {
    return this.o.chromiumPath ?? "/usr/bin/google-chrome";
  }
  private get ffmpegPath(): string {
    return this.o.ffmpegPath ?? "/usr/bin/ffmpeg";
  }
  private get allowed(): string[] {
    return this.o.allowedHosts?.length ? this.o.allowedHosts : defaultAllowedHosts(this.o);
  }

  /** True only when everything a render needs is on this machine: both programs, the web's clock file and a protocol driver. */
  configured(): boolean {
    return this.problem() === null;
  }

  private problem(): string | null {
    try {
      if (!this.o.webOrigin) return "RENDER_WEB_ORIGIN is not set";
      accessSync(this.chromiumPath, constants.X_OK);
    } catch {
      return `Chromium is not at ${this.chromiumPath}`;
    }
    try {
      accessSync(this.ffmpegPath, constants.X_OK);
    } catch {
      return `ffmpeg is not at ${this.ffmpegPath}`;
    }
    if (!this.o.clockPath || !existsSync(this.o.clockPath)) return "RENDER_CLOCK_PATH does not name the web's stepped clock file";
    try {
      loadPlaywright(this.o.playwrightModule);
    } catch (e) {
      return (e as Error).message;
    }
    return null;
  }

  async ping(): Promise<PortPing> {
    const p = this.problem();
    if (p) return pingError(p);
    return pingWith(async () => {
      const sum = loadClockShim(this.o.clockPath as string);
      if (this.o.clockSha256 && sum.sha256 !== this.o.clockSha256) throw new Error("the web's stepped clock file is not the one this renderer was pinned to");
      const r = await fetch(`${this.o.webOrigin.replace(/\/$/, "")}/`, { method: "HEAD", signal: AbortSignal.timeout(8000), redirect: "manual" });
      if (r.status >= 500) throw new Error(`the web answered ${r.status}`);
    });
  }

  async render(input: RenderRequest, signal?: AbortSignal): Promise<RenderedFile> {
    const token = input.token;
    const mask = (t: string): string => maskToken(t, token);
    const jobId = input.jobId ?? "direct";
    const started = performance.now();
    if (!token) throw new Error("the render has no token to open the wish with");
    const problem = this.problem();
    if (problem) throw new Error(mask(`the video renderer is not ready: ${problem}`));
    const clock = loadClockShim(this.o.clockPath as string);
    if (this.o.clockSha256 && clock.sha256 !== this.o.clockSha256) throw new Error("the web's stepped clock file is not the one this renderer was pinned to (drift): update RENDER_CLOCK_SHA256 or the web checkout");

    const root = this.o.tmpRoot ?? tmpdir();
    const stem = `${RENDER_TEMP_PREFIX}${jobId}-${randomUUID()}`;
    const work = join(root, `${stem}-work`);
    const finalPath = join(tmpdir(), `${stem}.mp4`);
    const procs = new Set<ChildProcess>();
    let chromium: ChildProcess | null = null;
    let stopped = false;
    /* settles (rejects) the moment a child dies that should be alive, so no call waits out a time limit on a dead browser or encoder */
    let die: (e: Error) => void = () => undefined;
    const dead = new Promise<never>((_, reject) => {
      die = reject;
    });
    dead.catch(() => undefined);
    const guard = <T>(p: Promise<T>, words: string): Promise<T> => withTimeout(Promise.race([p, dead]), this.o.frameTimeoutMs, words);
    const killAll = (): void => {
      for (const p of procs) killPid(p, p === chromium);
    };
    const onAbort = (): void => {
      stopped = true;
      killAll();
    };
    /* what the page or a child did wrong, in the order it was seen: the first is the reason a job fails (a protocol error after it is only the echo) */
    const failures: string[] = [];
    const blockedHosts = new Map<string, number>();
    let blocked = 0;
    let allowedRequests = 0;
    const allowed = this.allowed;
    const stats: ChromiumRunStats = { jobId, frames: 0, keptFrames: 0, scenes: [], blocked: 0, blockedHosts: [], allowedRequests: 0, readyMs: 0, totalMs: 0 };
    const check = (): void => {
      if (stopped || signal?.aborted) throw new RenderStop("render aborted");
    };
    let browser: PwBrowser | null = null;
    try {
      if (signal?.aborted) throw new RenderStop("render aborted");
      signal?.addEventListener("abort", onAbort, { once: true });
      await mkdir(join(work, "profile"), { recursive: true, mode: 0o700 });

      /* Chromium: our own process, our own profile folder, a debugging port we read from its first line */
      const hostRules = `MAP * ~NOTFOUND , ${allowed.filter((a) => !a.startsWith("*.")).map((a) => `EXCLUDE ${a.replace(/:\d+$/, "")}`).join(" , ")}`;
      const args = [
        "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${join(work, "profile")}`, "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--disable-background-networking", "--disable-sync", "--disable-component-update", "--disable-default-apps",
        "--disable-breakpad", "--disable-dev-shm-usage", "--mute-audio", "--hide-scrollbars", "--force-color-profile=srgb",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required",
        `--host-resolver-rules=${hostRules}`, `--window-size=${input.width},${input.height}`, "--no-pings", "--disable-features=Translate,MediaRouter",
      ];
      if (typeof process.getuid === "function" && process.getuid() === 0) args.push("--no-sandbox");
      args.push("about:blank");
      const child = spawn(this.chromiumPath, args, { detached: true, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, HOME: join(work, "profile") } });
      chromium = child;
      if (child.pid) this.o.onSpawn?.("chromium", child.pid);
      procs.add(child);
      let chromiumDied = "";
      child.once("exit", (code, sig) => {
        if (stopped) return;
        chromiumDied = `Chromium stopped (${sig ?? `exit ${code}`})`;
        die(new Error(chromiumDied));
      });
      const wsUrl = await new Promise<string>((resolve, reject) => {
        let buf = "";
        const timer = setTimeout(() => reject(new Error("Chromium did not start within 30 s")), 30_000);
        child.stderr?.on("data", (d: Buffer) => {
          if (buf.length > 20_000) return;
          buf += d.toString();
          const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
          if (m) {
            clearTimeout(timer);
            resolve(m[1]);
          }
        });
        child.once("exit", (code, sig) => {
          clearTimeout(timer);
          reject(new Error(`Chromium stopped before it was ready (${sig ?? `exit ${code}`})`));
        });
        child.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
      check();
      const pw = loadPlaywright(this.o.playwrightModule);
      browser = await pw.chromium.connectOverCDP(wsUrl, { timeout: 30_000 });
      const ctx = await browser.newContext({
        viewport: { width: input.width, height: input.height }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference",
        serviceWorkers: "block", acceptDownloads: false, permissions: [], locale: "en-US", javaScriptEnabled: true,
      });
      const fail = (words: string): void => {
        failures.push(words);
        die(new Error(words));
      };
      /* the allowlist: everything else is blocked and counted by host (never by address: the address holds the token) */
      await ctx.route("**/*", async (route) => {
        const url = route.request().url();
        if (/^(data|blob|about):/.test(url) || hostAllowed(url, allowed)) {
          allowedRequests++;
          await route.continue().catch(() => undefined);
          return;
        }
        const h = hostOf(url)?.host ?? "unknown";
        blocked++;
        blockedHosts.set(h, (blockedHosts.get(h) ?? 0) + 1);
        await route.abort("blockedbyclient").catch(() => undefined);
      });
      let pages = 0;
      ctx.on("page", (p: PwPage & { close?: () => Promise<void> }) => {
        /* any second page (a pop-up) is closed at once */
        if (pages > 0) void p.close?.().catch(() => undefined);
        pages++;
      });
      await ctx.addInitScript(clock.source);
      await ctx.addInitScript("window.__vt.freeze();");
      const page = await ctx.newPage();
      const pageUrl = `${this.o.webOrigin.replace(/\/$/, "")}/render/${encodeURIComponent(token)}`;
      let loaded = false;
      page.on("pageerror", (e: Error) => fail(`the render page threw: ${mask(String(e?.message ?? e)).slice(0, 200)}`));
      page.on("crash", () => fail("the render page crashed"));
      page.on("framenavigated", (f: { url(): string }) => {
        if (f !== page.mainFrame() || !loaded) return;
        const at = hostOf(f.url());
        if (!at || at.host !== hostOf(pageUrl)?.host || !new URL(f.url()).pathname.startsWith("/render/")) fail("the render page navigated away");
      });
      page.on("download", () => fail("the render page tried to download a file"));
      page.on("dialog", (d: { dismiss(): Promise<void> }) => void d.dismiss().catch(() => undefined));
      const bad = (): void => {
        check();
        if (chromiumDied) throw new Error(chromiumDied);
        if (failures.length) throw new Error(failures[0]);
      };

      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
      loaded = true;
      const readyBegan = performance.now();
      /* step 16 ms of stepped time for each 50 ms real while the page loads, so its own short waits (the Studio rig's 120 ms poll) do not run out */
      for (;;) {
        bad();
        const s = await guard(page.evaluate<{ ready: boolean; error: string }>(`({ ready: !!window.__render?.ready, error: window.__render?.error ?? "" })`), "the page did not answer");
        if (s.error) throw new Error(mask(`the render page said: ${s.error}`).slice(0, 300));
        if (s.ready) break;
        if (performance.now() - readyBegan > this.o.readyTimeoutMs) throw new Error(`the render page was never ready within ${Math.round(this.o.readyTimeoutMs / 1000)} s`);
        await guard(page.evaluate("window.__vt.step(16)"), "the page did not answer a step");
        await sleep(50);
      }
      stats.readyMs = Math.round(performance.now() - readyBegan);
      const cdp = await ctx.newCDPSession(page);

      /* the frame loop: one stepped tick, one capture, one write to the scene's own encoder */
      const dt = 1000 / this.o.fps;
      const cap = Math.max(240, input.seconds * 3) * this.o.fps;
      const segs: Segment[] = [];
      const closing: Promise<void>[] = [];
      const segment = (i: number): Segment => {
        while (segs.length <= i) {
          /* a scene that is over is closed at once, so only the scene on show and the one flushing hold an encoder (memory) */
          const last = segs[segs.length - 1];
          if (last) {
            const c = last.finish();
            c.catch(() => undefined);
            closing.push(c);
          }
          segs.push(this.openSegment(join(work, `seg-${segs.length}.ts`), input, procs, mask, (e) => die(e)));
        }
        return segs[i];
      };
      const frameOf = async (i: number): Promise<void> => {
        bad();
        const shot = await guard(cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, optimizeForSpeed: true }), "a frame never came");
        const seg = segment(i);
        await seg.write(Buffer.from(shot.data, "base64"));
        stats.frames++;
      };
      let scene = 0;
      await frameOf(0);
      for (let n = 1; ; n++) {
        if (n > cap) throw new Error(`the wish did not finish within ${Math.round(cap / this.o.fps)} s of play`);
        const r = await guard(
          page.evaluate<{ n: number; done: boolean; error: string }>(
            `(async () => { await window.__vt.step(${dt}); const x = window.__render; return { n: x?.scenes?.length ?? 0, done: !!x?.done, error: x?.error ?? "" }; })()`,
          ),
          "the page did not answer a step",
        );
        if (r.error) throw new Error(mask(`the render page said: ${r.error}`).slice(0, 300));
        scene = Math.max(scene, r.n - 1, 0);
        await frameOf(scene);
        if (r.done) break;
      }
      bad();
      const list = await page.evaluate<string[]>(`(window.__render?.scenes ?? []).map((s) => s.name)`);
      const lastSeg = segs[segs.length - 1];
      if (lastSeg) closing.push(lastSeg.finish());
      await Promise.all(closing);
      bad();

      /* IK6a: keep the opening and the ending whole; if the whole is longer than the request, drop whole middle scenes (the middle-most first) */
      const names = segs.map((_, i) => list[i] ?? `scene ${i + 1}`);
      const keep = chooseScenes(names, segs.map((s) => s.frames), input.seconds * this.o.fps);
      stats.scenes = names.map((name, i) => ({ name, frames: (segs[i]).frames, kept: keep[i] }));
      stats.keptFrames = stats.scenes.filter((s) => s.kept).reduce((a, s) => a + s.frames, 0);
      const listFile = join(work, "list.txt");
      writeFileSync(listFile, segs.map((s, i) => (keep[i] ? `file '${s.path}'\n` : "")).join(""));
      await this.runFfmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-an", "-movflags", "+faststart", "-f", "mp4", finalPath], procs, mask, check);
      check();
      const size = (await stat(finalPath)).size;
      stats.blocked = blocked;
      stats.blockedHosts = [...blockedHosts.entries()].map(([h, c]) => `${h} x${c}`);
      stats.allowedRequests = allowedRequests;
      stats.totalMs = Math.round(performance.now() - started);
      this.lastRun = stats;
      this.log.log(mask(`render ${jobId}: ${stats.keptFrames} of ${stats.frames} frames kept, ${stats.scenes.length} scenes, ${size} bytes, ready in ${stats.readyMs} ms, ${stats.totalMs} ms in all, ${blocked} blocked request(s)${blocked ? ` (${stats.blockedHosts.join(", ")})` : ""}`));
      return { path: finalPath, contentType: "video/mp4", bytes: size };
    } catch (e) {
      stats.blocked = blocked;
      stats.blockedHosts = [...blockedHosts.entries()].map(([h, c]) => `${h} x${c}`);
      stats.allowedRequests = allowedRequests;
      stats.totalMs = Math.round(performance.now() - started);
      this.lastRun = stats;
      await rm(finalPath, { force: true });
      const aborted = stopped || signal?.aborted || e instanceof RenderStop;
      if (!aborted && !failures.length) await sleep(200);
      const words = aborted ? "render aborted" : mask(failures[0] ?? (e instanceof Error ? e.message : String(e))).slice(0, 400);
      this.log.warn(`render ${jobId} failed: ${words}`);
      /* no `cause`: the original error may hold the token; only the masked words travel */
      // eslint-disable-next-line preserve-caught-error
      throw new Error(words);
    } finally {
      signal?.removeEventListener("abort", onAbort);
      killAll();
      await Promise.race([browser?.close().catch(() => undefined), sleep(500)]);
      killAll();
      for (const p of procs) if (p.exitCode === null && p.signalCode === null) await Promise.race([once(p, "exit"), sleep(3000)]);
      if (chromium?.pid) await groupGone(chromium.pid);
      await rm(work, { recursive: true, force: true });
    }
  }

  private openSegment(path: string, input: RenderRequest, procs: Set<ChildProcess>, mask: (t: string) => string, die: (e: Error) => void): Segment {
    const fps = this.o.fps;
    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bicubic,format=yuv420p", "-r", String(fps),
      "-c:v", "libx264", "-profile:v", "high", "-preset", this.o.preset, "-crf", String(this.o.crf), "-maxrate", `${this.o.maxKbps}k`, "-bufsize", `${this.o.maxKbps * 2}k`,
      "-threads", "2", "-g", String(fps * 2), "-pix_fmt", "yuv420p", "-an", "-f", "mpegts", path,
    ];
    const p = spawn(this.ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
    procs.add(p);
    if (p.pid) this.o.onSpawn?.("ffmpeg", p.pid);
    let err = "";
    p.stderr?.on("data", (d: Buffer) => {
      if (err.length < 800) err += d.toString();
    });
    let failed: Error | null = null;
    p.stdin?.on("error", (e) => {
      failed ??= new Error(`ffmpeg stopped taking frames (${(e as NodeJS.ErrnoException).code ?? "pipe"})`);
    });
    let finishing = false;
    const exited = new Promise<number | null>((resolve) => p.once("exit", (code, sig) => resolve(sig ? null : code)));
    void exited.then((code) => {
      if (!finishing) die(new Error(mask(`ffmpeg stopped early (${code === null ? "killed" : `exit ${code}`}): ${err.trim().slice(0, 200)}`)));
    });
    void input;
    let done: Promise<void> | null = null;
    const seg: Segment = {
      path,
      frames: 0,
      async write(buf: Buffer): Promise<void> {
        if (failed) throw failed;
        if (p.exitCode !== null || p.signalCode !== null) throw new Error(mask(`ffmpeg stopped early: ${err.trim().slice(0, 200)}`));
        if (!(p.stdin as NodeJS.WritableStream).write(buf)) await Promise.race([once(p.stdin as NodeJS.WritableStream, "drain"), exited]);
        seg.frames++;
      },
      finish(): Promise<void> {
        return (done ??= (async () => {
          finishing = true;
          p.stdin?.end();
          const code = await exited;
          if (code !== 0) throw new Error(mask(`ffmpeg failed${code === null ? " (killed)" : ` (exit ${code})`}: ${err.trim().slice(0, 200)}`));
        })());
      },
    };
    return seg;
  }

  private async runFfmpeg(argv: string[], procs: Set<ChildProcess>, mask: (t: string) => string, check: () => void): Promise<void> {
    const p = spawn(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["ignore", "ignore", "pipe"] });
    procs.add(p);
    if (p.pid) this.o.onSpawn?.("ffmpeg", p.pid);
    let err = "";
    p.stderr?.on("data", (d: Buffer) => {
      if (err.length < 800) err += d.toString();
    });
    const code = await new Promise<number | null>((resolve) => p.once("exit", (c, s) => resolve(s ? null : c)));
    check();
    if (code !== 0) throw new Error(mask(`ffmpeg could not join the scenes (exit ${code}): ${err.trim().slice(0, 200)}`));
  }
}

interface Segment {
  path: string;
  frames: number;
  write(buf: Buffer): Promise<void>;
  finish(): Promise<void>;
}

/**
 * IK6a: which scenes to keep. The opening scenes (leading "opening" or "cover") and the ending (from the scene named "ending" on, or the last
 * scene) are always kept whole; while the total is over `limitFrames`, the whole middle scene nearest the middle goes first. Never a cut inside a scene.
 */
export function chooseScenes(names: readonly string[], frames: readonly number[], limitFrames: number): boolean[] {
  const n = names.length;
  const keep = names.map(() => true);
  let head = 0;
  while (head < n - 1 && (names[head] === "opening" || names[head] === "cover")) head++;
  head = Math.max(head, 1);
  let tail = names.findIndex((x, i) => i >= head && x === "ending");
  if (tail < 0) tail = n - 1;
  let total = frames.reduce((a, b) => a + b, 0);
  const middle: number[] = [];
  for (let i = head; i < tail; i++) middle.push(i);
  const centre = (head + tail - 1) / 2;
  middle.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
  for (const i of middle) {
    if (total <= limitFrames) break;
    keep[i] = false;
    total -= frames[i] ?? 0;
  }
  return keep;
}

function killPid(p: ChildProcess, group: boolean): void {
  if (p.pid === undefined || p.exitCode !== null || p.signalCode !== null) return;
  try {
    if (group) process.kill(-p.pid, "SIGKILL");
    else process.kill(p.pid, "SIGKILL");
  } catch {
    try {
      p.kill("SIGKILL");
    } catch {
      /* gone */
    }
  }
}

/** Waits (a few seconds at most) until no process of the browser's group is left, so a caller sees a clean process table. */
async function groupGone(pid: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(-pid, 0);
    } catch {
      return;
    }
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      return;
    }
    await sleep(30);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, words: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([p, new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error(`${words} within ${Math.round(ms / 1000)} s`)), ms)))]).finally(() => clearTimeout(timer));
}
