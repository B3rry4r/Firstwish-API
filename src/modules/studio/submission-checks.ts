import { arr, obj, type Obj } from "./studio-doc";
import { RECIPES } from "./studio-recipes";

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

/** One place where a document names a file: the words that name the place, the field path for an error, and what was written there. */
export interface FileRef {
  place: string;
  path: string;
  value: string;
}

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What is written in a place: the text, "" for nothing, and a mark no id can match for anything that is not text. */
const written = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "string" ? v.trim() : "\u0000");

/**
 * II5: every place a style document names a file, found in one function so the save, the send-in, the checks and the kept-file rule
 * (II4) can never disagree. The places: an item of the art list (`fileId`, or `id` when it is an id), the poster (`fileId`, `id`, `src`),
 * the sound, a scene's background picture (`backdrop`), and a thing a scene adds: its artwork or 3D model (`what`) and a picture fill
 * (`fill.art`). A name that is the `id` of an art item with its own file is that item (checked there), not a second place.
 */
export function fileRefsOf(doc: Obj): FileRef[] {
  const out: FileRef[] = [];
  const art = arr(doc.art).map(obj);
  const artIds = new Set(art.flatMap((a) => (typeof a.id === "string" && a.fileId !== undefined && a.fileId !== null ? [a.id] : [])));
  const add = (place: string, path: string, v: unknown, viaArt = false): void => {
    const value = written(v);
    if (!value || (viaArt && artIds.has(value))) return;
    out.push({ place, path, value });
  };
  art.forEach((a, i) => {
    add(`The art list, item ${i + 1}`, `style.art.${i}.fileId`, a.fileId);
    if (typeof a.id === "string" && FILE_ID.test(a.id.trim())) add(`The art list, item ${i + 1}`, `style.art.${i}.id`, a.id);
  });
  const poster = obj(doc.poster);
  for (const k of ["fileId", "id", "src"]) add("The poster", `style.poster.${k}`, poster[k]);
  add("The sound", "style.sound", doc.sound, true);
  for (const [sk, sv] of Object.entries(obj(doc.scenes))) {
    const scene = obj(sv);
    const name = sk === "*" ? "Every scene" : `Scene ${sk}`;
    add(`${name}, its background picture`, `style.scenes.${sk}.backdrop`, scene.backdrop, true);
    arr(scene.added).forEach((x, j) => {
      const a = obj(x);
      const here = `${name}, added thing ${j + 1}`;
      if (a.kind === "artwork") add(`${here} (artwork)`, `style.scenes.${sk}.added.${j}.what`, a.what, true);
      else if (a.kind === "model") add(`${here} (3D model)`, `style.scenes.${sk}.added.${j}.what`, a.what, true);
      add(`${here} (picture fill)`, `style.scenes.${sk}.added.${j}.fill.art`, obj(a.fill).art, true);
    });
  }
  return out;
}

/**
 * II4/II5: the document without any name of this file, or null when it names none. A removed file leaves the creator's draft: its art item,
 * the poster's and the sound's name, a scene's background picture, and a thing that is made of it (artwork or model) or filled with it go.
 */
