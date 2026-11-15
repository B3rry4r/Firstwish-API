import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { IdGenerator } from "../../common/ports/ids.port";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { JobsService, JobContext, JobResult } from "../jobs/jobs.service";
import { SavedWishesService } from "../saved-wishes/saved-wishes.service";
import { canMove, outOfSight, stateOf, WishState } from "./wish-state";

type Tx = Prisma.TransactionClient;
const DAY = 24 * 60 * 60 * 1000;
/** The notice goes out three days before the term ends (conventions: Timed work). */
export const NOTICE_DAYS = 3;

interface Locked {
  id: string;
  status: string;
  erasedAt: Date | null;
  ticket: string | null;
  opensAt: Date | null;
  endsAt: Date | null;
  restingSince: Date | null;
  eraseAfter: Date | null;
}

export interface MoveOptions {
  cause: string;
  jobRunId?: string | null;
  /** Columns that change with the move. */
  data?: Prisma.WishUncheckedUpdateInput;
}

/** The columns that hold what the sender wrote or chose: blank when a wish is erased. The row, its number and its kind stay. */
const PERSONAL_BLANK = {
  content: Prisma.DbNull, photos: Prisma.DbNull, letter: null, name: null, note: null, blessing: Prisma.DbNull, call: null,
  captions: Prisma.DbNull, chapter: Prisma.DbNull, credits: Prisma.DbNull, details: Prisma.DbNull, effect: Prisma.DbNull,
  finale: Prisma.DbNull, links: Prisma.DbNull, memory: Prisma.DbNull, reasons: Prisma.DbNull, timeline: Prisma.DbNull,
  type: Prisma.DbNull, voices: Prisma.DbNull, makerNote: Prisma.DbNull, studio: null, adds: Prisma.DbNull, passcodeHash: null,
} satisfies Prisma.WishUncheckedUpdateInput;

/**
 * Every move of a wish goes through move(): one table of allowed moves (wish-state.ts), the row locked, a WishTransition
 * written in the same transaction with who or what caused it. A move that takes a wish out of sight (taken down, erased) also
 * clears its saves, makes its link answer gone and drops its waiting jobs in that same transaction (ruling BB6).
 * Time moves it by jobs: open-wish, rest-wish, erase-wish, restore-window-end, erase-now (all by the clock port).
 */
