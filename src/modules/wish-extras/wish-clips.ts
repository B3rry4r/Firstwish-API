import type { Entitlements as EntitlementsRow, Prisma } from "@prisma/client";
import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { ClipLengthPort, ClipToolUnavailable } from "../../common/ports/clip-length.port";
import { isPortTimeout } from "../../common/ports/time-limit";
import { grantOf } from "../price-book/entitlements.service";
import { addsFor } from "./wish-adds";

/**
 * IL1a: the video clips a wish may hold, read from the entitlements book (never a number in code). The ticket's own grant says how many clips it gives and
 * how long each may be (`clips`, `clipSeconds`); each extra the wish still holds adds its own places (`clips`, `clipSeconds`: one more 15-second clip, one long
 * clip of up to 60 seconds). A place is a length; a set of clips fits when each clip can take a place at least as long as itself.
 */
export const CLIP_SLACK_MS = 500; // a clip of 15.4 seconds is a 15-second clip: containers and encoders round a little

type Db = Pick<Prisma.TransactionClient, "purchaseGrant" | "$queryRaw">;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The places a wish may fill, each as a length in seconds, longest first. A wish with no ticket is on the moment line (no clips). */
export function clipSlots(book: EntitlementsRow, ticket: string | null, heldSkus: readonly string[]): number[] {
  const own = grantOf(book, `ticket.${ticket ?? "moment"}`);
  const out: number[] = [];
  if ((num(own?.clips) ?? 0) <= 0) return out; // T-08: video is on Premiere only; no extra gives a clip to a ticket that has none
  const seconds = num(own?.clipSeconds) ?? 0;
  for (let i = 0; i < (num(own?.clips) ?? 0); i++) out.push(seconds);
  for (const sku of heldSkus) {
    const g = sku.startsWith("extra.") ? grantOf(book, sku) : null;
    const n = num(g?.clips) ?? 0;
    for (let i = 0; i < n; i++) out.push(num(g?.clipSeconds) ?? seconds);
  }
  return out.sort((a, b) => b - a);
}

/** What the wish read says: how many clips and the length each place takes (the web draws no number of its own). */
export interface ClipLimits {
  count: number;
  seconds: number[];
}
export const clipLimitsOf = (slots: readonly number[]): ClipLimits => ({ count: slots.length, seconds: [...slots] });

/** The extras of a wish that give clip places and that the wish still holds (a refund that was sent no longer counts, IJ3a): one query for the wish. */
export async function heldClipSkus(db: Db, book: EntitlementsRow, w: { id: string; ticket: string | null; adds: unknown }): Promise<string[]> {
  const holds = (await addsFor(db, book, [w])).get(w.id) ?? [];
  return holds.filter((h) => h.held && (num(grantOf(book, h.sku)?.clips) ?? 0) > 0).map((h) => h.sku);
}

