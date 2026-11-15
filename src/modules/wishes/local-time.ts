/** The UTC instant of a local wall-clock time in an IANA zone. Answers null for a time that does not read. */
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function offsetMs(zone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(at));
  const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(at / 1000) * 1000;
}

export function localToUtc(local: string, zone: string): Date | null {
  const m = LOCAL.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const probe = new Date(wall);
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let utc = wall - offsetMs(zone, wall);
  utc = wall - offsetMs(zone, utc);
  return new Date(utc);
}

/** An instant with Z or an offset is taken as it is; a bare local time is read in the zone. */
export function parseOpening(input: string, zone: string): Date | null {
  const v = input.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v) && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return localToUtc(v, zone);
}

/** The wall-clock reading of an instant in a zone, as "YYYY-MM-DDTHH:mm:ss" (what localToUtc takes back). */
export function utcToLocal(at: Date, zone: string): string {
  const wall = new Date(at.getTime() + offsetMs(zone, at.getTime()));
  return wall.toISOString().slice(0, 19);
}