@Injectable()
export class WishLifecycleService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly jobs: JobsService,
    private readonly saved: SavedWishesService,
    private readonly entitlements: EntitlementsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register("open-wish", (c) => this.openJob(c));
    this.jobs.register("rest-wish", (c) => this.restJob(c));
    this.jobs.register("erase-wish", (c) => this.eraseJob(c));
    this.jobs.register("erase-now", (c) => this.eraseJob(c, true));
    this.jobs.register("restore-window-end", (c) => this.windowEndJob(c));
  }

  /** Locks the wish row. A missing wish or an id that is not a uuid is a 404. */
  async lock(tx: Tx, wishId: string): Promise<Locked> {
    if (!/^[0-9a-f-]{36}$/i.test(wishId)) throw AppError.notFound("No such wish.");
    const rows = await tx.$queryRaw<Locked[]>`
      SELECT id::text AS id, status::text AS status, "erasedAt", ticket::text AS ticket, "opensAt", "endsAt", "restingSince", "eraseAfter"
        FROM wish WHERE id = ${wishId}::uuid FOR UPDATE`;
    if (!rows[0]) throw AppError.notFound("No such wish.");
    return rows[0];
  }

  /** Moves a locked wish to `to`, or refuses with 409 not_allowed. Answers the state it left. */
  async move(tx: Tx, wish: Locked, to: WishState, opt: MoveOptions): Promise<WishState> {
    const from = stateOf(wish);
    if (!canMove(from, to)) throw AppError.conflict("not_allowed", `A wish that is ${from.replace("_", " ")} cannot become ${to.replace("_", " ")}.`);
    const now = this.clock.now();
    const data: Prisma.WishUncheckedUpdateInput = { ...(opt.data ?? {}), version: { increment: 1 } };
    if (to === "taken_down") {
      data.status = "removed";
      data.removedAt = now;
    } else if (to === "erased") {
      Object.assign(data, PERSONAL_BLANK, { status: "removed", erasedAt: now, removedAt: now });
    } else {
      data.status = to;
      if (from === "taken_down") data.removedAt = null;
    }
    await tx.wish.update({ where: { id: wish.id }, data });
    await tx.wishTransition.create({
      data: { id: this.ids.id(), wishId: wish.id, from, to, cause: opt.cause, jobRunId: opt.jobRunId ?? null, createdAt: now },
    });
    if (outOfSight(to)) {
      await this.saved.forget([wish.id], tx);
      await tx.wishLink.updateMany({ where: { wishId: wish.id }, data: { active: false } });
      if (to === "erased") await tx.wishFile.deleteMany({ where: { wishId: wish.id } });
      for (const kind of ["open-wish", "rest-wish", "erase-wish", "restore-window-end", "send-notice"]) await this.jobs.cancel(kind, wish.id, tx);
    }
    return from;
  }

  /** Takes a wish out of sight (staff take-down, owner remove). Done twice changes nothing more: the second is refused 409. */
  async takeDown(wishId: string, cause: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, await this.lock(tx, wishId), "taken_down", { cause });
    });
  }

  /** Erases a wish now: personal content removed, the row and its number kept. */
  async eraseNow(wishId: string, cause: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, await this.lock(tx, wishId), "erased", { cause });
    });
  }

  /** The state a taken-down wish came from (its last transition's `from`), for a restore. */
  async stateBeforeTakeDown(tx: Tx, wishId: string): Promise<WishState> {
    const last = await tx.wishTransition.findFirst({ where: { wishId, to: "taken_down" }, orderBy: { id: "desc" } });
    const from = (last?.from ?? "draft") as WishState;
    return from === "erased" || from === "taken_down" ? "draft" : from;
  }

  /** The days a resting wish can be brought back in. */
  async restoreDays(db: Tx | PrismaService = this.prisma): Promise<number> {
    const cfg = await db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
    return cfg?.RESTORE_DAYS ?? cfg?.restoreWindowDays ?? 30;
  }

  async holdDays(tx: Tx): Promise<number> {
    const cfg = await tx.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
    return cfg?.HOLD_DAYS ?? 365;
  }

  /** A restore within the window: resting becomes live for the length of the window again. */
  async restoreResting(tx: Tx, wish: Locked, cause: string): Promise<void> {
    const now = this.clock.now();
    const days = await this.restoreDays(tx);
    const since = wish.restingSince ?? now;
    if (stateOf(wish) === "resting" && now.getTime() >= since.getTime() + days * DAY) {
      throw AppError.conflict("not_allowed", "The time to bring this wish back is over.");
    }
    const endsAt = new Date(now.getTime() + days * DAY);
    await this.move(tx, wish, "live", { cause, data: { endsAt, restingSince: null, eraseAfter: null } });
    await this.jobs.cancel("erase-wish", wish.id, tx);
    await this.jobs.cancel("restore-window-end", wish.id, tx);
    await this.jobs.schedule("rest-wish", endsAt, wish.id, tx);
  }

  private async termDays(tx: Tx, ticket: string | null): Promise<number> {
    if (ticket) {
      const g = grantOf(await this.entitlements.row(tx), `ticket.${ticket}`);
      if (g && typeof g.termDays === "number") return g.termDays;
      // the price book has no line: the lifecycle terms below answer
    }
    const cfg = await tx.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
    const terms = (cfg?.TERM_DAYS ?? {}) as Record<string, number>;
    return (ticket && terms[ticket]) || 7;
  }

  /** At the open time a sealed wish becomes live; its term starts now and its end and notice are scheduled. */
  async openJob(c: JobContext): Promise<JobResult> {
    return this.prisma.$transaction(async (tx) => {
      const w = await this.lock(tx, c.subjectId);
      if (stateOf(w) !== "sealed") return { skipped: true };
      if (w.opensAt && w.opensAt.getTime() > c.now.getTime()) {
        return { skipped: true, again: w.opensAt };
      }
      const endsAt = new Date(c.now.getTime() + (await this.termDays(tx, w.ticket)) * DAY);
      await this.move(tx, w, "live", { cause: "job.open", jobRunId: c.jobRunId, data: { openedAt: c.now, endsAt } });
      await this.jobs.schedule("rest-wish", endsAt, w.id, tx);
      await this.jobs.schedule("send-notice", new Date(endsAt.getTime() - NOTICE_DAYS * DAY), w.id, tx);
      return { changed: { from: "sealed", to: "live", endsAt: endsAt.toISOString() } };
    });
  }

  /** At term end live becomes resting. A term made longer meanwhile (a keep) moves the job instead. */
  async restJob(c: JobContext): Promise<JobResult> {
    return this.prisma.$transaction(async (tx) => {
      const w = await this.lock(tx, c.subjectId);
      if (stateOf(w) !== "live") return { skipped: true };
      if (w.endsAt && w.endsAt.getTime() > c.now.getTime()) {
        return { skipped: true, again: w.endsAt };
      }
      const eraseAfter = new Date(c.now.getTime() + (await this.holdDays(tx)) * DAY);
      await this.move(tx, w, "resting", { cause: "job.rest", jobRunId: c.jobRunId, data: { restingSince: c.now, eraseAfter } });
      await this.jobs.schedule("erase-wish", eraseAfter, w.id, tx);
      await this.jobs.schedule("restore-window-end", new Date(c.now.getTime() + (await this.restoreDays(tx)) * DAY), w.id, tx);
      return { changed: { from: "live", to: "resting", eraseAfter: eraseAfter.toISOString() } };
    });
  }

  /** After the hold, resting is erased; with `force` (erase-now) any state that is not erased yet is. */
  async eraseJob(c: JobContext, force = false): Promise<JobResult> {
    return this.prisma.$transaction(async (tx) => {
      const w = await this.lock(tx, c.subjectId);
      const state = stateOf(w);
      if (state === "erased") return { skipped: true };
      if (!force) {
        if (state !== "resting") return { skipped: true };
        if (w.eraseAfter && w.eraseAfter.getTime() > c.now.getTime()) {
          return { skipped: true, again: w.eraseAfter };
        }
      }
      await this.move(tx, w, "erased", { cause: force ? "job.erase-now" : "job.erase", jobRunId: c.jobRunId });
      return { changed: { from: state, to: "erased" } };
    });
  }

  /** The restore window closes: nothing moves, the run says it closed (a restore after it is refused). */
  async windowEndJob(c: JobContext): Promise<JobResult> {
    const w = await this.prisma.wish.findUnique({ where: { id: c.subjectId }, select: { status: true, erasedAt: true } });
    if (!w || stateOf(w) !== "resting") return { skipped: true };
    return { changed: { restoreWindow: "closed" } };
  }
}
