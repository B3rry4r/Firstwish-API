import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/ports/clock.port";
import { JobsService } from "../jobs/jobs.service";
import { EntitlementsService, grantOf } from "../price-book/entitlements.service";
import { NOTICE_DAYS, WishLifecycleService } from "../wishes/wish-lifecycle.service";
import { stateOf } from "../wishes/wish-state";
import { addDays, type Tx } from "./grants";

/**
 * HA2 (T-14): a Pass keeps every wish its holder made live while the Pass is active. For the holder's OWN wish a keep or a wake is
 * covered: the wish is live until the Pass ends (keptBy "pass", keptUntil the Pass's end). Nothing here ends the cover by itself: the
 * ordinary rest-wish job at the wish's end rests it, and a refunded Pass is settled again by `recompute`, so the wish rests unless
 * a paid keep (or its own term) covers it. Callers hold the account lock.
 */
@Injectable()
export class PassCover {
  constructor(
    private readonly clock: Clock,
    private readonly lifecycle: WishLifecycleService,
    private readonly jobs: JobsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** When the account's Pass cover ends (the last end of its contiguous Passes), or null when no Pass is live now. */
  async liveUntil(tx: Tx, accountId: string): Promise<Date | null> {
    const now = this.clock.now();
    const rows = await tx.$queryRaw<{ live: boolean; ends: Date | null }[]>`
      SELECT bool_or(since <= ${now}::timestamptz) AS live, max((("validUntil" #>> '{}'))::timestamptz) AS ends
        FROM pass_membership
       WHERE "accountId" = ${accountId}::uuid AND state = 'active' AND (("validUntil" #>> '{}'))::timestamptz > ${now}::timestamptz`;
    return rows[0]?.live && rows[0].ends ? rows[0].ends : null;
  }

  /** Covers one of the account's wishes by its live Pass. Answers when it now ends, or null when there is no live Pass (nothing changed). */
  async apply(tx: Tx, accountId: string, wishId: string): Promise<Date | null> {
    const until = await this.liveUntil(tx, accountId);
    if (!until) return null;
    const w = await this.lifecycle.lock(tx, wishId);
    const state = stateOf(w);
    let endsAt = until;
    if (state === "live") {
      if (w.endsAt && w.endsAt.getTime() >= until.getTime()) endsAt = w.endsAt; // its own term already outlasts the Pass: nothing to move
      else await tx.wish.update({ where: { id: wishId }, data: { endsAt: until, keptBy: "pass", keptUntil: until, version: { increment: 1 } } });
    } else if (state === "resting") {
      await this.lifecycle.move(tx, w, "live", { cause: "pass.cover", data: { endsAt: until, keptBy: "pass", keptUntil: until, restingSince: null, eraseAfter: null } });
      await this.jobs.cancel("erase-wish", wishId, tx);
      await this.jobs.cancel("restore-window-end", wishId, tx);
    } else return null;
    await this.schedule(tx, wishId, endsAt);
    return endsAt;
  }

  private async schedule(tx: Tx, wishId: string, endsAt: Date): Promise<void> {
    await this.jobs.schedule("rest-wish", endsAt, wishId, tx);
    const notice = addDays(endsAt, -NOTICE_DAYS);
    if (notice.getTime() > this.clock.now().getTime()) await this.jobs.schedule("send-notice", notice, wishId, tx);
    else await this.jobs.cancel("send-notice", wishId, tx);
  }

  /**
   * After a Pass is refunded: each wish it covered ends where its own term or its paid keeps (or another live Pass) say, and the rest-wish
   * job puts it to rest when that has passed. The wish row is locked by the caller's refund transaction through the lifecycle lock.
   */
  async recompute(tx: Tx, accountId: string): Promise<void> {
    const now = this.clock.now();
    const covered = await tx.wish.findMany({ where: { accountId, keptBy: "pass" }, select: { id: true } });
    for (const { id } of covered) {
      const w = await this.lifecycle.lock(tx, id);
      const state = stateOf(w);
      if (state !== "live" && state !== "resting") continue;
      const row = await tx.wish.findUniqueOrThrow({ where: { id }, select: { ticket: true, openedAt: true, keep: true } });
      const own = row.openedAt ? addDays(row.openedAt, Number(grantOf(await this.entitlements.row(tx), `ticket.${row.ticket ?? "moment"}`)?.termDays ?? 0)) : null;
      const paid = await tx.purchaseGrant.findMany({ where: { wishId: id, kind: "keep", revokedAt: null, refusedReason: null }, select: { endsAt: true } });
      const paidEnd = paid.reduce<Date | null>((m, g) => (g.endsAt && (!m || g.endsAt > m) ? g.endsAt : m), null);
      const pass = await this.liveUntil(tx, accountId);
      const target = [own, paidEnd, pass].reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
      if (target && target.getTime() > now.getTime()) {
        const by = pass && pass.getTime() >= target.getTime() ? "pass" : paidEnd && paidEnd.getTime() >= target.getTime() ? "keep" : null;
        await tx.wish.update({ where: { id }, data: { endsAt: target, keptBy: by, keptUntil: by ? target : null, version: { increment: 1 } } });
        if (state === "live") await this.schedule(tx, id, target);
      } else {
        // nothing covers it now: it ends now, and the rest job (run at once) puts it to rest
        await tx.wish.update({ where: { id }, data: { endsAt: now, keptBy: null, keptUntil: null, version: { increment: 1 } } });
        await this.jobs.schedule("rest-wish", now, id, tx);
      }
    }
  }
}
