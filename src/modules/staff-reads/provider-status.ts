import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { AiWritingPort } from "../../common/ports/ai.port";
import { Clock } from "../../common/ports/clock.port";
import { EmailPort } from "../../common/ports/email.port";
import { ImageSizesPort } from "../../common/ports/image-sizes.port";
import { MediaCleanPort } from "../../common/ports/media-clean.port";
import { PaymentsPort } from "../../common/ports/payments.port";
import { PayoutProviderPort } from "../../common/ports/payout-provider.port";
import { type PortPing, pingError } from "../../common/ports/ping";
import { RefundProviderPort } from "../../common/ports/refund-provider.port";
import { UploadScreeningPort } from "../../common/ports/screening.port";
import { StoragePort } from "../../common/ports/storage.port";
import { PrismaService } from "../../common/db/prisma.service";
import { VideoRenderer } from "../render-jobs/video-renderer";

/** How long a ping answer stands before the provider is asked again (FB4). */
export const PING_CACHE_MS = 60_000;

type PortName = "payments" | "refunds" | "payouts" | "email" | "storage" | "ai" | "screening" | "video" | "imageSizes" | "mediaClean";
const LABEL: Record<PortName, string> = { payments: "Payments", refunds: "Refunds", payouts: "Payouts", email: "Email", storage: "Storage", ai: "AI", screening: "Screening", video: "Video", imageSizes: "Image sizing", mediaClean: "Voice and video cleaning" };
/** The ports behind each line of the staff Providers read: Paystack is three ports (take money, refund, pay out), the rest one each. */
const PORTS_OF: Record<string, PortName[]> = {
  payments: ["payments", "refunds", "payouts"],
  email: ["email"],
  ai: ["ai"],
  // X22: image sizing is part of the Storage line (it reads and writes the same bucket); a sizing that cannot run reads as not connected.
  // IM3: so is the voice and video cleaner (ffmpeg and ffprobe): with either missing the line says so, and uploads of those kinds are refused in words
  storage: ["storage", "imageSizes", "mediaClean"],
  screening: ["screening"],
  video: ["video"],
};

export interface ProviderState {
  connected: boolean;
  line: string;
}

/**
 * FB4: what the staff Providers read says about each provider. "Connected" only when the real adapters are configured (the app runs
 * on PROVIDERS=live) AND every port behind it answered its ping ok just now; never from old evidence rows. Each port is pinged at
 * most once a minute (the answer, ok or error, is kept for PING_CACHE_MS on the clock port; two asks at once share one ping). No key or
 * secret is in the answer or in any log: a port's error has already been cut short and blanked by the port.
 */
@Injectable()
export class ProviderStatus {
  private readonly kept = new Map<PortName, { at: number; answer: Promise<PortPing> }>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
    private readonly payments: PaymentsPort,
    private readonly refunds: RefundProviderPort,
    private readonly payouts: PayoutProviderPort,
    private readonly email: EmailPort,
    private readonly storage: StoragePort,
    private readonly ai: AiWritingPort,
    private readonly screening: UploadScreeningPort,
    private readonly video: VideoRenderer,
    private readonly imageSizes: ImageSizesPort,
    private readonly mediaClean?: MediaCleanPort,
    @Optional() private readonly db?: PrismaService,
  ) {}

  private port(name: PortName): { ping(): Promise<PortPing> } | undefined {
    return { payments: this.payments, refunds: this.refunds, payouts: this.payouts, email: this.email, storage: this.storage, ai: this.ai, screening: this.screening, video: this.video, imageSizes: this.imageSizes, mediaClean: this.mediaClean }[name];
  }

  private ping(name: PortName): Promise<PortPing> {
    const now = this.clock.now().getTime();
    const hit = this.kept.get(name);
    if (hit && now - hit.at >= 0 && now - hit.at < PING_CACHE_MS) return hit.answer;
    const answer = Promise.resolve()
      .then(() => (this.port(name) as { ping(): Promise<PortPing> }).ping())
      .catch((e: unknown) => pingError(e));
    this.kept.set(name, { at: now, answer });
    return answer;
  }

  /**
   * R6: the video maker's line: working, or WHICH part is missing; then the last render's time, length and result. The cheap check only (no browser starts on a read:
   * the programs and the web address were checked at boot and the web is asked for its clock script); `deep` starts the browser (the renderer limits it to once in ten minutes).
   */
  private async videoState(deep: boolean): Promise<ProviderState> {
    const d = this.video.describe();
    let connected = false;
    let head: string;
    if (!d.real) {
      head = `The video maker is off. ${d.missing.length ? `Missing: ${d.missing.join("; ")}.` : ""} The portrait video stays unsold.`.replace("  ", " ");
      if (this.env.PROVIDERS !== "live" && !d.missing.length) head = "Running on stand-ins, so nothing real has been called.";
    } else {
      const a = deep ? await this.video.deepCheck().catch((e: unknown) => pingError(e)) : await this.ping("video");
      if (a.state === "error") head = `The video maker is not working: ${a.error}`;
      else {
        connected = this.env.PROVIDERS === "live";
        head = `The video maker is working${deep ? " (the browser was started just now)" : " (programs and web address checked; the browser was not started for this read)"}.`;
      }
    }
    let last = "";
    if (this.db) {
      const r = await this.db.renderJob.findFirst({ where: { status: { in: ["done", "failed"] } }, orderBy: { updatedAt: "desc" }, select: { status: true, updatedAt: true, seconds: true, videoMs: true, tookMs: true, failureWords: true } }).catch(() => null);
      if (r) {
        const len = r.videoMs ? `${(r.videoMs / 1000).toFixed(1)} s long` : `up to ${r.seconds} s`;
        last = ` Last video: ${r.updatedAt.toISOString()}, ${len}, ${r.status === "done" ? "made" : "failed"}${r.tookMs ? ` in ${Math.round(r.tookMs / 1000)} s` : ""}.`;
      } else last = " No video has been made yet.";
    }
    return { connected, line: `${head}${last}` };
  }

  async state(key: string, deep = false): Promise<ProviderState> {
    if (key === "video") return this.videoState(deep);
    const names = PORTS_OF[key]?.filter((n) => this.port(n));
    if (!names?.length) return { connected: false, line: "Not checked from here." };
    // stand-ins answer for themselves and never leave the process: ask them too, so the read is the same in every mode
    const answers = await Promise.all(names.map(async (n) => ({ n, a: await this.ping(n) })));
    if (this.env.PROVIDERS !== "live" || answers.some((x) => x.a.state === "stand-in")) return { connected: false, line: "Running on stand-ins, so nothing real has been called." };
    const bad = answers.filter((x): x is { n: PortName; a: Extract<PortPing, { state: "error" }> } => x.a.state === "error");
    if (bad.length) return { connected: false, line: `The provider did not answer a check just now. ${bad.map((x) => `${names.length > 1 ? `${LABEL[x.n]}: ` : ""}${x.a.error}`).join(" ")}` };
    return { connected: true, line: "The provider answered a check just now." };
  }
}
