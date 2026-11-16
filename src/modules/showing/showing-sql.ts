import { Prisma } from "@prisma/client";
import { REPORT_HOURS } from "../moderation/ban-rules";

/** Lagos is UTC+1 all year (no summer time), so a Lagos calendar date is the UTC date of the instant plus one hour. */
export const LAGOS_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** A day pick may be set from today through this many days ahead (PROVISIONAL, "the next 7 days"). */
export const PICK_DAYS = 6;
export { REPORT_HOURS };

export function lagosToday(now: Date): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * What makes a listing public right now. It is the feed's own test (the wish is live, its open time has passed, its term
 * has not ended, no passcode, not removed or erased, its link answers) and the owner is neither erased nor banned. Because the
 * list reads through it, a wish that rests, is taken down, removed or erased leaves the list in the very transaction that
 * changes it, with no call from the lifecycle. Expects the aliases pw (published_wish), w (wish), a (account), l (link).
 */
export function publicNow(now: Date): Prisma.Sql {
  return Prisma.sql`
    w.status = 'live' AND w."opensAt" IS NOT NULL AND w."opensAt" <= ${now}
    AND w."erasedAt" IS NULL AND w."removedAt" IS NULL AND w."passcodeHash" IS NULL
    AND w."endsAt" IS NOT NULL AND w."endsAt" > ${now}
    AND l.active AND a."erasedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM ban b WHERE b."accountId" = a.id AND (b.until IS NULL OR b.until > ${now}))`;
}

/** The joins that go with publicNow(). */
export function publicJoins(): Prisma.Sql {
  return Prisma.sql`
    JOIN wish w ON w.id = pw."wishId"
    JOIN account a ON a.id = w."accountId"
    JOIN LATERAL (SELECT slug, active FROM wish_link WHERE "wishId" = w.id ORDER BY "createdAt" DESC, id DESC LIMIT 1) l ON true`;
}
