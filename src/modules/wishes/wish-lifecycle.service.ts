import { readLimits } from "../price-book/book-limits";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/db/prisma.service";
import { AppError } from "../../common/errors/app-error";
import { Clock } from "../../common/ports/clock.port";
import { isUuidV7 } from "../../common/ids/uuidv7";
import { IdGenerator } from "../../common/ports/ids.port";
import { StoragePort } from "../../common/ports/storage.port";
import { forgetForWishes as forgetAiWords } from "../ai-writing/ai-writing.service";
import { stagingKeyOf, variantsOf } from "../stored-files/file-rules";
import { giveBackDraws } from "../purchases/draw-giveback";
import { localToUtc } from "./local-time";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { JobsService, JobContext, JobResult } from "../jobs/jobs.service";
import { ShowingLink } from "../showing/showing-link";
import { SavedWishesService } from "../saved-wishes/saved-wishes.service";
import { canMove, outOfSight, stateOf, WishState } from "./wish-state";

type Tx = Prisma.TransactionClient;
const DAY = 24 * 60 * 60 * 1000;
/** The notice goes out three days before the term ends (conventions: Timed work). */
export const NOTICE_DAYS = 3;
/** The upload-cleanup jobs that remove one file a erased wish named (EE4): the subject is this prefix and the file's id. */
export const ERASE_WISH_FILE_PREFIX = "erase-wish-file:";

/**
 * A wish's own term end (EE7, EE8): its first open plus the ticket's term days; a wedding wish counts from its wedding date and never
 * ends before it was opened. Null while it has not been opened. The one place this date is worked out (markOpened and HB1's endOf).
 */
export async function termEnd(
  tx: Tx,
  w: { ticket: string | null; openedAt: Date | null; weddingDate: Date | null; timeZone: string },
  entitlements: (tx: Tx) => Promise<Parameters<typeof grantOf>[0]>,
): Promise<Date | null> {
  if (!w.openedAt) return null;
  let days = 0;
  let found = false;
  if (w.ticket) {
    const g = grantOf(await entitlements(tx), `ticket.${w.ticket}`);
    if (g && typeof g.termDays === "number") {
      days = g.termDays;
      found = true;
    }
  }
  if (!found) {
    const cfg = await tx.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
    const terms = (cfg?.TERM_DAYS ?? {}) as Record<string, number>;
    days = (w.ticket && terms[w.ticket]) || 7;
  }
  const term = days * DAY;
  let endsAt = new Date(w.openedAt.getTime() + term);
  if (w.weddingDate) {
    const day = localToUtc(`${w.weddingDate.toISOString().slice(0, 10)}T00:00`, w.timeZone);
    if (day) endsAt = new Date(Math.max(w.openedAt.getTime(), day.getTime() + term));
  }
  return endsAt;
}

interface Locked {
  id: string;
  status: string;
  erasedAt: Date | null;
  ticket: string | null;
  opensAt: Date | null;
  openedAt: Date | null;
  timeZone: string;
  weddingDate: Date | null;
  endsAt: Date | null;
  restingSince: Date | null;
  eraseAfter: Date | null;
}

/** Works a live or resting wish's end out again from the rows and writes it with its rest job; answers the end, or null when it holds none. */
export type EndFn = (tx: Tx, wishId: string, opt: { wake?: boolean; cause?: string }) => Promise<Date | null>;

export interface MoveOptions {
  cause: string;
  jobRunId?: string | null;
  /** Columns that change with the move. */
  data?: Prisma.WishUncheckedUpdateInput;
}