export function withoutFile(doc: Obj, fileId: string): Obj | null {
  const id = fileId.toLowerCase();
  const is = (v: unknown): boolean => typeof v === "string" && v.trim().toLowerCase() === id;
  const artIds = new Set(arr(doc.art).map(obj).filter((a) => is(a.fileId) || is(a.id)).map((a) => a.id).filter((x): x is string => typeof x === "string"));
  const names = (v: unknown): boolean => is(v) || (typeof v === "string" && artIds.has(v));
  let changed = false;
  const out: Obj = { ...doc };
  if (Array.isArray(doc.art)) {
    const art = doc.art.filter((a) => !(is(obj(a).fileId) || is(obj(a).id)));
    if (art.length !== doc.art.length) {
      out.art = art;
      changed = true;
    }
  }
  if (isObjLike(doc.poster) && ["fileId", "id", "src"].some((k) => is(obj(doc.poster)[k]))) {
    const poster = { ...obj(doc.poster) };
    for (const k of ["fileId", "id", "src"]) if (is(poster[k])) delete poster[k];
    out.poster = poster;
    changed = true;
  }
  if (names(doc.sound)) {
    delete out.sound;
    changed = true;
  }
  if (isObjLike(doc.scenes)) {
    const scenes: Obj = {};
    for (const [k, v] of Object.entries(obj(doc.scenes))) {
      const scene = { ...obj(v) };
      if (names(scene.backdrop)) {
        delete scene.backdrop;
        changed = true;
      }
      if (Array.isArray(scene.added)) {
        const added = (scene.added as unknown[])
          .filter((x) => !((obj(x).kind === "artwork" || obj(x).kind === "model") && names(obj(x).what)))
          .map((x): unknown => {
            if (!names(obj(obj(x).fill).art)) return x;
            const { fill: _fill, ...rest } = obj(x);
            return rest;
          });
        if (added.length !== scene.added.length || added.some((x, i) => x !== (scene.added as unknown[])[i])) {
          scene.added = added;
          changed = true;
        }
      }
      scenes[k] = scene;
    }
    out.scenes = scenes;
  }
  return changed ? out : null;
}
const isObjLike = (v: unknown): boolean => typeof v === "object" && v !== null && !Array.isArray(v);

/** The file ids a document names, in any of those places (what is not an id is left out; see fileRefsOf). */
export function fileIdsOf(doc: Obj): string[] {
  return [...new Set(fileRefsOf(doc).filter((r) => FILE_ID.test(r.value)).map((r) => r.value))];
}

/** Colour arithmetic as the web app does it (lib/studio.ts rgb, lum, contrast): any CSS colour, rgb() too; what it cannot read is black. */
const rgb = (c: string): [number, number, number] => {
  const s = c.trim();
  const fn = s.match(/rgba?\(([^)]+)\)/i);
  if (fn) {
    const [r, g, b] = fn[1].split(/[\s,/]+/).map(Number);
    return [r || 0, g || 0, b || 0];
  }
  let h = s.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (c: string): number => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two colours. */
export const contrast = (a: string, b: string): number => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const isHex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);

/** The looks of the house scene sets (web lib/studio.ts HOUSE_LOOK, the colours only), and the blank start. */
type Look = Record<string, string>;
const HOUSE_LOOK: Record<string, Look> = {
  noir: { ground: "#0d0a09", ground2: "#22160f", ink: "#f1e7dc", muted: "#a8968a", accent: "#c8693a", soft: "#e3a37c" },
  letter: { ground: "#efe5d3", ground2: "#f8f1e3", ink: "#2b2119", muted: "#7a6a5c", accent: "#8b1e2d", soft: "#8b1e2d" },
  golden: { ground: "#f6c9a2", ground2: "#ffe3c2", ink: "#3a1733", muted: "#7d4f55", accent: "#c4532f", soft: "#b0432b" },
  grace: { ground: "#f6f3ea", ground2: "#fffdf6", ink: "#2c2a25", muted: "#77736a", accent: "#a17f2a", soft: "#8a6d1f" },
  pidgin: { ground: "#ffd400", ground2: "#ffe24d", ink: "#111111", muted: "#4a4320", accent: "#111111", soft: "#111111" },
  owambe: { ground: "#0a2c23", ground2: "#124236", ink: "#f8ecc8", muted: "#a9b59c", accent: "#f1c75b", soft: "#f1c75b" },
  cinema: { ground: "#000000", ground2: "#141414", ink: "#f5f5f5", muted: "#9a9a9a", accent: "#ff4b63", soft: "#ff4b63" },
  reel: { ground: "#050404", ground2: "#15110e", ink: "#f5eee6", muted: "#a59a8f", accent: "#c8693a", soft: "#e8b48f" },
  status: { ground: "#0d0a09", ground2: "#12241b", ink: "#f4ece2", muted: "#a89f95", accent: "#c8693a", soft: "#f0b58c" },
  gallery: { ground: "#f7f2ea", ground2: "#171310", ink: "#231b15", muted: "#74685d", accent: "#9a5a33", soft: "#e7b48c" },
  blank: { ground: "#f4eee4", ground2: "#ebe2d4", ink: "#221c17", muted: "#6b5f55", accent: "#a5462a", soft: "#c98a6c" },
};
export const BLANK = "blank";
/** The effects that do not count against the budget (web FX with `calm`). */
const CALM = new Set(["glow", "spotlight", "vignette"]);
/** The marked words a creator can change; their sort is "words" for these three (web LAYERS). */
const WORD_LAYERS = new Set(["title", "words", "eyebrow"]);
const LAYER_WORDS = new Set([...WORD_LAYERS, "photo", "ground", "action"]);
const ALL = "*";

