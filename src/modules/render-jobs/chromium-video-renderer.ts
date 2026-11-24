import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { accessSync, constants, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { connect as netConnect, isIP } from "node:net";
import type { Duplex } from "node:stream";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
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
 * R5 round 2 (IK6g): the page's clock stays at exactly 0 until the page says ready (only work already due is flushed: step(0)); the browser is driven
 * through a private pipe (no debugging port: Playwright launches it with --remote-debugging-pipe, so its death follows ours); the proxy asks for a
 * secret made for this one render; a picture or font that never completes fails the render inside `assetTimeoutMs`.
 *
 * How the pieces are chosen (the brief's decisions):
 *  - The stepped clock is the WEB's page script (IK6e). The API holds no copy and runs none of it: each render fetches RENDER_WEB_ORIGIN/render-clock.js
 *    (a JavaScript type, at most 256 KB, inside the allow-list, no redirect) and puts the TEXT into the browser's first script (the frame loop here is
 *    this file's own; nothing fetched from the website is imported or run by node). RENDER_CLOCK_PATH names a file of that text instead (tests);
 *    RENDER_CLOCK_SHA256 (optional) pins the text. BEFORE recording, a self-check in a blank page proves the clock: k steps move Date.now and
 *    performance.now by exactly k steps and fire the frame callback k times, and it is frozen at the given start; else "clock drift" and nothing is recorded.
 *  - The clock is frozen from the first script at virtual time 0 and at a wall time the request gives (epochMs; default the render's start to the second): IK6f.
 *  - Egress (IK6d). Chromium runs through a small proxy this adapter owns (--proxy-server, loopback not bypassed), the one place every TCP request of every
 *    kind (page, frame, worker, fetch, XHR, EventSource, beacon, css, redirect, ws/wss) must pass: it allows only host AND port from the allow-list (an
 *    entry with no port = the scheme's own port), never the metadata address in any written form or a name that resolves to it, and refuses a plain-text
 *    tunnel (a ws:// handshake) outright. WebSocket is closed at the browser (context.routeWebSocket: never connects, counted) and Worker/SharedWorker do not exist
 *    in the page (a worker has its own WebSocket that no route sees); WebRTC is closed at the browser's own switch (--webrtc-ip-handling-policy=
 *    disable_non_proxied_udp: no STUN or candidate leaves) and WebTransport/QUIC cannot pass an HTTP proxy (--disable-quic). The route (context.route) stays as the second gate and the counter.
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
  /** A file holding the clock's page script text, used instead of fetching RENDER_WEB_ORIGIN/render-clock.js (tests; RENDER_CLOCK_PATH). */
  clockPath?: string;
  /** When set, the clock script's text must hash to this (hex sha256), else the render fails loudly (optional: IK6e). */
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
  /** The longest a picture, font, style sheet or clip may stay unfinished (real milliseconds; default 30 s): then the render FAILS in words, never a video without it. */
  assetTimeoutMs?: number;
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
  /** Calls the browser makes for itself (Google update, safe browsing, connectivity): refused at the proxy and kept OUT of `blocked`. */
  browserOwnCalls: number;
  allowedRequests: number;
  readyMs: number;
  totalMs: number;
  /** What the clock self-check cost, in real milliseconds (fetch excluded). */
  clockCheckMs: number;
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

/** A host as the browser's own parser reads it: IPv4 in decimal, hex and octal forms become dotted, IPv6 is compressed and lower case. */
function normHost(h: string): string {
  let x = h.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  try {
    x = new URL(`http://${x.includes(":") ? `[${x}]` : x}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    /* keep as written */
  }
  return x;
}

/** The cloud metadata address in every written form: dotted, decimal, hex, octal, IPv4-mapped IPv6 (dotted or hex groups), fd00:ec2::254, and the link-local ranges. */
function isMetadata(host: string): boolean {
  const x = normHost(host);
  if (META_HOSTS.includes(x) || /^169\.254\./.test(x) || x.startsWith("fe80:")) return true;
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(x);
  if (m) {
    const a = parseInt(m[1], 16);
    const b = parseInt(m[2], 16);
    return isMetadata(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
  }
  return false;
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

/**
 * IK6d: a host and port are allowed when an entry matches BOTH. An entry with no port means the scheme's own port only (`own`: 443 for https and wss, 80 for
 * http and ws); an entry "*.suffix" matches subdomains, with or without a port the same way. The metadata address never is, whatever the list says.
 */
export function hostPortAllowed(hostname: string, port: number, allowed: readonly string[], own: readonly number[]): boolean {
  const h = normHost(hostname);
  if (isMetadata(h)) return false;
  return allowed.some((raw) => {
    const m = /^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(raw.trim().toLowerCase());
    if (!m) return false;
    const entry = m[1].startsWith("*.") ? m[1] : normHost(m[1]);
    const hostOk = entry.startsWith("*.") ? h.endsWith(entry.slice(1)) && h.length > entry.length - 1 : entry === h;
    return hostOk && (m[2] !== undefined ? Number(m[2]) === port : own.includes(port));
  });
}

/** A request is allowed when its host and port are listed (see hostPortAllowed); the metadata addresses never are. */
export function hostAllowed(url: string, allowed: readonly string[]): boolean {
  try {
    const u = new URL(url);
    const scheme = u.protocol.replace(":", "");
    const own = scheme === "https" || scheme === "wss" ? 443 : scheme === "http" || scheme === "ws" ? 80 : 0;
    return hostPortAllowed(u.hostname, u.port ? Number(u.port) : own, allowed, [own]);
  } catch {
    return false;
  }
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

/** Hosts the browser itself calls for its own business (update, safe browsing, connectivity): not the page's, so not counted as blocked. */
const BROWSER_OWN = /(^|\.)(google\.com|googleapis\.com|gvt1\.com|gvt2\.com|googleusercontent\.com)(:\d+)?$/i;
const CLOCK_CAP = 256 * 1024;
const PROXY_USER = "render";
const PLAIN_HTTP = /^(GET|POST|PUT|HEAD|DELETE|OPTIONS|PATCH|TRACE|CONNECT) /;

/**
 * The small proxy the adapter owns (IK6d): every TCP request Chromium makes passes here. Allowed: host AND port from the list. Refused: everything else, the
 * metadata address in any form (also when a name resolves to it), and a plain-text tunnel (the handshake of a ws:// WebSocket). Nothing here logs an address:
 * it counts by host.
 */
export class EgressProxy {
  private readonly server = createHttpServer();
  private readonly sockets = new Set<Duplex>();
  port = 0;

  /** M5: with a secret the proxy answers only a browser that was given it: anyone else gets 407 first, for a listed host and an unlisted one alike. */
  private readonly want: Buffer | null;

  constructor(
    private readonly allowed: readonly string[],
    private readonly onBlocked: (host: string) => void,
    secret?: string,
  ) {
    this.want = secret ? createHash("sha256").update(`Basic ${Buffer.from(`${PROXY_USER}:${secret}`).toString("base64")}`).digest() : null;
    this.server.on("connection", (s) => this.track(s));
    this.server.on("request", (rq, rs) => {
      if (!this.authorised(rq.headers["proxy-authorization"])) {
        rs.writeHead(407, { "proxy-authenticate": 'Basic realm="render"', connection: "close" }).end();
        return;
      }
      let u: URL | null = null;
      try {
        u = new URL(rq.url ?? "");
      } catch {
        /* not an absolute address */
      }
      if (!u || u.protocol !== "http:" || !hostAllowed(u.href, this.allowed)) {
        this.onBlocked(u?.host ?? "unknown");
        rs.writeHead(403, { connection: "close" }).end();
        return;
      }
      const target = u;
      void this.resolve(target.hostname).then((addr) => {
        if (!addr) {
          this.onBlocked(target.host);
          rs.writeHead(403, { connection: "close" }).end();
          return;
        }
        const headers = { ...rq.headers, host: target.host } as Record<string, string | string[] | undefined>;
        delete headers["proxy-connection"];
        delete headers["proxy-authorization"];
        const up = httpRequest({ host: addr, port: Number(target.port || 80), path: `${target.pathname}${target.search}`, method: rq.method, headers, agent: false }, (res) => {
          rs.writeHead(res.statusCode ?? 502, res.headers);
          res.pipe(rs);
        });
        up.on("error", () => (rs.headersSent ? rs.destroy() : rs.writeHead(502, { connection: "close" }).end()));
        rs.on("close", () => up.destroy());
        rq.pipe(up);
      });
    });
    this.server.on("connect", (rq, socket, head) => {
      this.track(socket);
      socket.on("error", () => undefined);
      if (!this.authorised(rq.headers["proxy-authorization"])) {
        socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="render"\r\nConnection: close\r\n\r\n');
        return;
      }
      const m = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(rq.url ?? "");
      const host = m?.[1].replace(/^\[|\]$/g, "") ?? "";
      const port = Number(m?.[2] ?? 0);
      if (!m || !hostPortAllowed(host, port, this.allowed, [80, 443])) {
        this.onBlocked(m ? `${host}:${port}` : "unknown");
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      void this.resolve(host).then((addr) => {
        if (!addr) {
          this.onBlocked(`${host}:${port}`);
          socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          return;
        }
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        const open = (first: Buffer): void => {
          if (PLAIN_HTTP.test(first.toString("latin1", 0, 8))) {
            this.onBlocked(`${host}:${port} (plain text tunnel)`);
            socket.destroy();
            return;
          }
          const up = netConnect(port, addr);
          this.track(up);
          up.on("error", () => socket.destroy());
          socket.on("close", () => up.destroy());
          up.on("close", () => socket.destroy());
          up.write(first);
          socket.pipe(up);
          up.pipe(socket);
        };
        if (head.length) open(head);
        else socket.once("data", open);
      });
    });
  }

  private authorised(header: string | undefined): boolean {
    if (!this.want) return true;
    return timingSafeEqual(createHash("sha256").update(header ?? "").digest(), this.want);
  }

  private track(s: Duplex): void {
    this.sockets.add(s);
    s.once("close", () => this.sockets.delete(s));
  }

  /** The address to connect to, or null when it is (or resolves to) the metadata address or the name has none. */
  private async resolve(hostname: string): Promise<string | null> {
    const h = hostname.replace(/^\[|\]$/g, "");
    if (isMetadata(h)) return null;
    if (isIP(h)) return h;
    try {
      const addr = (await lookup(h)).address;
      return isMetadata(addr) ? null : addr;
    } catch {
      return null;
    }
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.port = (this.server.address() as { port: number }).port;
    return this.port;
  }

  close(): void {
    for (const s of this.sockets) s.destroy();
    this.server.close();
  }
}

/** Words for a clock that is wrong; the render stops before any recording. */
const drift = (what: string): Error => new Error(`clock drift: ${what}`);

/** Reads the clock's page script: from the file RENDER_CLOCK_PATH names (tests), else from the web origin at /render-clock.js. Never imports or runs it. */
async function readClockText(o: { webOrigin: string; clockPath?: string }, allowed: readonly string[], signal?: AbortSignal): Promise<{ source: string; sha256: string }> {
  let bytes: Buffer;
  if (o.clockPath) {
    let size = -1;
    try {
      size = statSync(o.clockPath).size;
    } catch {
      /* said below */
    }
    if (size < 0) throw new Error("the clock file could not be read (RENDER_CLOCK_PATH)");
    if (size > CLOCK_CAP) throw drift("the clock file is bigger than 256 KB");
    try {
      bytes = readFileSync(o.clockPath);
    } catch {
      throw new Error("the clock file could not be read (RENDER_CLOCK_PATH)");
    }
  } else {
    const url = `${o.webOrigin.replace(/\/$/, "")}/render-clock.js`;
    if (!hostAllowed(url, allowed)) throw new Error("the clock script's address is not inside the allow-list (RENDER_ALLOWED_HOSTS)");
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]) });
    } catch {
      if (signal?.aborted) throw new RenderStop("render aborted");
      throw new Error("the clock script could not be fetched from the web origin (/render-clock.js)");
    }
    if (res.status !== 200) {
      void res.body?.cancel().catch(() => undefined);
      throw new Error(`the clock script could not be fetched (the web answered ${res.status}${res.status >= 300 && res.status < 400 ? ", a redirect is not followed" : ""})`);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/(java|ecma)script/i.test(type)) {
      void res.body?.cancel().catch(() => undefined);
      throw drift("the clock script is not served as JavaScript");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    for (;;) {
      const part = await reader?.read();
      if (!part || part.done) break;
      const piece = Buffer.from(part.value as Uint8Array);
      size += piece.length;
      if (size > CLOCK_CAP) {
        void reader?.cancel().catch(() => undefined);
        throw drift("the clock script is bigger than 256 KB");
      }
      chunks.push(piece);
    }
    bytes = Buffer.concat(chunks);
  }
  return { source: bytes.toString("utf8"), sha256: createHash("sha256").update(bytes).digest("hex") };
}

/* ---- the little part of Playwright this file touches ---- */
interface PwPage {
  on(ev: string, fn: (...a: any[]) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  goto(url: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
  /** An expression (or an async function call) run in the page. */
  evaluate<R>(expression: string): Promise<R>;
  mainFrame(): unknown;
  close(): Promise<void>;
}
interface PwRequestLike {
  resourceType(): string;
}
interface PwContext {
  route(match: string, h: (r: PwRoute) => unknown): Promise<void>;
  routeWebSocket(match: RegExp, h: (ws: { url(): string; close(): Promise<void> | void }) => unknown): Promise<void>;
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
  on(ev: string, fn: (...a: any[]) => void): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** The browser's own protocol session (over the same private pipe): used once, to learn the browser's process id. */
  newBrowserCDPSession(): Promise<{ send(m: string, p?: object): Promise<unknown> }>;
}
interface PwModule {
  /** `launch` starts the browser itself and talks to it over a private pipe (--remote-debugging-pipe): no port, no address, and the browser ends when the pipe closes. */
  chromium: { launch(o: object): Promise<PwBrowser> };
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
  private readonly o: Required<Pick<ChromiumRendererOptions, "fps" | "crf" | "maxKbps" | "preset" | "readyTimeoutMs" | "frameTimeoutMs" | "assetTimeoutMs">> & ChromiumRendererOptions;
  private readonly log: Pick<Logger, "log" | "warn" | "error">;
  /** The numbers of the newest finished (or failed) run, for a proof script and a spec; never holds the token. */
  lastRun: ChromiumRunStats | null = null;

  constructor(options: ChromiumRendererOptions) {
    super();
    this.o = { fps: 30, crf: 23, maxKbps: 1800, preset: "veryfast", readyTimeoutMs: 150_000, frameTimeoutMs: 60_000, assetTimeoutMs: 30_000, ...options };
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
      const sum = await readClockText(this.o, this.allowed);
      if (this.o.clockSha256 && sum.sha256 !== this.o.clockSha256) throw new Error("the web's clock script is not the one this renderer was pinned to");
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
    const epoch = Math.floor(input.epochMs ?? Math.floor(Date.now() / 1000) * 1000);
    if (!Number.isFinite(epoch)) throw new Error("the render's epochMs is not a number");
    const clock = await readClockText(this.o, this.allowed, signal).catch((e: Error) => {
      throw e instanceof RenderStop ? e : new Error(mask(e.message));
    });
    if (this.o.clockSha256 && clock.sha256 !== this.o.clockSha256) throw drift("the web's clock script is not the one this renderer was pinned to (RENDER_CLOCK_SHA256)");

    const root = this.o.tmpRoot ?? tmpdir();
    const stem = `${RENDER_TEMP_PREFIX}${jobId}-${randomUUID()}`;
    const work = join(root, `${stem}-work`);
    const finalPath = join(tmpdir(), `${stem}.mp4`);
    const procs = new Set<ChildProcess>();
    let chromiumPid = 0;
    let stopped = false;
    /* settles (rejects) the moment a child dies that should be alive, so no call waits out a time limit on a dead browser or encoder */
    let die: (e: Error) => void = () => undefined;
    const dead = new Promise<never>((_, reject) => {
      die = reject;
    });
    dead.catch(() => undefined);
    const guard = <T>(p: Promise<T>, words: string): Promise<T> => withTimeout(Promise.race([p, dead]), this.o.frameTimeoutMs, words);
    const killAll = (): void => {
      for (const p of procs) killPid(p, false);
      if (chromiumPid) {
        try {
          process.kill(-chromiumPid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    };
    const onAbort = (): void => {
      stopped = true;
      die(new RenderStop("render aborted"));
      killAll();
    };
    /* every wait of the start (the folder, Chromium's first line, the browser link, the page load) ends the moment a child dies or the job aborts */
    const early = <T>(p: Promise<T>): Promise<T> => Promise.race([p, dead]);
    /* what the page or a child did wrong, in the order it was seen: the first is the reason a job fails (a protocol error after it is only the echo) */
    const failures: string[] = [];
    const blockedHosts = new Map<string, number>();
    let blocked = 0;
    let allowedRequests = 0;
    const allowed = this.allowed;
    const stats: ChromiumRunStats = { jobId, frames: 0, keptFrames: 0, scenes: [], blocked: 0, blockedHosts: [], browserOwnCalls: 0, allowedRequests: 0, readyMs: 0, totalMs: 0, clockCheckMs: 0 };
    const check = (): void => {
      if (stopped || signal?.aborted) throw new RenderStop("render aborted");
    };
    let browser: PwBrowser | null = null;
    const countBlocked = (h: string): void => {
      blocked++;
      blockedHosts.set(h, (blockedHosts.get(h) ?? 0) + 1);
    };
    /* what the browser asks for by itself (update, safe browsing, connectivity) is refused at the proxy like any other host, but is not the page's and is not counted as blocked */
    const secret = randomBytes(24).toString("base64url");
    let ownCalls = 0;
    const proxy = new EgressProxy(allowed, (h) => (BROWSER_OWN.test(h) ? void ownCalls++ : countBlocked(h)), secret);
    const assetLimit = this.o.assetTimeoutMs;
    const pendingAssets = new Map<unknown, number>();
    let launching: Promise<PwBrowser> | null = null;
    try {
      if (signal?.aborted) throw new RenderStop("render aborted");
      signal?.addEventListener("abort", onAbort, { once: true });
      await mkdir(join(work, "profile"), { recursive: true, mode: 0o700 });
      check();

      /* Chromium: launched by the driver over a private pipe (--remote-debugging-pipe): no debugging port exists, the page's address is known to this process only,
         and when this process dies the pipe closes and the browser ends with it. All its traffic goes through our own proxy, which asks for this render's secret. */
      const proxyPort = await proxy.start();
      const hostRules = `MAP * ~NOTFOUND , ${allowed.filter((a) => !a.startsWith("*.")).map((a) => `EXCLUDE ${a.replace(/:\d+$/, "")}`).join(" , ")}`;
      const args = [
        "--no-first-run", "--disable-extensions", "--disable-sync", "--disable-default-apps", "--disable-domain-reliability", "--metrics-recording-only",
        "--safebrowsing-disable-auto-update", "--disable-component-update", "--force-color-profile=srgb",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required",
        `--host-resolver-rules=${hostRules}`, `--window-size=${input.width},${input.height}`, "--no-pings",
        "--webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-quic",
      ];
      const pw = loadPlaywright(this.o.playwrightModule);
      launching = pw.chromium.launch({
        executablePath: this.chromiumPath, headless: true, args, timeout: 30_000, env: { ...process.env, HOME: join(work, "profile") },
        handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
        proxy: { server: `http://127.0.0.1:${proxyPort}`, username: PROXY_USER, password: secret, bypass: "<-loopback>" },
      });
      launching.catch(() => undefined);
      browser = await early(launching);
      /* the browser's process id (it leads its own group): to end it by id, and to show it gone */
      const info = (await early((await early(browser.newBrowserCDPSession())).send("SystemInfo.getProcessInfo"))) as { processInfo?: { type: string; id: number }[] };
      chromiumPid = info.processInfo?.find((x) => x.type === "browser")?.id ?? 0;
      if (chromiumPid) this.o.onSpawn?.("chromium", chromiumPid);
      let chromiumDied = "";
      browser.on("disconnected", () => {
        if (stopped || chromiumDied) return;
        chromiumDied = "Chromium stopped (the pipe closed)";
        die(new Error(chromiumDied));
      });
      check();
      const ctx = await early(browser.newContext({
        viewport: { width: input.width, height: input.height }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "no-preference",
        serviceWorkers: "block", acceptDownloads: false, permissions: [], locale: "en-US", javaScriptEnabled: true,
      }));
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
        countBlocked(hostOf(url)?.host ?? "unknown");
        await route.abort("blockedbyclient").catch(() => undefined);
      });
      /* a WebSocket never connects, whatever its address (IK6d): it is answered and closed here, in the browser, and counted */
      await ctx.routeWebSocket(/.*/, (ws) => {
        countBlocked(`${hostOf(ws.url().replace(/^ws/, "http"))?.host ?? "unknown"} (websocket)`);
        void Promise.resolve(ws.close()).catch(() => undefined);
      });
      let pages = 0;
      ctx.on("page", (p: PwPage & { close?: () => Promise<void> }) => {
        /* the clock's blank page and the render page are the two; any other page (a pop-up) is closed at once */
        if (pages > 1) void p.close?.().catch(() => undefined);
        pages++;
      });
      /* the clock, frozen from the very first script at virtual time 0 and the given wall time (IK6f); a worker has a WebSocket no route sees, so no worker exists */
      await early(ctx.addInitScript(`${clock.source}\n;window.__vt.freeze({ epoch: ${epoch} });\n;for (const n of ["Worker", "SharedWorker"]) { try { Object.defineProperty(window, n, { value: undefined, configurable: false, writable: false }); } catch (e) {} }`));
      const blank = await early(ctx.newPage());
      const checkBegan = performance.now();
      try {
        await guard(blank.goto("about:blank", { waitUntil: "load", timeout: 15_000 }), "the blank page did not load");
        const read = `({ p: performance.now(), d: Date.now(), raf: window.__chk ? window.__chk.raf : -1 })`;
        const a = await guard(blank.evaluate<{ p: number; d: number } | null>(`(() => { const x = window.__vt; if (!x || typeof x.step !== "function" || typeof x.freeze !== "function") return null; window.__chk = { raf: 0 }; const f = () => { window.__chk.raf++; requestAnimationFrame(f); }; requestAnimationFrame(f); return { p: performance.now(), d: Date.now() }; })()`), "the clock check did not answer");
        if (!a) throw drift("the page script does not define the stepped clock (window.__vt)");
        if (a.p !== 0 || a.d !== epoch) throw drift(`it did not start frozen at virtual time 0 and the given wall time (read ${a.p} ms and ${a.d})`);
        await sleep(120);
        const b = await guard(blank.evaluate<{ p: number; d: number; raf: number }>(read), "the clock check did not answer");
        if (b.p !== a.p || b.d !== a.d || b.raf !== 0) throw drift("it does not stay frozen: time moved by itself");
        const k = 6;
        const step = 1000 / this.o.fps;
        const c = await guard(blank.evaluate<{ p: number; d: number; raf: number }>(`(async () => { for (let i = 0; i < ${k}; i++) await window.__vt.step(${step}); return ${read}; })()`), "the clock check did not answer a step");
        if (Math.abs(c.p - b.p - k * step) > 1e-6) throw drift(`${k} steps moved performance.now by ${Math.round((c.p - b.p) * 1000) / 1000} ms, not ${Math.round(k * step * 1000) / 1000}`);
        if (Math.abs(c.d - b.d - k * step) > 1) throw drift(`${k} steps moved Date.now by ${c.d - b.d} ms, not ${Math.round(k * step)}`);
        if (c.raf !== k) throw drift(`the frame callback fired ${c.raf} times for ${k} steps`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("clock drift")) throw e;
        if (stopped || signal?.aborted || chromiumDied) throw e;
        throw drift(`the check could not run (${mask(String((e as Error)?.message ?? e)).slice(0, 120)})`);
      } finally {
        /* on an abort or a dead browser there is nothing to close: never wait on it */
        if (!stopped && !chromiumDied) await Promise.race([blank.close().catch(() => undefined), sleep(2000)]);
      }
      stats.clockCheckMs = Math.round(performance.now() - checkBegan);
      const page = await early(ctx.newPage());
      const pageUrl = `${this.o.webOrigin.replace(/\/$/, "")}/render/${encodeURIComponent(token)}`;
      let loaded = false;
      page.on("pageerror", (e: Error) => fail(`the render page threw: ${mask(String(e?.message ?? e)).slice(0, 200)}`));
      page.on("crash", () => fail("the render page crashed"));
      page.on("framenavigated", (f: { url(): string }) => {
        if (f !== page.mainFrame() || !loaded) return;
        /* any other address, on this host or another, is a navigation away (a move inside the same page, a hash or a query, is not) */
        const at = hostOf(f.url());
        if (!at || at.host !== hostOf(pageUrl)?.host || new URL(f.url()).pathname !== new URL(pageUrl).pathname) fail("the render page navigated away");
      });
      page.on("download", () => fail("the render page tried to download a file"));
      page.on("dialog", (d: { dismiss(): Promise<void> }) => void d.dismiss().catch(() => undefined));
      const bad = (): void => {
        check();
        if (chromiumDied) throw new Error(chromiumDied);
        if (failures.length) throw new Error(failures[0]);
      };

      await early(page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 }));
      loaded = true;
      const readyBegan = performance.now();
      /* a picture, font, style sheet or clip that stays unfinished past the limit fails the render in words (M4): never a video without it */
      page.on("request", (r: PwRequestLike) => {
        if (["image", "font", "stylesheet", "media"].includes(r.resourceType())) pendingAssets.set(r, performance.now());
      });
      const done1 = (r: PwRequestLike): void => void pendingAssets.delete(r);
      page.on("requestfinished", done1);
      page.on("requestfailed", done1);
      const stuckWords = `a picture or a font did not finish loading within ${Math.round(assetLimit / 1000)} s`;
      const stuck = (): boolean => [...pendingAssets.values()].some((t) => performance.now() - t > assetLimit);
      /* IK6g: nothing plays before the recording starts. The page's clock stays at exactly 0 until it says ready; real time (the network, decoding, the browser's own work) goes on.
         Only what is already due is flushed, with a step of 0: zero-delay timers, frame callbacks at time 0, promises. */
      for (;;) {
        bad();
        const s = await guard(page.evaluate<{ ready: boolean; error: string }>(`({ ready: !!window.__render?.ready, error: window.__render?.error ?? "" })`), "the page did not answer");
        if (s.error) throw new Error(mask(`the render page said: ${s.error}`).slice(0, 300));
        if (s.ready) break;
        if (stuck()) throw new Error(stuckWords);
        if (performance.now() - readyBegan > this.o.readyTimeoutMs) throw new Error(`the render page was never ready within ${Math.round(this.o.readyTimeoutMs / 1000)} s`);
        await guard(page.evaluate("window.__vt.step(0)"), "the page did not answer a step");
        await sleep(50);
      }
      stats.readyMs = Math.round(performance.now() - readyBegan);
      /* IK6f: the page's fonts and pictures load on real time, not stepped time, so the first frame waits for them (a fallback font in one render and the real one in another would differ):
         wait, in real time and without stepping, until the fonts are loaded and every picture is complete, twice in a row; one that does not within the limit FAILS the render (M4) */
      for (let settled = 0, began = performance.now(); settled < 2; ) {
        bad();
        if (performance.now() - began > assetLimit || stuck()) throw new Error(stuckWords);
        const st = await guard(page.evaluate<boolean>(`(document.fonts ? document.fonts.status === "loaded" : true) && [...document.images].every((i) => i.complete)`), "the page did not answer");
        settled = st ? settled + 1 : 0;
        await sleep(st ? 60 : 100);
      }
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
      const shoot = async (): Promise<string> => (await guard(cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, optimizeForSpeed: true }), "a frame never came")).data;
      const frameOf = async (i: number, data?: string): Promise<void> => {
        bad();
        const shot = data ?? (await shoot());
        const seg = segment(i);
        await seg.write(Buffer.from(shot, "base64"));
        stats.frames++;
      };
      let scene = 0;
      /* frame 0 is the wish's first moment as the page drew it at ready: what the page painted at ready may not be on the screen at the first shot, so shoot until two shots in a row are the same (at most 8) */
      let first = await shoot();
      for (let k = 0; k < 8; k++) {
        await sleep(40);
        bad();
        const again = await shoot();
        const same = again === first;
        first = again;
        if (same) break;
      }
      await frameOf(0, first);
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
      stats.browserOwnCalls = ownCalls;
      stats.blockedHosts = [...blockedHosts.entries()].map(([h, c]) => `${h} x${c}`);
      stats.allowedRequests = allowedRequests;
      stats.totalMs = Math.round(performance.now() - started);
      this.lastRun = stats;
      this.log.log(mask(`render ${jobId}: ${stats.keptFrames} of ${stats.frames} frames kept, ${stats.scenes.length} scenes, ${size} bytes, ready in ${stats.readyMs} ms, ${stats.totalMs} ms in all, ${blocked} blocked request(s)${blocked ? ` (${stats.blockedHosts.join(", ")})` : ""}`));
      return { path: finalPath, contentType: "video/mp4", bytes: size };
    } catch (e) {
      stats.blocked = blocked;
      stats.browserOwnCalls = ownCalls;
      stats.blockedHosts = [...blockedHosts.entries()].map(([h, c]) => `${h} x${c}`);
      stats.allowedRequests = allowedRequests;
      stats.totalMs = Math.round(performance.now() - started);
      this.lastRun = stats;
      await rm(finalPath, { force: true });
      const aborted = stopped || signal?.aborted || e instanceof RenderStop;
      if (!aborted && !failures.length) await sleep(200);
      const raw = failures[0] ?? (e instanceof Error ? e.message : String(e));
      const words = aborted ? "render aborted" : /Execution context was destroyed|frame was detached/i.test(raw) ? "the render page navigated away" : plainWords(mask(raw)).slice(0, 400);
      this.log.warn(`render ${jobId} failed: ${words}`);
      /* no `cause`: the original error may hold the token; only the masked words travel */
      // eslint-disable-next-line preserve-caught-error
      throw new Error(words);
    } finally {
      signal?.removeEventListener("abort", onAbort);
      proxy.close();
      killAll();
      /* an abort during the browser's start: the launch may still finish, and what it starts is ours to end (never a browser left behind) */
      if (launching && !chromiumPid) {
        await Promise.race([
          launching.then((b) => b.close()).catch(() => undefined),
          sleep(3000),
        ]);
      }
      await Promise.race([browser?.close().catch(() => undefined), sleep(500)]);
      killAll();
      for (const p of procs) if (p.exitCode === null && p.signalCode === null) await Promise.race([once(p, "exit"), sleep(3000)]);
      if (chromiumPid) await groupGone(chromiumPid);
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
      /* an encoder that dies while it is still taking frames, or while it flushes its scene, fails the render at once (L7): not at the end of play */
      if (!finishing || code !== 0) die(new Error(mask(`ffmpeg ${finishing ? "failed" : "stopped early"} (${code === null ? "killed" : `exit ${code}`}): ${err.trim().slice(0, 200)}`)));
    });
    void input;
    let done: Promise<void> | null = null;
    const seg: Segment = {
      path,
      frames: 0,
      async write(buf: Buffer): Promise<void> {
        if (failed) throw failed;
        if (p.exitCode !== null || p.signalCode !== null) throw new Error(mask(`ffmpeg stopped early: ${err.trim().slice(0, 200)}`));
        if (!(p.stdin as NodeJS.WritableStream).write(buf)) await Promise.race([once(p.stdin as NodeJS.WritableStream, "drain").catch(() => { throw new Error("ffmpeg stopped taking frames"); }), exited]);
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
/** The raw words of a broken pipe or a closed browser, in plain ones (L). */
export function plainWords(raw: string): string {
  if (/\b(EPIPE|ERR_STREAM_DESTROYED|ERR_STREAM_WRITE_AFTER_END|write after end)\b/.test(raw)) return "ffmpeg stopped taking frames";
  if (/Target (page|closed)|(browser|context|page) has been closed|browser has disconnected|Connection closed/i.test(raw)) return "Chromium stopped";
  return raw;
}
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

/** The live (not zombie) processes of one process group, from /proc; null where /proc is not there. A zombie waits only for its parent to be reaped by init: it is not a process left behind. */
async function liveGroup(pgid: number): Promise<number[] | null> {
  let names: string[];
  try {
    names = await readdir("/proc");
  } catch {
    return null;
  }
  const out: number[] = [];
  for (const d of names) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = await readFile(`/proc/${d}/stat`, "utf8");
      const rest = st.slice(st.lastIndexOf(")") + 2).split(" ");
      if (Number(rest[2]) === pgid && rest[0] !== "Z") out.push(Number(d));
    } catch {
      /* gone while we looked */
    }
  }
  return out;
}

/** Waits (a few seconds at most) until no live process of the browser's group is left, so a caller sees a clean process table. */
async function groupGone(pid: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const live = await liveGroup(pid);
    if (live === null) {
      try {
        process.kill(-pid, 0);
      } catch {
        return;
      }
    } else if (live.length === 0) return;
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
