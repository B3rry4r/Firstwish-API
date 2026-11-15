import { Prisma } from "@prisma/client";
import type { Creator } from "../../contracts";

/** A creator as anyone may see it: public fields only (no email, phone, dates, credits or money). */
export type PublicCreator = Pick<Creator, "id" | "handle" | "name" | "line" | "href" | "following"> & {
  img: string | null;
  house: boolean;
  own: boolean;
  counts: { followers: number | null; wishes: number | null; styles: number | null };
};

export interface PublicCreatorRow {
  creatorId: string;
  accountId: string;
  handle: string;
  name: string | null;
  accountName: string | null;
  line: string | null;
  bio: string | null;
  img: string | null;
  followers: bigint;
}

type Db = Prisma.TransactionClient | { $queryRaw: Prisma.TransactionClient["$queryRaw"] };

/*
 * One rule for "this creator's page is public", used by every public read and by follow: the account has the creator side on,
 * a creator row, a handle, is not erased and has no account ban in force. Anything else reads as not there (one 404 for
 * "missing" and "hidden").
 */
const VISIBLE = (now: Date) => Prisma.sql`
  'creator' = ANY(a.sides) AND a."erasedAt" IS NULL AND a.handle IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ban b WHERE b."accountId" = a.id AND b.scope = 'account' AND (b.until IS NULL OR b.until > ${now}))`;

const SELECT = Prisma.sql`
  SELECT c.id AS "creatorId", a.id AS "accountId", a.handle, c.name, a.name AS "accountName", c.line, a.bio, c.img,
    (SELECT count(*) FROM follow f JOIN account fa ON fa.id = f."accountId" WHERE f.handle = a.handle AND fa."erasedAt" IS NULL) AS followers
  FROM creator c JOIN account a ON a.id = c."accountId"`;

export async function findPublicCreator(db: Db, handle: string, now: Date): Promise<PublicCreatorRow | null> {
  const rows = await db.$queryRaw<PublicCreatorRow[]>`${SELECT} WHERE lower(a.handle) = ${handle} AND ${VISIBLE(now)} LIMIT 1`;
  return rows[0] ?? null;
}

/** Visible creators after a creator id (ids are UUIDv7, so this is join order), at most `take`. */
export async function listPublicCreators(db: Db, after: string | null, take: number, now: Date): Promise<PublicCreatorRow[]> {
  const cursor = after ? Prisma.sql`AND c.id > ${after}::uuid` : Prisma.empty;
  return db.$queryRaw<PublicCreatorRow[]>`${SELECT} WHERE ${VISIBLE(now)} ${cursor} ORDER BY c.id ASC LIMIT ${take}`;
}

export function toPublicCreator(r: PublicCreatorRow, viewer: { accountId: string | null; follows: ReadonlySet<string> }): PublicCreator {
  return {
    id: r.creatorId,
    handle: r.handle,
    name: r.name ?? r.accountName ?? `@${r.handle}`,
    line: r.line ?? r.bio ?? "",
    href: `/creators/${r.handle}`,
    img: r.img,
    house: false,
    own: viewer.accountId === r.accountId,
    following: viewer.follows.has(r.handle),
    counts: { followers: Number(r.followers), wishes: null, styles: null },
  };
}
