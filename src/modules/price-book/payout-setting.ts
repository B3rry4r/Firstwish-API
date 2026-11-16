import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../common/db/prisma.service";
import type { PayoutSetting } from "../../contracts";
import { DEFAULT_RUN_DAY, dayWords, isRunDay } from "../payouts/run-day";

const PAYOUT_SETTING_KEY = "payout.thresholdKobo";

/**
 * HW4 (R14): the creators' payout threshold and the day of the month the payout run starts, as the price book holds them, with the
 * PROVISIONAL mark until the owner confirms. The price-book read serves this and the payout run acts on the same setting row.
 * Null when the book has no such setting yet.
 */
export async function readPayoutSetting(db: PrismaService | Prisma.TransactionClient): Promise<PayoutSetting | null> {
  const rows = await db.$queryRaw<{ choice: Prisma.JsonValue }[]>`SELECT choice FROM settings WHERE key = to_jsonb(${PAYOUT_SETTING_KEY}::text) ORDER BY id LIMIT 1`;
  if (!rows.length) return null;
  const c = (rows[0].choice ?? {}) as Prisma.JsonObject;
  const day = isRunDay(c.day) ? c.day : DEFAULT_RUN_DAY;
  const status = typeof c.status === "string" ? c.status : "PROVISIONAL";
  return {
    thresholdKobo: typeof c.value === "number" ? c.value : 0,
    day,
    schedule: typeof c.schedule === "string" && c.schedule ? c.schedule : dayWords(day),
    status,
    provisional: status !== "CONFIRMED",
  };
}
