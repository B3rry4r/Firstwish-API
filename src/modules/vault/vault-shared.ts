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

export const monthOf = (d: Date): string => d.toISOString().slice(0, 7);

/** Most photo positions one reveal link keeps marked (IB1). */
export const MAX_HEARTS = 200;

/**
 * IB1: the marks of a reveal link written to what the business reads. The client wish carries the positions (as the link's files stand);
 * the shoot carries the file ids marked at any of its links, in file-id order, so one shoot read shows every heart.
 */
export async function syncHearts(tx: Tx, linkId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE client_wish SET hearts = (SELECT to_jsonb(a.hearts) FROM reveal_access a WHERE a."linkId" = ${linkId}::uuid)
     WHERE id = (SELECT "wishId" FROM reveal_access WHERE "linkId" = ${linkId}::uuid)`;
  await syncShootHearts(tx, linkId);
}

export async function syncShootHearts(tx: Tx, linkId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE shoot SET hearts = COALESCE((
        SELECT jsonb_agg(f.id ORDER BY f.id) FROM (
          SELECT DISTINCT x.ids ->> x.h AS id FROM (SELECT a."fileIds" AS ids, unnest(a.hearts) AS h FROM reveal_access a WHERE a."shootId" = shoot.id) x
        ) f WHERE f.id IS NOT NULL), '[]'::jsonb)
     WHERE id = (SELECT "shootId" FROM reveal_access WHERE "linkId" = ${linkId}::uuid)`;
}
