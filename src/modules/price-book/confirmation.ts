import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../common/db/prisma.service";

/** R14, IE3: whether a setting is still provisional and who confirmed it, in one shape for every provisional setting of the staff Prices read. */
export interface Confirmation {
  provisional: boolean;
  /** "owner" once the owner has made or confirmed the figure; null while it is provisional */
  confirmedBy: "owner" | null;
  /** when the owner confirmed it (ISO-8601); null while provisional, and for a figure confirmed before the time was kept */
  confirmedAt: string | null;
}

export const CONFIRMED = "CONFIRMED";
export const PROVISIONAL = "PROVISIONAL";

/** What a setting row's `choice` says: provisional unless its status is CONFIRMED (only the owner's change writes that). */
export function confirmationOf(choice: Prisma.JsonValue | null | undefined): Confirmation {
  const c = (choice && typeof choice === "object" && !Array.isArray(choice) ? choice : {});
  const provisional = c.status !== CONFIRMED;
  return {
    provisional,
    confirmedBy: provisional ? null : "owner",
    confirmedAt: provisional || typeof c.confirmedAt !== "string" ? null : c.confirmedAt,
  };
}

/** The settings row that holds a limit's confirmation (a limit with no row is provisional). */
export async function readLimitConfirmation(db: PrismaService | Prisma.TransactionClient, key: string): Promise<{ id: string | null; choice: Prisma.JsonObject; confirmation: Confirmation }> {
  const rows = await db.$queryRaw<{ id: string; choice: Prisma.JsonValue }[]>`SELECT id, choice FROM settings WHERE key = to_jsonb(${key}::text) ORDER BY id LIMIT 1`;
  const choice = (rows[0]?.choice && typeof rows[0].choice === "object" && !Array.isArray(rows[0].choice) ? rows[0].choice : {});
  return { id: rows[0]?.id ?? null, choice, confirmation: confirmationOf(choice) };
}
