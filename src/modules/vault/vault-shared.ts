import type { Prisma } from "@prisma/client";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Tx = Prisma.TransactionClient;
export type SetName = "proofs" | "finals";
export const SETS: readonly SetName[] = ["proofs", "finals"];
/** The most files one add may name. */
export const MAX_FILES_PER_ADD = 200;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

/** The name a Vault file shows under (the same as the Vault file list, E-214): the name the business gave it (IB3), else the server's own. */
export const fileName = (id: string, contentType: string, shown?: string | null): string => shown || `vault-${id.slice(-12)}.${EXT[contentType] ?? "bin"}`;

/** A json column read as a list of file ids (anything else in it is dropped). */
export const idsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && UUID.test(x)) : []);

/**
 * IC6: a name is plain text. Control characters, direction-override and direction-isolate marks and the invisible joiners are removed (the
 * rest of the text stays), runs of white space become one space, and the ends are trimmed. A name that is dots alone is refused by the caller
 * with `dotsOnly`.
 */
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
export const plainName = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(HIDDEN, "").replace(/ {2,}/g, " ").trim() : "");
export const dotsOnly = (name: string): boolean => /^[. ]+$/.test(name);

export const monthOf = (d: Date): string => d.toISOString().slice(0, 7);

/** Most photo positions one reveal link keeps marked (IB1). */
export const MAX_HEARTS = 200;

/** IC2: the positions (in the link's file list) of the marked files that are still in the list, in order. A heart is a file id; a place is only how the page names it. */
export const heartPositions = (fileIds: unknown, hearts: readonly string[] | null | undefined): number[] => {
  const marked = new Set((hearts ?? []).map((h) => h.toLowerCase()));
  return idsOf(fileIds).flatMap((id, pos) => (marked.has(id.toLowerCase()) ? [pos] : []));
};

/**
 * IB1, IC2: the marks of a reveal link written to what the business reads. The link holds the ids of the marked files. The client wish carries
 * their positions as the link's files stand now; the shoot carries the file ids marked at any of its links, in file-id order, so one shoot
 * read shows every heart.
 */
export async function syncHearts(tx: Tx, linkId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE client_wish SET hearts = COALESCE((
        SELECT jsonb_agg((e.ord - 1)::int ORDER BY e.ord)
          FROM reveal_access a, jsonb_array_elements_text(a."fileIds") WITH ORDINALITY AS e(id, ord)
         WHERE a."linkId" = ${linkId}::uuid AND e.id::uuid = ANY(a.hearts)), '[]'::jsonb)
     WHERE id = (SELECT "wishId" FROM reveal_access WHERE "linkId" = ${linkId}::uuid)`;
  await syncShootHearts(tx, linkId);
}

export async function syncShootHearts(tx: Tx, linkId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE shoot SET hearts = COALESCE((
        SELECT jsonb_agg(f.id ORDER BY f.id) FROM (SELECT DISTINCT h::text AS id FROM reveal_access a, unnest(a.hearts) AS h WHERE a."shootId" = shoot.id) f), '[]'::jsonb)
     WHERE id = (SELECT "shootId" FROM reveal_access WHERE "linkId" = ${linkId}::uuid)`;
}

/** IC2: a file that is removed takes its heart with it, at every link that holds it; what the business reads follows in the same transaction. */
export async function dropFileHearts(tx: Tx, fileId: string): Promise<void> {
  const links = await tx.$queryRaw<{ linkId: string }[]>`
    UPDATE reveal_access SET hearts = array_remove(hearts, ${fileId}::uuid) WHERE ${fileId}::uuid = ANY(hearts) RETURNING "linkId"::text AS "linkId"`;
  for (const l of links) await syncHearts(tx, l.linkId);
}