export interface HeldClip {
  id: string;
  lengthMs: number | null;
  /** how the words name this clip, so the person knows which to remove */
  label?: string;
  /** a confirm still in flight (status uploaded): it takes a place but its length is judged by its own confirm, never here */
  inFlight?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const labelOf = (id: string, at: Date): string => `the clip added on ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()} (ref ${id.slice(-6)})`;

/** L6: the server's own tool is missing or timed out: 503 with words to try again later, never the words for a bad file. */
export const clipToolDown = (): AppError => new AppError(HttpStatus.SERVICE_UNAVAILABLE, "clip_check_unavailable", "We cannot check video clips right now. Nothing was kept. Try again later.");

/** Reads a clip's length through the port: a number, or null for a file that has no length or no picture (a bad file); a missing or timed-out tool is a 503. */
export async function readClipLength(port: ClipLengthPort, input: { key: string; contentType: string }): Promise<number | null> {
  try {
    return await port.lengthMs(input);
  } catch (e) {
    if (e instanceof ClipToolUnavailable || isPortTimeout(e)) throw clipToolDown();
    throw e;
  }
}

/**
 * M2: a clip stored before lengths were read has no length. It is read when first needed (the next confirm, the seal, the ticket start) and kept; a clip whose
 * file cannot be read stays as it is and is named in the words, and nothing is removed. Only clips that arrived (screening or ready) of this wish are read.
 */
export async function fillClipLengths(db: Pick<Db, "$queryRaw">, port: ClipLengthPort, wishId: string): Promise<void> {
  const rows = await db.$queryRaw<{ id: string; objectKey: string; contentType: string }[]>`
    SELECT f.id::text AS id, f."objectKey" AS "objectKey", f."contentType" AS "contentType" FROM stored_file f
     WHERE f.purpose::text = 'video-clip' AND f."keptAt" IS NULL AND f."lengthMs" IS NULL AND f.status::text IN ('screening', 'ready')
       AND (f.id IN (SELECT t.id FROM upload_ticket t WHERE t."subjectId" = ${wishId} AND t.purpose = 'video-clip')
            OR f.id IN (SELECT w."fileId" FROM wish_file w WHERE w."wishId" = ${wishId}::uuid AND w.role::text = 'clip'))`;
  for (const r of rows) {
    const ms = await readClipLength(port, { key: r.objectKey, contentType: r.contentType });
    if (ms !== null) await db.$queryRaw`UPDATE stored_file SET "lengthMs" = ${ms}::int WHERE id = ${r.id}::uuid AND "lengthMs" IS NULL`;
  }
}

/**
 * The clips a wish holds: every clip file that arrived for it (uploaded, being screened or ready) by an upload made for this wish, and every clip file its
 * content names. With `pendingSince` an upload ticket not yet confirmed and made after that time holds its place too, so twenty uploads at once cannot pass the
 * limit. `except` leaves one file out (the one being confirmed). `confirmed` keeps only clips that have been through their own confirm (screening or ready):
 * confirms of one wish are judged one after another under the account lock, each against the confirmed clips plus itself.
 */
export async function readHeldClips(db: Pick<Db, "$queryRaw">, wishId: string, opts: { pendingSince?: Date; except?: string; confirmed?: boolean } = {}): Promise<HeldClip[]> {
  const since = opts.pendingSince ?? null;
  const except = opts.except ?? null;
  const states = opts.confirmed ? ["screening", "ready"] : ["uploaded", "screening", "ready"];
  const rows = await db.$queryRaw<{ id: string; lengthMs: number | null; status: string; createdAt: Date }[]>`
    SELECT f.id::text AS id, f."lengthMs" AS "lengthMs", f.status::text AS status, f."createdAt" AS "createdAt" FROM stored_file f
     WHERE f.purpose::text = 'video-clip' AND f."keptAt" IS NULL AND (${except}::uuid IS NULL OR f.id <> ${except}::uuid)
       AND (f.status::text = ANY(${states}::text[]) OR (${since}::timestamptz IS NOT NULL AND f.status::text = 'pending' AND f."createdAt" >= ${since}::timestamptz))
       AND (f.id IN (SELECT t.id FROM upload_ticket t WHERE t."subjectId" = ${wishId} AND t.purpose = 'video-clip')
            OR f.id IN (SELECT w."fileId" FROM wish_file w WHERE w."wishId" = ${wishId}::uuid AND w.role::text = 'clip'))`;
  return rows.map((r) => ({ id: r.id, lengthMs: r.lengthMs, label: labelOf(r.id, r.createdAt), inFlight: r.status === "uploaded" || r.status === "pending" }));
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The places in words: "up to 15 seconds each" or "up to 15 seconds each, and one of up to 60 seconds". */
export function slotsInWords(slots: readonly number[]): string {
  if (slots.length === 0) return "none";
  const base = slots[slots.length - 1];
  const longer = slots.filter((s) => s > base);
  if (longer.length === 0) return `${plural(slots.length, "clip", "clips")} of up to ${base} seconds`;
  return `${plural(slots.length - longer.length, "clip", "clips")} of up to ${base} seconds and ${longer.map((s) => `one of up to ${s} seconds`).join(", ")}`;
}

/**
 * Whether the clips fit the places. null when they do; else the words, which say what to remove. Too many is judged first; then the length of each clip
 * against the place it must take (the longest clip the longest place). A clip whose length is not known is refused (it was never read from its file).
 */
export function clipRefusal(slots: readonly number[], clips: readonly { lengthMs: number | null; label?: string; inFlight?: boolean }[], ticket: string | null): string | null {
  const name = ticket ?? "moment";
  const n = clips.length;
  if (n > slots.length) {
    const over = n - slots.length;
    return `This wish holds ${plural(n, "clip", "clips")} and the ${name} ticket gives ${slotsInWords(slots)}. Remove ${plural(over, "clip", "clips")} to go on.`;
  }
  const named = (list: readonly { label?: string }[]): string => (list.every((c) => !c.label) ? plural(list.length, "clip", "clips") : list.map((c) => c.label ?? "a clip").join(", "));
  // a clip still arriving is judged by its own confirm; it holds a place (counted above) but takes no part in the length test
  const judged = clips.filter((c) => !c.inFlight);
  const unknown = judged.filter((c) => c.lengthMs === null);
  if (unknown.length > 0) return `The length of ${named(unknown)} could not be read from the file. Remove ${unknown.length === 1 ? "it" : "them"} to go on.`;
  const sorted = judged.map((c) => c).sort((a, b) => (b.lengthMs as number) - (a.lengthMs as number));
  const tooLong = sorted.filter((c, i) => (c.lengthMs as number) > slots[i] * 1000 + CLIP_SLACK_MS);
  if (tooLong.length === 0) return null;
  return `${named(tooLong)} ${tooLong.length === 1 ? "is" : "are"} longer than this wish may hold: the ${name} ticket gives ${slotsInWords(slots)}. Remove ${tooLong.length === 1 ? "it" : "them"} or send a shorter clip.`;
}

/**
 * IL1a: a ticket being bought for a wish that already holds clips: refused when the wish holds more clips, or a longer clip, than that ticket gives (so a ticket
 * change downward is refused too). `clips` may be read once for every ticket. null when it fits.
 */
export async function assessTicketClips(db: Pick<Db, "$queryRaw">, book: EntitlementsRow, w: { id: string; adds: readonly string[] }, ticket: string, clips?: readonly HeldClip[]): Promise<{ reason: string; words: string } | null> {
  const held = clips ?? (await readHeldClips(db, w.id));
  if (held.length === 0) return null;
  const words = clipRefusal(clipSlots(book, ticket, w.adds), held, ticket);
  return words ? { reason: "clips_above_ticket", words } : null;
}
