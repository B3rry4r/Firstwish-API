/** Time-zone arithmetic with Intl only (no library). */
function parts(at: Date, tz: string): Record<string, number> {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** How far the zone is ahead of UTC at that instant, in milliseconds. */
export function offsetMs(at: Date, tz: string): number {
  const p = parts(new Date(Math.floor(at.getTime() / 1000) * 1000), tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant when the wall clock in `tz` reads `hour`:00 on the calendar day that `at` falls on in `tz`. */
export function atLocalHour(at: Date, tz: string, hour: number): Date {
  const p = parts(at, tz);
  const guess = Date.UTC(p.year, p.month - 1, p.day, hour, 0, 0);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** "12 December 2026" in the zone. */
export function dayText(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(at);
}
