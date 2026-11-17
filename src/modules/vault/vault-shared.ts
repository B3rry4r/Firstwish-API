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
