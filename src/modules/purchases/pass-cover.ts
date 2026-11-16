import { Injectable, OnModuleInit } from "@nestjs/common";
import type { $Enums } from "@prisma/client";
import { Clock } from "../../common/ports/clock.port";
import { JobsService } from "../jobs/jobs.service";
import { AppError } from "../../common/errors/app-error";
import { NOTICE_DAYS, termEnd, WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { addDays, num, type Tx } from "./grants";

const KEEP_RANK: Record<string, number> = { month: 1, half: 2, year: 3 };

/** What holds a wish's end, and the pieces it was worked out from. */
export interface EndOf {
  /** The end, or null when nothing gives the wish an end (it was never opened and holds no keep or Pass). */
  end: Date | null;
  /** keep: a paid keep holds it; pass: a Pass; null: its own term. */
  by: $Enums.WishKeptBy | null;
  /** The longest paid keep that still stands, or null. */
  keep: $Enums.WishKeep | null;
  own: Date | null;
  /** Where the standing paid keeps take it (null when none stands). */
  keepsEnd: Date | null;
  passEnd: Date | null;
}

/**
 * HB1: the one place a wish's end is worked out, from scratch, from the rows. Start from the wish's own term end (first open plus the
 * ticket's term, the wedding rule EE8); for each paid keep that still stands, in the order bought: begin at the later of the running
 * end and the moment it was bought, then add its days; the end is the later of that and the end of the owner's Pass (a Pass counts
 * once one has started and has not been refunded). `except` leaves out one grant a refund is taking back right now.
 * Reads only: it never writes, so any number of callers can ask. Hold the wish's row lock when the answer is to be written.
 */
export async function endOf(tx: Tx, wishId: string, opt: { now: Date; except?: string | null }): Promise<EndOf> {
  const w = await tx.wish.findUniqueOrThrow({ where: { id: wishId }, select: { accountId: true, ticket: true, openedAt: true, weddingDate: true, timeZone: true } });
  const book = () => tx.entitlements.findFirst({ orderBy: { id: "desc" } }).then((r) => {
    if (!r) throw new AppError(503, "price_book_missing", "The price book is not set up yet.");
    return r;
  });
  const own = await termEnd(tx, w, book);
  const keeps = (
    await tx.purchaseGrant.findMany({
      where: { wishId, kind: "keep", revokedAt: null, refusedReason: null, ...(opt.except ? { id: { not: opt.except } } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true, detail: true },
    })
  )
    .map((g) => {
      const d = (g.detail ?? {}) as Record<string, unknown>;
      return { bought: g.createdAt, days: num(d.days), length: typeof d.length === "string" ? d.length : null };
    })
    .filter((k) => k.days > 0);
  let keepsEnd: Date | null = null;
  let running = own;
  let keep: string | null = null;
  for (const k of keeps) {
    const begin: Date = running && running.getTime() > k.bought.getTime() ? running : k.bought;
    running = addDays(begin, k.days);
    keepsEnd = running;
    if (k.length && KEEP_RANK[k.length] && (!keep || KEEP_RANK[k.length] > KEEP_RANK[keep])) keep = k.length;
  }
  // a Pass that is over (its end not after now) is not shown: no end and no keptBy come from it
  const pass = await tx.$queryRaw<{ started: boolean | null; ends: Date | null }[]>`
    SELECT bool_or(since <= ${opt.now}::timestamptz) AS started, max((("validUntil" #>> '{}'))::timestamptz) AS ends
      FROM pass_membership WHERE "accountId" = ${w.accountId}::uuid AND state = 'active' AND (("validUntil" #>> '{}'))::timestamptz > ${opt.now}::timestamptz`;
  const passEnd = pass[0]?.started && pass[0].ends ? pass[0].ends : null;
  const end = [running, passEnd].reduce<Date | null>((m, d) => (d && (!m || d.getTime() > m.getTime()) ? d : m), null);
  const by = passEnd && (!running || passEnd.getTime() > running.getTime()) ? "pass" : keepsEnd ? "keep" : null;
  return { end, by, keep: keep as $Enums.WishKeep | null, own, keepsEnd, passEnd };
}

/**
 * HA2 (T-14) and HB1: a Pass keeps every wish its holder made live while the Pass is active. Every event that can move a wish's end
 * (a keep paid or refunded, a Pass bought or refunded, a wake) calls `applyEnd`, which works the end out again with `endOf` and writes
 * it with the rest job to match. Nothing else does date arithmetic. Callers hold the account lock.
 */
@Injectable()
export class PassCover implements OnModuleInit {
  constructor(
    private readonly clock: Clock,
    private readonly lifecycle: WishLifecycleService,
    private readonly jobs: JobsService,
  ) {}

  /** HB3: the lifecycle cannot import this module, so it is handed the one end function here, at boot (as the plan seal is registered). */
  onModuleInit(): void {
    this.lifecycle.registerEnd((tx, wishId, opt) => this.applyEnd(tx, wishId, opt));
  }

  /** When the account's Pass cover ends (the last end of its contiguous Passes), or null when no Pass is live now. */
  async liveUntil(tx: Tx, accountId: string): Promise<Date | null> {
    const now = this.clock.now();
    const rows = await tx.$queryRaw<{ live: boolean; ends: Date | null }[]>`
      SELECT bool_or(since <= ${now}::timestamptz) AS live, max((("validUntil" #>> '{}'))::timestamptz) AS ends
        FROM pass_membership
       WHERE "accountId" = ${accountId}::uuid AND state = 'active' AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz`;
    return rows[0]?.live && rows[0].ends ? rows[0].ends : null;
  }

  /**
   * HB1: works the wish's end out again and writes endsAt, keptUntil, keptBy and the keep label, then (re)schedules or cancels the rest
   * job to match. A live wish is moved to its end (a past end is rested by the job at once); a resting wish stays resting unless
   * `wake` is given and the end is ahead (it then goes live, with the erase and restore jobs cancelled), and never has a rest job.
   * Answers the end now stored, or null when the wish cannot hold one (not live or resting, or nothing gives it an end).
   */
  async applyEnd(tx: Tx, wishId: string, opt: { wake?: boolean; cause?: string; except?: string | null } = {}): Promise<Date | null> {
    const w = await this.lifecycle.lock(tx, wishId);
    const state = stateOf(w);
    if (state !== "live" && state !== "resting") return null;
    const now = this.clock.now();
    const r = await endOf(tx, wishId, { now, except: opt.except });
    if (!r.end) return null;
    const end = r.end;
    // a mark this code does not own (now-showing, pro-plan) stays while neither a keep nor a Pass holds the end, and comes back when
    // the keep that replaced it goes (the first keep's grant row says what the wish carried before it)
    let by: $Enums.WishKeptBy | null = r.by;
    let until: Date | null = r.by ? end : null;
    if (!r.by) {
      const was = await tx.wish.findUniqueOrThrow({ where: { id: wishId }, select: { keptBy: true, keptUntil: true } });
      if (was.keptBy === "now_showing" || was.keptBy === "pro_plan") ({ keptBy: by, keptUntil: until } = was);
      else if (was.keptBy === "keep" || was.keptBy === "pass") {
        const first = await tx.purchaseGrant.findFirst({ where: { wishId, kind: "keep", refusedReason: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { detail: true } });
        const d = (first?.detail ?? {}) as Record<string, unknown>;
        if (d.previousKeptBy === "now_showing" || d.previousKeptBy === "pro_plan") {
          by = d.previousKeptBy;
          until = typeof d.previousKeptUntil === "string" ? new Date(d.previousKeptUntil) : null;
        }
      }
    }
    const marks = { endsAt: end, keep: r.keep, keptBy: by, keptUntil: until };
    if (state === "resting") {
      if (opt.wake && end.getTime() > now.getTime()) {
        await this.lifecycle.move(tx, w, "live", { cause: opt.cause ?? "keep.wake", data: { ...marks, restingSince: null, eraseAfter: null } });
        await this.jobs.cancel("erase-wish", wishId, tx);
        await this.jobs.cancel("restore-window-end", wishId, tx);
      } else {
        // it stays at rest: only what is already over is written (a future end on a resting wish would read as live)
        if (end.getTime() <= now.getTime()) await tx.wish.update({ where: { id: wishId }, data: { ...marks, version: { increment: 1 } } });
        await this.jobs.cancel("rest-wish", wishId, tx);
        await this.jobs.cancel("send-notice", wishId, tx);
        return end.getTime() <= now.getTime() ? end : null;
      }
    } else {
      await tx.wish.update({ where: { id: wishId }, data: { ...marks, version: { increment: 1 } } });
    }
    // live: the rest job at the end (at once when it is over), the notice three days before while that is ahead
    await this.jobs.schedule("rest-wish", end.getTime() > now.getTime() ? end : now, wishId, tx);
    const notice = addDays(end, -NOTICE_DAYS);
    if (notice.getTime() > now.getTime()) await this.jobs.schedule("send-notice", notice, wishId, tx);
    else await this.jobs.cancel("send-notice", wishId, tx);
    return end;
  }

  /** Covers one of the account's wishes by its live Pass. Answers when it now ends, or null when there is no live Pass (nothing changed). */
  async apply(tx: Tx, accountId: string, wishId: string): Promise<Date | null> {
    if (!(await this.liveUntil(tx, accountId))) return null;
    return this.applyEnd(tx, wishId, { wake: true, cause: "pass.cover" });
  }

  /** After a Pass is bought or refunded: every live wish of the account has its end worked out again (a resting one only if that is over). */
  async recompute(tx: Tx, accountId: string): Promise<void> {
    const ids = await tx.wish.findMany({ where: { accountId, status: { in: ["live", "resting"] }, erasedAt: null }, select: { id: true }, orderBy: { id: "asc" } });
    for (const { id } of ids) await this.applyEnd(tx, id);
  }
}
