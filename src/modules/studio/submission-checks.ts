import { arr, isObj, obj, type Obj } from "./studio-doc";

/** The eight checks run before review (T-63), in the order the creator sees them. */
export const CHECK_KEYS = ["chapters", "readable", "smooth", "still", "holds", "fallback", "touch", "safe"] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];
export interface CheckResult {
  key: CheckKey;
  pass: boolean;
  detail: string;
}

/** T-63 numbers: words 4.5:1 and quiet words 3:1; files under 2.5 MB; at most 3 moving effects and 10 added things per scene; image 400 KB, sound 900 KB, model 900 KB each. */
export const READABLE = 4.5;
export const QUIET = 3;
export const SMOOTH_FILES_MAX = 2.5 * 1024 * 1024;
export const MOVING_MAX = 3;
export const ADDED_MAX = 10;
export const FILE_MAX: Record<string, number> = { image: 400 * 1024, sound: 900 * 1024, model: 900 * 1024 };

/** A file the style uses, as the Studio module found it in the account's stored files. */
export interface UsedFile {
  id: string;
  kind: string | null;
  bytes: number;
}

/** The file ids a document names (its `art` list: `fileId`, or `id` when it is a uuid). */
export function fileIdsOf(doc: Obj): string[] {
  const out = new Set<string>();
  for (const a of arr(doc.art)) {
    const o = obj(a);
    for (const k of ["fileId", "id"]) if (typeof o[k] === "string" && /^[0-9a-f-]{36}$/i.test(o[k])) out.add(o[k]);
  }
  return [...out];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
/** WCAG contrast ratio of two #hex colours, or null when either is not one. */
export function contrast(a: unknown, b: unknown): number | null {
  if (typeof a !== "string" || typeof b !== "string") return null;
  const [la, lb] = [luminance(a), luminance(b)];
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** A ratio to one decimal, as text. */
const one = (n: number): string => String(Math.round(n * 10) / 10);
const ok = (key: CheckKey, detail: string): CheckResult => ({ key, pass: true, detail });
const no = (key: CheckKey, detail: string): CheckResult => ({ key, pass: false, detail });

/**
 * The eight checks over a frozen draft. Pure: the files the style uses are passed in. A check that cannot be made because the
 * document does not hold what it needs fails and says what is missing, never passes by default.
 */
export function runChecks(doc: Obj, files: Map<string, UsedFile>): CheckResult[] {
  const scenes = obj(doc.scenes);
  const sceneList = Object.entries(scenes).map(([k, v]) => [k, obj(v)] as const);
  const tags = obj(doc.tags);
  const made = obj(doc.made);
  const theme = doc.theme;
  const out: CheckResult[] = [];

  // 1 every required chapter shown for each claimed occasion
  const claimed = Array.isArray(tags.occasions) ? tags.occasions.map((x) => ({ occasion: String(x), chapters: [] as string[] })) : Object.entries(obj(tags.occasions)).map(([occasion, c]) => ({ occasion, chapters: arr(c).map(String) }));
  const missing = claimed.flatMap((c) => c.chapters.filter((ch) => !(ch in scenes)).map((ch) => `${c.occasion}: ${ch}`));
  if (!sceneList.length) out.push(no("chapters", "The style has no scenes yet."));
  else if (missing.length) out.push(no("chapters", `A chapter is missing for ${missing.slice(0, 3).join(", ")}.`));
  else out.push(ok("chapters", claimed.length ? `Every chapter is there for ${claimed.length} occasion${claimed.length === 1 ? "" : "s"}.` : "No occasion is claimed."));

  // 2 readable
  if (isObj(theme)) {
    const words = contrast(theme.ink ?? theme.text ?? theme.fg, theme.ground ?? theme.bg ?? theme.background);
    const quiet = theme.quiet === undefined ? null : contrast(theme.quiet, theme.ground ?? theme.bg ?? theme.background);
    if (words === null) out.push(no("readable", "The theme has no text and ground colours to measure."));
    else if (words < READABLE) out.push(no("readable", `Words have ${one(words)}:1 contrast; they need ${READABLE}:1.`));
    else if (quiet !== null && quiet < QUIET) out.push(no("readable", `Quiet words have ${one(quiet)}:1 contrast; they need ${QUIET}:1.`));
    else out.push(ok("readable", `Words have ${one(words)}:1 contrast.`));
  } else out.push(typeof theme === "string" && theme ? ok("readable", "Uses one of Firstwish's own themes.") : no("readable", "The style has no theme."));

  // 3 smooth on a budget phone
  const used = [...files.values()];
  const total = used.reduce((s, f) => s + f.bytes, 0);
  const overMoving = sceneList.filter(([, s]) => arr(s.moving ?? s.effects).length > MOVING_MAX).map(([k]) => k);
  const overAdded = sceneList.filter(([, s]) => arr(s.added).length > ADDED_MAX).map(([k]) => k);
  if (total > SMOOTH_FILES_MAX) out.push(no("smooth", "The style's files weigh more than 2.5 MB together."));
  else if (overMoving.length) out.push(no("smooth", `More than ${MOVING_MAX} moving effects in ${overMoving[0]}.`));
  else if (overAdded.length) out.push(no("smooth", `More than ${ADDED_MAX} added things in ${overAdded[0]}.`));
  else out.push(ok("smooth", "Light enough for a budget phone."));

  // 4 a still version for reduced motion
  out.push(typeof doc.still === "string" && doc.still.trim() ? ok("still", "Has a still version.") : no("still", "Choose a still version for reduced motion."));

  // 5 holds in Portrait and Landscape
  const holds = obj(doc.holds);
  const both = (holds.portrait === true && holds.landscape === true) || made.orientation === "both";
  out.push(both ? ok("holds", "Holds in Portrait and Landscape.") : no("holds", "Check the style in both Portrait and Landscape."));

  // 6 a flat fallback for Drawn and 3D styles
  const dimension = typeof made.dimension === "string" ? made.dimension.toLowerCase() : "";
  const needsFlat = dimension === "drawn" || dimension === "3d";
  if (!needsFlat) out.push(ok("fallback", "Flat style: no fallback needed."));
  else out.push(typeof doc.fallback === "string" && doc.fallback.trim() ? ok("fallback", "Has a flat fallback.") : no("fallback", "A Drawn or 3D style needs a flat fallback."));

  // 7 the ending works by touch
  out.push(typeof doc.ending === "string" && doc.ending.trim() ? ok("touch", "The ending works by touch.") : no("touch", "Choose an ending that works by touch."));

  // 8 safe: size of each file
  const wanted = fileIdsOf(doc);
  const unknown = wanted.filter((id) => !files.has(id));
  const tooBig = used.find((f) => f.kind !== null && FILE_MAX[f.kind] !== undefined && f.bytes > FILE_MAX[f.kind]);
  if (unknown.length) out.push(no("safe", "A file in the style is missing or is not yours."));
  else if (tooBig) out.push(no("safe", `A ${tooBig.kind} is over ${Math.round(FILE_MAX[tooBig.kind!] / 1024)} KB.`));
  else out.push(ok("safe", "Every file is within its size."));
  return out;
}

export const allPass = (checks: CheckResult[]): boolean => checks.length === CHECK_KEYS.length && checks.every((c) => c.pass);
