import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/db/prisma.service";
import { Clock } from "../../common/ports/clock.port";
import { toWireInstant } from "../../common/time/time";
import type { PassMembership } from "../../contracts";

/** What E-83 answers: the contract's PassMembership, with what the page needs worked out beside it (live, when it ends, what is left; HA3, DEC-206). */
export type PassRead = PassMembership;

const EMPTY: PassRead = {
  amount: 0, since: null, validUntil: null, way: "", wishesUsed: 0, upgradesUsed: 0,
  live: false, endsAt: null, wishesTotal: 0, wishesLeft: 0, upgradesTotal: 0, upgradesLeft: 0,
};

const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : 0);
const instant = (v: unknown): Date | null => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * The Pass the account holds, read from its membership rows and the grant each one was bought with (the counters it was given are
 * snapshotted on the grant, so a later price-book change does not move them). Everything is worked out here, from the database: the
 * clock port decides whether it is live, never the page. A Pass that was refunded does not count.
 */
@Injectable()
export class MePassService {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  async read(accountId: string): Promise<PassRead> {
    const now = this.clock.now().getTime();
    const rows = await this.db.passMembership.findMany({ where: { accountId, state: { not: "refunded" } }, orderBy: { id: "desc" } });
    if (!rows.length) return { ...EMPTY };
    const grants = await this.db.purchaseGrant.findMany({
      where: { paymentId: { in: rows.map((r) => r.paymentId) }, sku: "pass.year", revokedAt: null },
      select: { paymentId: true, detail: true },
    });
    const detail = new Map(grants.map((g) => [g.paymentId, (g.detail ?? {}) as Record<string, unknown>]));
    const shaped = rows
      .filter((r) => detail.has(r.paymentId))
      .map((r) => {
        const until = instant(r.validUntil);
        const g = detail.get(r.paymentId) as Record<string, unknown>;
        const live = r.state === "active" && !!until && (r.since?.getTime() ?? 0) <= now && until.getTime() > now;
        return { r, until, g, live };
      });
    // the live one; else the one that ends last (an old one that ended, or one still waiting to start)
    const pick = shaped.find((s) => s.live) ?? [...shaped].sort((a, b) => (b.until?.getTime() ?? 0) - (a.until?.getTime() ?? 0))[0];
    if (!pick) return { ...EMPTY };
    // HB2: with Passes stacked, the end shown is the last live Pass's (a refunded one is not in `shaped`)
    const lastEnd = pick.live ? shaped.filter((s) => s.r.state === "active" && s.until && s.until.getTime() > now).reduce<Date>((m, s) => (s.until && s.until > m ? s.until : m), pick.until as Date) : pick.until;
    const wishesTotal = whole(pick.g.wishes);
    const upgradesTotal = whole(pick.g.upgrades);
    const wishesUsed = whole(pick.r.wishesUsed);
    const upgradesUsed = whole(pick.r.upgradesUsed);
    return {
      amount: Number(pick.r.amount ?? 0n),
      since: pick.r.since ? toWireInstant(pick.r.since) : null,
      validUntil: pick.until ? toWireInstant(pick.until) : null,
      way: pick.r.way ?? "",
      wishesUsed,
      upgradesUsed,
      live: pick.live,
      endsAt: lastEnd ? toWireInstant(lastEnd) : null,
      wishesTotal,
      wishesLeft: Math.max(wishesTotal - wishesUsed, 0),
      upgradesTotal,
      upgradesLeft: Math.max(upgradesTotal - upgradesUsed, 0),
    };
  }
}
