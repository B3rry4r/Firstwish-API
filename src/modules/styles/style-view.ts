import type { Style as StyleRow } from "@prisma/client";
import { toWireInstant } from "../../common/time/time";
import type { Style } from "../../contracts";

export type Level = "starter" | "standard" | "premium";
export const LEVELS: readonly Level[] = ["starter", "standard", "premium"];
export const LEVEL_NAME: Record<Level, string> = { starter: "Starter", standard: "Standard", premium: "Premium" };

/** PROVISIONAL (DEC-60): the preview-to-paid rate shows only once a style has this many previews in the quarter. */
export const MIN_PREVIEWS_FOR_RATE = 200;

/** One entry of a style's record, as the staff Styles page shows it (lib/admin/b-types.ts StyleRow.record). */
export interface RecordEntry {
  at: string;
  what: string;
  by: string;
  reason: string;
}

/** A style's use in a quarter: sums of events, never a stored number (DEC-124). */
export interface Counts {
  previews: number;
  paid: number;
}

/** The staff and public style, exactly the contract's: `rate` is null until MIN_PREVIEWS_FOR_RATE previews in the quarter (X1). */
export type StyleOut = Style;

export function rateOf(c: Counts): number | null {
  return c.previews >= MIN_PREVIEWS_FOR_RATE ? c.paid / c.previews : null;
}

export const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);

/** A slug as the server keys it: trimmed and lowercased; matched exactly after that. */
export const canonSlug = (s: string): string => s.trim().toLowerCase();

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function recordOf(row: Pick<StyleRow, "record">): RecordEntry[] {
  return arr(row.record) as RecordEntry[];
}

/** staff: true shows the record (staff names and reasons); the public read leaves it out. */
export function styleToWire(row: StyleRow, counts: Counts, staff: boolean): StyleOut {
  const level = isLevel(row.level) ? row.level : "starter";
  return {
    slug: row.slug ?? "",
    name: row.name ?? "",
    level,
    tier: LEVEL_NAME[level],
    get: row.get ?? "",
    on: row.on ?? false,
    by: row.by ?? "",
    house: row.house ?? false,
    creator: (row.creator ?? null) as { handle: string; name: string } | null,
    addedAt: row.addedAt ? toWireInstant(row.addedAt) : null,
    line: row.line ?? "",
    feel: row.feel ?? "",
    say: row.say ?? null,
    motion: row.motion ?? null,
    look: row.look ?? null,
    light: row.light ?? false,
    pace: row.pace ?? "",
    orientation: row.orientation ?? "",
    dimension: row.dimension ?? "",
    moves: row.moves ?? "",
    mood: strs(row.mood),
    kinds: strs(row.kinds),
    occasions: obj(row.occasions),
    img: row.img ?? "",
    pos: row.pos ?? "",
    packaged: row.packaged ?? false,
    sample: obj(row.sample) ?? {},
    previews: counts.previews,
    paid: counts.paid,
    rate: rateOf(counts),
    record: staff ? recordOf(row) : [],
    reason: staff ? (recordOf(row).at(-1)?.reason ?? "") : "",
  };
}

/** "2026-Q4" for a moment, in UTC. */
export function quarterOf(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** The [start, end) of a quarter named "YYYY-Qn", or null when the name is not one. */
export function quarterBounds(q: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(q.trim().toUpperCase());
  if (!m) return null;
  const y = Number(m[1]);
  const first = (Number(m[2]) - 1) * 3;
  return { start: new Date(Date.UTC(y, first, 1)), end: new Date(Date.UTC(y, first + 3, 1)) };
}