/** The columns that hold what the sender wrote or chose: blank when a wish is erased. The row, its number and its kind stay. */
const PERSONAL_BLANK = {
  content: Prisma.DbNull, name: null, makerNote: Prisma.DbNull, adds: Prisma.DbNull, passcodeHash: null,
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
    private readonly storage: StoragePort,
    private readonly showing: ShowingLink,
  ) {}

  private endHook: EndFn | null = null;

  /** HB3: the purchases module hands over the one end function (PassCover.applyEnd): wishes cannot import purchases. */
  registerEnd(fn: EndFn): void {
    this.endHook = fn;
  }

  onModuleInit(): void {
    this.jobs.register("open-wish", (c) => this.openJob(c));
    this.jobs.register("rest-wish", (c) => this.restJob(c));
    this.jobs.register("erase-wish", (c) => this.eraseJob(c));
    this.jobs.register("erase-now", (c) => this.eraseJob(c, true));
    this.jobs.register("restore-window-end", (c) => this.windowEndJob(c));
    this.jobs.registerSubject("upload-cleanup", ERASE_WISH_FILE_PREFIX, (c) => this.eraseWishFileJob(c));
  }

  /** Locks the wish row. A missing wish or an id that is not a uuid is a 404. */
  async lock(tx: Tx, wishId: string): Promise<Locked> {
    if (!/^[0-9a-f-]{36}$/i.test(wishId)) throw AppError.notFound("No such wish.");
    const rows = await tx.$queryRaw<Locked[]>`
      SELECT id::text AS id, status::text AS status, "erasedAt", ticket::text AS ticket, "opensAt", "openedAt", "timeZone", "weddingDate", "endsAt", "restingSince", "eraseAfter"
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
    // SS1: a wish that rests, is taken down or erased loses its published row and its asks in this transaction; coming back needs a new ask.
    if (to === "resting" || outOfSight(to)) await this.showing.showing.dropForWishes(tx, [wish.id]);
    if (outOfSight(to)) {
      await this.saved.forgetForWishes(tx, [wish.id]);
      await tx.wishLink.updateMany({ where: { wishId: wish.id }, data: { active: false } });
      if (to === "erased") {
        await this.forgetLinkNames(tx, [wish.id]);
        await forgetAiWords(tx, [wish.id]);
        await this.releaseFiles(tx, wish.id, now);
        // HU1 (AA2): what a link holder's keep payment kept about the payer (the email, on the payment only) goes with the wish
        await tx.payment.updateMany({ where: { accountId: null, purpose: "keep", subjectId: wish.id }, data: { payerContact: null } });
        // INT-7: a draft a business drew a wish for gives the wish back when it is erased (once; a sealed wish gives nothing).
        await giveBackDraws(tx, [wish.id], now);
        // ZB3: a client wish's record reads its wish; when the wish is erased the record's words go with it.
        await tx.clientWish.updateMany({ where: { wishId: wish.id }, data: { wish: null, from: null, client: null } });
      }
      for (const kind of ["open-wish", "rest-wish", "erase-wish", "restore-window-end", "send-notice"]) await this.jobs.cancel(kind, wish.id, tx);
    }
    return from;
  }

  /**
   * VV2: an erase leaves no name in a link. The receiver's name at the front of the slug is cut off (the random tail stays when it is a full issued tail of 8 or more characters, so the old
   * link still answers as an erased wish does, with no name in the answer) and the wish's opening rows are deleted.
   */
  async forgetLinkNames(tx: Tx, wishIds: string[]): Promise<void> {
    if (!wishIds.length) return;
    await tx.$executeRaw`
      UPDATE wish_link SET slug = substr(slug, strpos(slug, '-') + 1) WHERE "wishId" = ANY(${wishIds}::uuid[]) AND strpos(slug, '-') > 0 AND length(slug) - strpos(slug, '-') >= 8`;
    await tx.wishOpen.deleteMany({ where: { wishId: { in: wishIds } } });
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

  /**
   * EE7: the first opening by the receiver (B10 calls it in its own transaction when it serves the first read at or after the open
   * time). In that one transaction: openedAt is set once, the wish becomes live, endsAt = openedAt + the ticket's term (EE8: a
   * wedding wish counts from its wedding date, never ending before it was opened), and the rest job and the notice are scheduled.
   * Answers `opened: false` when it was already opened or is not open yet; any number of calls at once change the row once
   * (the row is locked, and a trigger keeps openedAt from moving).
   */
  async markOpened(tx: Tx, wishId: string, at: Date): Promise<{ opened: boolean; openedAt: Date | null; endsAt: Date | null }> {
    const w = await this.lock(tx, wishId);
    if (w.openedAt || stateOf(w) !== "sealed" || !w.opensAt || w.opensAt.getTime() > at.getTime()) {
      return { opened: false, openedAt: w.openedAt, endsAt: w.endsAt };
    }
    const endsAt = (await termEnd(tx, { ticket: w.ticket, openedAt: at, weddingDate: w.weddingDate, timeZone: w.timeZone }, (t) => this.entitlements.row(t))) as Date;
    await this.move(tx, w, "live", { cause: "receiver.open", data: { openedAt: at, endsAt } });
    const owner = await tx.$queryRaw<{ gone: boolean }[]>`
      SELECT (a."erasedAt" IS NOT NULL OR ba."erasedAt" IS NOT NULL) AS gone
        FROM wish w JOIN account a ON a.id = w."accountId"
        LEFT JOIN business b ON b.id = w."businessId" LEFT JOIN account ba ON ba.id = b."accountId"
       WHERE w.id = ${w.id}::uuid`;
    if (owner[0]?.gone) {
      // RR3: the owner of this client wish was erased: it plays to the end of its term and is erased then (it does not rest a year); nobody is told.
      await this.jobs.schedule("erase-now", endsAt, w.id, tx);
    } else {
      // HB3: a wish opened while its owner holds a live Pass ends with the Pass, not with its own term: the one end function says (and
      // writes the end, the mark and the rest job and notice itself); with none it gives back null and the term stands.
      const held = this.endHook ? await this.endHook(tx, w.id, { cause: "receiver.open" }) : null;
      if (held) return { opened: true, openedAt: at, endsAt: held };
      await this.jobs.schedule("rest-wish", endsAt, w.id, tx);
      await this.jobs.schedule("send-notice", new Date(endsAt.getTime() - NOTICE_DAYS * DAY), w.id, tx);
    }
    return { opened: true, openedAt: at, endsAt };
  }

  /** At the open time a sealed wish becomes openable and nothing else changes (EE7); the term starts at the first opening. */
  async openJob(c: JobContext): Promise<JobResult> {
    const w = await this.prisma.wish.findUnique({ where: { id: c.subjectId }, select: { status: true, erasedAt: true, opensAt: true } });
    if (!w || stateOf(w) !== "sealed") return { skipped: true };
    if (w.opensAt && w.opensAt.getTime() > c.now.getTime()) return { skipped: true, again: w.opensAt };
    return { changed: { openable: true } };
  }

  /**
   * At term end live becomes resting. A term made longer meanwhile (a keep) moves the job instead. A sealed wish nobody has opened
   * rests 365 days after its open time (EE9).
   */
  async restJob(c: JobContext): Promise<JobResult> {
    return this.prisma.$transaction(async (tx) => {
      let w = await this.lock(tx, c.subjectId);
      const state = stateOf(w);
      if (state !== "live" && state !== "sealed") return { skipped: true };
      if (state === "live" && this.endHook) {
        // HB3: never rest a wish a live Pass or a paid keep still covers: the one end function works the end out again; a later end
        // is the next rest time (it has scheduled this job there already).
        const end = await this.endHook(tx, w.id, { cause: "job.rest" });
        if (end && end.getTime() > c.now.getTime()) return { skipped: true, again: end };
        // nothing covers it: the end function put this job at "now" again; this run is that run, so the job stands down
        await this.jobs.cancel("rest-wish", w.id, tx);
        w = await this.lock(tx, c.subjectId);
      }
      const due = state === "sealed" ? (w.opensAt ? new Date(w.opensAt.getTime() + (await readLimits(tx)).unopenedDays * DAY) : null) : w.endsAt;
      if (state === "sealed" && !due) return { skipped: true };
      if (due && due.getTime() > c.now.getTime()) return { skipped: true, again: due };
      const eraseAfter = new Date(c.now.getTime() + (await this.holdDays(tx)) * DAY);
      await this.move(tx, w, "resting", { cause: state === "sealed" ? "job.rest-unopened" : "job.rest", jobRunId: c.jobRunId, data: { restingSince: c.now, eraseAfter } });
      await this.jobs.schedule("erase-wish", eraseAfter, w.id, tx);
      await this.jobs.schedule("restore-window-end", new Date(c.now.getTime() + (await this.restoreDays(tx)) * DAY), w.id, tx);
      return { changed: { from: state, to: "resting", eraseAfter: eraseAfter.toISOString() } };
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
    const w = await this.prisma.wish.findUnique({ where: { id: c.subjectId }, select: { status: true, erasedAt: true, businessId: true } });
    if (w && stateOf(w) === "taken_down" && w.businessId) return this.draftWindowEnd(c);
    if (!w || stateOf(w) !== "resting") return { skipped: true };
    return { changed: { restoreWindow: "closed" } };
  }

  /**
   * INT-7: a business's draft that its maker removed and did not bring back is erased when its window ends, and its draw goes back to
   * the business (the erase does that). Only a draft the owner removed: a wish taken down by staff, or one that was ever sealed, is left alone.
   */
  private async draftWindowEnd(c: JobContext): Promise<JobResult> {
    return this.prisma.$transaction(async (tx) => {
      const w = await this.lock(tx, c.subjectId);
      if (stateOf(w) !== "taken_down") return { skipped: true };
      const last = await tx.wishTransition.findFirst({ where: { wishId: w.id, to: "taken_down" }, orderBy: { id: "desc" } });
      if (last?.cause !== "owner.remove" || last.from !== "draft") return { skipped: true };
      const ends = new Date(last.createdAt.getTime() + (await this.restoreDays(tx)) * DAY);
      if (ends.getTime() > c.now.getTime()) return { skipped: true, again: ends };
      await this.move(tx, w, "erased", { cause: "job.restore-window-end", jobRunId: c.jobRunId });
      return { changed: { from: "taken_down", to: "erased", restoreWindow: "closed" } };
    });
  }

  /**
   * EE4: an erased wish's file rows go, and one upload-cleanup job per file no other wish names removes the file's objects (the
   * job checks again when it runs). The jobs are written in the erase's own transaction; storage is called by the job (Y4).
   */
  private async releaseFiles(tx: Tx, wishId: string, now: Date): Promise<void> {
    const mine = [...new Set((await tx.wishFile.findMany({ where: { wishId }, select: { fileId: true } })).map((r) => r.fileId))];
    await tx.wishFile.deleteMany({ where: { wishId } });
    if (!mine.length) return;
    const shared = new Set((await tx.wishFile.findMany({ where: { fileId: { in: mine }, wishId: { not: wishId } }, select: { fileId: true } })).map((r) => r.fileId));
    for (const fileId of mine) if (!shared.has(fileId)) await this.jobs.schedule("upload-cleanup", now, `${ERASE_WISH_FILE_PREFIX}${fileId}`, tx);
  }

  /** The job for one file of an erased wish: its objects first (safe to repeat), then its rows; a file another wish names stays. */
  async eraseWishFileJob(c: JobContext): Promise<JobResult> {
    const id = c.subjectId.slice(ERASE_WISH_FILE_PREFIX.length);
    if (!isUuidV7(id)) return { skipped: true };
    const f = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!f) return { skipped: true };
    if ((await this.prisma.wishFile.count({ where: { fileId: id } })) > 0) return { skipped: true, changed: { kept: "another wish names it" } };
    for (const key of [f.objectKey, stagingKeyOf(f.objectKey), ...variantsOf(f).map((v) => v.key)]) await this.storage.delete(key);
    const removed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM stored_file WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows.length || (await tx.wishFile.count({ where: { fileId: id } })) > 0) return false;
      await tx.aiRequest.updateMany({ where: { inputFileId: id }, data: { inputFileId: null } });
      await tx.aiRequest.updateMany({ where: { voiceFileId: id }, data: { voiceFileId: null } });
      await tx.conciergeOrder.updateMany({ where: { namesFileId: id }, data: { namesFileId: null } });
      await tx.conciergeOrder.updateMany({ where: { reportFileId: id }, data: { reportFileId: null } });
      await tx.qrCard.updateMany({ where: { fileId: id }, data: { fileId: null } });
      await tx.renderJob.updateMany({ where: { outputFileId: id }, data: { outputFileId: null } });
      await tx.voiceNote.deleteMany({ where: { id } });
      await tx.uploadTicket.deleteMany({ where: { id } });
      await tx.storedFile.deleteMany({ where: { id } });
      return true;
    });
    return { changed: { removed: removed ? 1 : 0 } };
  }
}
