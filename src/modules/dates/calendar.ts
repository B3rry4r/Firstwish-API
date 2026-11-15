import { daysInMonth } from "../../common/time/time";

/*
 * Calendar arithmetic for remembered dates. A date is a calendar date (no time, no zone). "Today" is the calendar date in the
 * home zone (Africa/Lagos, the default country of the format canon), read from the clock port.
 * Default (lead), owner may override: a 29 February date falls on 28 February in a year that has no 29 February.
 */
export const HOME_ZONE = "Africa/Lagos";

const DAY_MS = 86_400_000;

/** The calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function todayIn(now: Date, zone: string = HOME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parts(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The day a date falls on in a given year (29 February becomes 28 February when that year has none). */
export function occurrenceIn(date: string, year: number): string {
  const [, m, d] = parts(date);
  return fmt(year, m, Math.min(d, daysInMonth(year, m)));
}

export interface NextOccurrence {
  /** The next day the date falls on, today included. A date still to come is its own next occurrence. */
  on: string;
  /** Days from today to it (0 = today). */
  days: number;
  /** The years it will mark on that day (a birthday's age, an anniversary's count); 0 for the first time. */
  years: number;
}

export function nextOccurrence(date: string, today: string): NextOccurrence {
  const [y0] = parts(date);
  const [ty] = parts(today);
  let on: string;
  if (date >= today) on = date;
  else {
    on = occurrenceIn(date, ty);
    if (on < today) on = occurrenceIn(date, ty + 1);
  }
  const [oy, om, od] = parts(on);
  const [, tm, td] = parts(today);
  const days = Math.round((Date.UTC(oy, om - 1, od) - Date.UTC(ty, tm - 1, td)) / DAY_MS);
  return { on, days, years: oy - y0 };
}
