/** The monthly run's job: one row for the whole system, moved on to the next run day by the handler. */
export const MONTHLY_RUN_KEY = "monthly";
/** Hour of the run day the run starts: 08:00 UTC, 09:00 in Lagos. */
export const RUN_HOUR_UTC = 8;
/** R14: the 5th, until staff set another day in Prices (a whole day from 1 to 28, so every month has it). */
export const DEFAULT_RUN_DAY = 5;
export const isRunDay = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 28;

/** The next run day, 08:00 UTC, after `now`. */
export function nextRunDay(now: Date, day: number = DEFAULT_RUN_DAY): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMonth = Date.UTC(y, m, day, RUN_HOUR_UTC);
  return new Date(thisMonth > now.getTime() ? thisMonth : Date.UTC(y, m + 1, day, RUN_HOUR_UTC));
}

/** The words for a payout day ("the 5th of each month"). */
export function dayWords(day: number): string {
  const n = day % 100;
  const suffix = n >= 11 && n <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `the ${day}${suffix} of each month`;
}
