/**
 * Time on the wire: instants are ISO-8601 UTC ("2026-11-15T14:30:00.000Z"); calendar dates are "YYYY-MM-DD" (ruling C-29).
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An instant as it goes on the wire. */
export function toWireInstant(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid date");
  return d.toISOString();
}

/** Parses an ISO-8601 instant with a zone ("Z" or an offset). A time with no zone is refused: it would be read in the server's zone. */
export function parseInstant(input: string): Date | null {
  const v = input.trim();
  if (!INSTANT.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalises an instant string to canonical UTC, or null when it is not an instant with a zone. */
export function normaliseInstant(input: string): string | null {
  const d = parseInstant(input);
  return d ? d.toISOString() : null;
}

/** Parses a calendar date "YYYY-MM-DD" (surrounding spaces allowed). Refuses timestamps and impossible days such as 2026-02-30. */
export function normaliseDateOnly(input: string): string | null {
  const v = input.trim();
  const m = DATE_ONLY.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return v;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The UTC calendar date of an instant. */
export function dateOnlyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** True for an IANA time zone name the runtime knows ("Africa/Lagos"). */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.includes("/") || tz === "UTC";
  } catch {
    return false;
  }
}
