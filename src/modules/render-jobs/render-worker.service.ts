import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import type { Env } from "../../common/env/env";
import { ENV } from "../../common/env/env.module";
import { Clock } from "../../common/ports/clock.port";
import { JobsService } from "../jobs/jobs.service";
import { RENDER_JOB_KIND, RenderJobsService } from "./render-jobs.service";
import { sweepRenderLeftovers } from "./render-leftovers";

/** How often the loop looks for a render to take (milliseconds), and how often it sweeps leftovers. */
export const RENDER_POLL_MS = 2000;
export const RENDER_SWEEP_MS = 3_600_000;

/**
 * R6 (IK6, the plan's note): the video maker's own loop. A render never runs inside the jobs tick (which is serial: a 20-minute render would hold every other job):
 * this loop claims render jobs itself, at most RENDER_CONCURRENCY at once, and does not wait for them. PROCESS_ROLE all and render-worker run it; web does not.
 * At its start and once an hour it releases the rows of dead workers of this machine and sweeps what they left (fw-render-* files, work and profile folders,
 * a browser or encoder that is still the very process a dead worker wrote down).
 */
@Injectable()
export class RenderWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger("render-worker");
  private readonly running = new Set<Promise<void>>();
  private poll: NodeJS.Timeout | null = null;
  private sweeper: NodeJS.Timeout | null = null;
  private stopping = false;
  private filling = false;
  private startedAt = 0;
  lastSweep: { stopped: number; removed: number } | null = null;

  constructor(
    private readonly jobs: JobsService,
    private readonly render: RenderJobsService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === "test" || !this.render.takesRenders) return;
    await this.begin();
  }

  /** The start: release dead holders, sweep, then poll. (A spec calls it by hand.) */
  async begin(): Promise<void> {
    this.startedAt = this.clock.now().getTime();
    await this.render.setTimeLimit().catch(() => undefined);
    await this.render.releaseDeadHolders().catch((e: unknown) => this.log.warn(`could not release dead holders: ${String(e)}`));
    await this.sweep();
    this.poll = setInterval(() => void this.fill(), RENDER_POLL_MS);
    this.sweeper = setInterval(() => void this.sweep(), RENDER_SWEEP_MS);
    this.log.log(`render loop on: role ${this.env.PROCESS_ROLE}, up to ${this.render.concurrency()} at once`);
    void this.fill();
  }

  /** Longer than any lease: a folder older than this is nobody's. */
  private longest(): number {
    return this.render.leaseMs() + 120_000;
  }

  async sweep(): Promise<void> {
    try {
      await this.render.releaseDeadHolders();
      this.lastSweep = await sweepRenderLeftovers(this.longest(), this.clock.now().getTime());
      if (this.lastSweep.stopped || this.lastSweep.removed) this.log.log(`leftovers: ${this.lastSweep.stopped} stopped, ${this.lastSweep.removed} removed`);
    } catch (e) {
      this.log.warn(`leftover sweep failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Takes render jobs until RENDER_CONCURRENCY are running or none is due. Answers how many it started. */
  async fill(): Promise<number> {
    if (this.stopping || this.filling) return 0;
    this.filling = true;
    let started = 0;
    try {
      while (!this.stopping && this.running.size < this.render.concurrency()) {
        const p = await this.jobs.startDue([RENDER_JOB_KIND]);
        if (!p) break;
        const t: Promise<void> = p.done
          .catch(() => undefined)
          .finally(() => {
            this.running.delete(t);
          });
        this.running.add(t);
        started++;
      }
    } catch (e) {
      this.log.warn(`could not take a render job: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.filling = false;
    }
    return started;
  }

  status(): { role: string; running: number; concurrency: number; uptimeSeconds: number } {
    return { role: this.env.PROCESS_ROLE, running: this.running.size, concurrency: this.render.concurrency(), uptimeSeconds: Math.round((this.clock.now().getTime() - this.startedAt) / 1000) };
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.poll) clearInterval(this.poll);
    if (this.sweeper) clearInterval(this.sweeper);
    // a render still running is left to its lease (its browser ends with this process); wait a moment for the quick ones
    await Promise.race([Promise.all([...this.running]), new Promise((r) => setTimeout(r, 3000))]);
  }
}
