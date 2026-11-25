import { Logger } from "@nestjs/common";
import type { PrismaService } from "../../common/db/prisma.service";
import type { Env } from "../../common/env/env";
import type { Clock } from "../../common/ports/clock.port";
import { ChromiumVideoRenderer, chromiumRendererOptionsFromEnv } from "./chromium-video-renderer";
import { NoVideoRenderer, VideoRenderer, videoRendererFor } from "./video-renderer";

type BindEnv = Parameters<typeof videoRendererFor>[0] &
  Pick<Env, "RENDER_TOKEN_SECRET"> & { RENDER_ADAPTER?: string; RENDER_WEB_ORIGIN?: string };

/**
 * R6 (IK3, IK6): which video maker the server has.
 *  - PROVIDERS=live: the real recorder when it can work, else the "not configured" one and the server still boots (everything whose price holds the video stays unsold).
 *  - PROVIDERS=standin: the stand-in, unless RENDER_ADAPTER=chromium asks for the real recorder (proofs with the other providers on stand-ins; never needed in production, where live picks it).
 * "Can work" is checked ONCE, here, at boot: the web address, the token secret, ffmpeg and ffprobe that run, a Chromium that starts, playwright-core. The answer is said in the log in words.
 */
export async function bindVideoRenderer(env: BindEnv, db: Pick<PrismaService, "renderJob">, clock: Clock, raw: NodeJS.ProcessEnv = process.env): Promise<VideoRenderer> {
  const log = new Logger("video-maker");
  const live = env.PROVIDERS === "live";
  if (!live && env.RENDER_ADAPTER !== "chromium") return videoRendererFor(env, db);
  if (live && env.RENDER_ADAPTER === "chromium") log.log("RENDER_ADAPTER=chromium changes nothing with live providers: the real video maker is chosen when it can work.");
  const missing: string[] = [];
  if (!env.RENDER_WEB_ORIGIN) missing.push("RENDER_WEB_ORIGIN is not set (the web address the video maker opens)");
  if (!env.RENDER_TOKEN_SECRET) missing.push("RENDER_TOKEN_SECRET is not set (the secret that hashes the render token)");
  const options = chromiumRendererOptionsFromEnv({ ...raw, ...(env as unknown as Record<string, string>) });
  let real: ChromiumVideoRenderer | null = null;
  if (options) {
    real = new ChromiumVideoRenderer({ ...options, clock });
    const why = await real.probe();
    if (why) missing.push(why);
  }
  if (missing.length || !real) {
    log.warn(`The video maker is OFF: ${missing.join("; ")}. Everything whose price holds the portrait video stays unsold until it works.`);
    return new NoVideoRenderer(missing);
  }
  log.log("The video maker is ON: the web address and the render secret are set, ffmpeg and ffprobe run, Chromium starts, playwright-core loads. Videos are made by the real recorder.");
  return real;
}