/** What the checks need to know of a scene set (its Template row, and the occasions its catalogue Style names). */
export interface Manifest {
  slug: string;
  dimension: string;
  kinds: string[];
  occasions?: Record<string, string[]> | null;
}

// ---- the recipes (web lib/occasions.ts): which kinds share which, and the chapters each occasion locks
const POOLS = new Set(["love", "celebration", "group", "wedding", "teams", "photographers"]);
const SHARES: Record<string, string[]> = { planners: ["wedding"], vendors: ["love", "celebration"] };
const ALIAS: Record<string, string> = { "table-cards": "our-story", "table cards": "our-story" };
const norm = (s: string): string => s.trim().toLowerCase().replace(/[\u2019']/g, "'");
const baseKinds = (kind: string): string[] => (POOLS.has(kind) ? [kind] : (SHARES[kind] ?? ["love"]));
interface Recipe {
  kind: string;
  slug: string;
  name: string;
  required: { type: string; title: string }[];
}
const occasionsOf = (kind: string): Recipe[] =>
  baseKinds(kind).flatMap((k) => (RECIPES[k] ?? []).map(([slug, name, req]): Recipe => ({ kind: k, slug, name, required: req.map(([type, title]) => ({ type, title })) })));
const findRecipe = (kind: string, occasion: string): Recipe | undefined => {
  const o = ALIAS[norm(occasion)] ?? norm(occasion);
  return occasionsOf(kind).find((r) => r.slug === o || norm(r.name) === o);
};
const fits = (m: Manifest, kind: string, occasion?: string): boolean =>
  baseKinds(kind).some((k) => {
    if (!m.kinds.includes(k)) return false;
    const only = m.occasions?.[k];
    if (!only || !occasion) return true;
    const r = findRecipe(k, occasion);
    return !!r && only.includes(r.slug);
  });
const kindName = (slug: string): string => slug.charAt(0).toUpperCase() + slug.slice(1);

/** A mark key "<word>#<n>" or a bare known word, as the web app reads it (parseMark): the word, or null when it is neither. */
const markWord = (key: string): string | null => {
  const i = key.lastIndexOf("#");
  if (i < 0) return LAYER_WORDS.has(key) ? key : null;
  return key.slice(0, i);
};

/** A ratio to one decimal, as text. */
const one = (n: number): string => String(Math.round(n * 10) / 10);
const ok = (key: CheckKey, detail: string): CheckResult => ({ key, pass: true, detail });
const no = (key: CheckKey, detail: string): CheckResult => ({ key, pass: false, detail });
const kb = (n: number): string => (n >= 1024 * 1024 ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB` : `${Math.round(n / 1024)} KB`);

/** The scene sets the checks read besides the document: the style's own base, and its flat fallback. A missing one is undefined. */
export interface Bases {
  base?: Manifest;
  fallback?: Manifest;
}

/** The colours a theme document holds, as text values only. */
function colours(v: unknown): Look {
  const out: Look = {};
  for (const [k, c] of Object.entries(obj(v))) if (typeof c === "string") out[k] = c;
  return out;
}

/**
 * The eight checks over a frozen draft: the web app's own `checks` function (Firstwish-web lib/studio.ts), rule for rule (XX1, SA2).
 * Pure: the files the style uses and the scene sets are passed in. The server's keys stay "holds" and "touch" (the web calls them
 * orient and ending). What stays stricter on the server: a file that is not in the account's ready files fails "safe", and the
 * weight of files is the stored size, not the size the document claims. A piece (an opening or an ending made alone) skips the
 * checks the web skips: its skipped checks are recorded as passed, so the eight results are always there.
 */
export function runChecks(doc: Obj, files: Map<string, UsedFile>, bases: Bases = {}): CheckResult[] {
  const base = typeof doc.base === "string" ? doc.base : "";
  const blank = base === BLANK;
  const m: Manifest | undefined = bases.base ?? (blank ? { slug: BLANK, dimension: "flat", kinds: [] } : undefined);
  const made = obj(doc.made);
  const kinds = arr(made.kinds).filter((k): k is string => typeof k === "string");
  const scenes = Object.entries(obj(doc.scenes)).map(([k, v]) => [k, obj(v)] as const);
  const sceneOf = (k: string): Obj => obj(obj(doc.scenes)[k]);
  const out: CheckResult[] = [];
  const whole = doc.piece === undefined || doc.piece === null || doc.piece === "" || doc.piece === "style";
  const skipped = (key: CheckKey): CheckResult => ok(key, "Not needed for a piece.");

  // 1 every required chapter of every claimed occasion is shown (and a kind is chosen)
  if (!whole) out.push(skipped("chapters"));
  else if (!m) out.push(no("chapters", "Start from a scene set."));
  else {
    const missing: string[] = [];
    const shown: string[] = [];
    const only = obj(made.occasions);
    for (const k of kinds) {
      const all = occasionsOf(k).filter((r) => r.kind === k && (!bases.base || fits(bases.base, k, r.slug)));
      const picked = arr(only[k]).filter((x): x is string => typeof x === "string");
      const claimed = picked.length ? all.filter((r) => picked.includes(r.slug)) : all;
      for (const r of claimed) {
        const hidden = r.required.filter((c) => {
          const ls = obj(sceneOf(c.type).layers);
          return obj(ls.title).hidden === true && obj(ls.words).hidden === true;
        });
        if ((!blank && !fits(m, k, r.slug)) || hidden.length) missing.push(`${kindName(k)}, ${r.name}${hidden.length ? `: ${hidden.map((c) => c.title).join(", ")} hidden` : ""}`);
        else shown.push(`${kindName(k)}, ${r.name}`);
      }
    }
    if (!kinds.length) out.push(no("chapters", "Choose at least one kind in Made for."));
    else if (missing.length) out.push(no("chapters", `Not shown: ${missing.slice(0, 2).join("; ")}${missing.length > 2 ? ` and ${missing.length - 2} more` : ""}.`));
    else if (!shown.length) out.push(no("chapters", "No occasion claimed."));
    else out.push(ok("chapters", `Every required chapter is shown for ${shown.length} occasion${shown.length === 1 ? "" : "s"}.`));
  }

  // 2 readable: words at 4.5 : 1, quiet words at 3 : 1, on the background they sit on
  const look: Look = { ...(HOUSE_LOOK[base] ?? HOUSE_LOOK.noir), ...(blank ? {} : colours(doc.seen)), ...colours(doc.theme) };
  const colourOf = (c: unknown): string | undefined => (typeof c !== "string" || !c ? undefined : isHex(c) ? c : look[c]);
  const low: { n: string; r: number; need: number }[] = [];
  const test = (n: string, a: string | undefined, b: string | undefined, need: number): void => {
    if (a && b) {
      const r = contrast(a, b);
      if (r < need) low.push({ n, r, need });
    }
  };
  test("Words on the background", look.ink, look.ground, READABLE);
  test("Quiet words on the background", look.muted, look.ground, QUIET);
  let small = false;
  for (const [, s] of scenes) {
    const own = typeof s.ground === "string" && s.ground ? s.ground : undefined;
    const ground = own ?? look.ground;
    if (own) test("Words on this scene's background", look.ink, own, READABLE);
    for (const [lk, l] of Object.entries(obj(s.layers))) {
      const word = markWord(lk);
      if (!word || !WORD_LAYERS.has(word)) continue;
      const lo = obj(l);
      if (lo.colour) test(`The ${word === "eyebrow" ? "label" : word}'s colour`, colourOf(lo.colour), ground, word === "eyebrow" ? QUIET : READABLE);
      if ((typeof lo.size === "number" ? lo.size : 100) < 80) small = true;
    }
  }
  if (low.length) out.push(no("readable", `${low[0].n} is ${one(low[0].r)} : 1. It needs ${low[0].need} : 1.`));
  else if (small) out.push(no("readable", "Some words are set below 80%. Keep them at 14px or more."));
  else out.push(ok("readable", `Words have ${one(contrast(look.ink, look.ground))}:1 contrast.`));

  // 3 smooth on a budget phone: only effects that are not calm count
  const used = [...files.values()];
  const total = used.reduce((n, f) => n + f.bytes, 0);
  const every = arr(sceneOf(ALL).added).map(obj);
  const heavy = scenes.find(([k, s]) => {
    const list = k === ALL ? every : [...arr(s.added).map(obj), ...every];
    return list.filter((a) => a.kind === "effect" && !(typeof a.what === "string" && CALM.has(a.what))).length > MOVING_MAX || list.length > ADDED_MAX;
  });
  if (total > SMOOTH_FILES_MAX) out.push(no("smooth", `Your files add up to ${kb(total)}. Keep them under ${kb(SMOOTH_FILES_MAX)}.`));
  else if (heavy) out.push(no("smooth", `One scene has too much added. Keep it to ${ADDED_MAX} things and ${MOVING_MAX} moving effects.`));
  else out.push(ok("smooth", "Light enough for a budget phone."));

  // 4 a still version for reduced motion
  out.push(typeof doc.still === "string" && doc.still.length > 0 ? ok("still", "Has a still version.") : no("still", "Choose what plays when a phone asks for less motion."));

  // 5 holds in Portrait and Landscape: the web writes "bars", "fills" or "breaks" for each
  const holds = obj(doc.holds);
  const broke = (["portrait", "landscape"] as const).filter((b) => holds[b] === "breaks");
  const looked = !!holds.portrait && !!holds.landscape;
  if (broke.length) out.push(no("holds", `It breaks in ${broke.map((b) => (b === "portrait" ? "Portrait" : "Landscape")).join(" and ")}. Something runs off the screen.`));
  else if (!looked) out.push(no("holds", "Open Checks once so both are looked at."));
  else out.push(ok("holds", "Holds in Portrait and Landscape."));

  // 6 a flat fallback for a scene set that is not flat
  if (!whole) out.push(skipped("fallback"));
  else {
    const needs = !m || m.dimension !== "flat";
    const fb = typeof doc.fallback === "string" && doc.fallback ? bases.fallback : undefined;
    if (!needs) out.push(ok("fallback", "No fallback needed."));
    else if (!!m && !!fb && fb.dimension === "flat") out.push(ok("fallback", "Has a flat fallback."));
    else out.push(no("fallback", "Drawn and 3D scenes need a flat style for phones that cannot run them."));
  }

  // 7 the ending works by touch: it fails only when the ending's action is hidden
  if (!whole && doc.piece !== "ending") out.push(skipped("touch"));
  else {
    const hidden = Object.entries(obj(sceneOf("ending").layers)).some(([k, l]) => markWord(k) === "action" && obj(l).hidden === true);
    out.push(hidden ? no("touch", "The ending's action is hidden. Show it so it can be tapped.") : ok("touch", "The ending works by touch."));
  }

  // 8 safe: only the file kinds allowed, each within its size; stricter here: every file must be one of the account's ready files
  const unknown = fileIdsOf(doc).filter((id) => !files.has(id));
  const tooBig = used.find((f) => f.kind !== null && FILE_MAX[f.kind] !== undefined && f.bytes > FILE_MAX[f.kind]);
  if (unknown.length) out.push(no("safe", "A file in the style is missing or is not yours."));
  else if (tooBig) out.push(no("safe", `A ${tooBig.kind} is ${kb(tooBig.bytes)}. Keep it under ${kb(FILE_MAX[tooBig.kind!])}.`));
  else out.push(ok("safe", "Every file is within its size."));
  return out;
}

export const allPass = (checks: CheckResult[]): boolean => checks.length === CHECK_KEYS.length && checks.every((c) => c.pass);
