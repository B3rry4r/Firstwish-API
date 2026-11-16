import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../common/db/prisma.service";

/**
 * HW6: the limits the price book holds in its lifecycle row. The read that serves them (GET /v1/price-book) and every piece of code that
 * acts on them read this one row; the numbers below are only what a database with no row falls back to.
 */
export interface BookLimits {
  /** the most one picture, poster, cover or profile picture may weigh (bytes) */
  photoMaxBytes: number;
  /** the most one Studio sound may weigh (bytes) */
  soundMaxBytes: number;
  /** the most one Studio 3D model may weigh (bytes) */
  modelMaxBytes: number;
  /** hours within which one Concierge wish is delivered after it is paid */
  conciergeDeliveryHours: number;
  /** days a sealed wish nobody opens waits after its open time before it is erased */
  unopenedDays: number;
}

export const DEFAULT_LIMITS: Readonly<BookLimits> = {
  photoMaxBytes: 15 * 1024 * 1024,
  soundMaxBytes: 10 * 1024 * 1024,
  modelMaxBytes: 15 * 1024 * 1024,
  conciergeDeliveryHours: 3,
  unopenedDays: 365,
};

type Db = PrismaService | Prisma.TransactionClient;

export async function readLimits(db: Db): Promise<BookLimits> {
  const r = await db.lifecycleConfig.findFirst({ orderBy: { id: "desc" } });
  if (!r) return { ...DEFAULT_LIMITS };
  return {
    photoMaxBytes: r.photoMaxBytes,
    soundMaxBytes: r.soundMaxBytes,
    modelMaxBytes: r.modelMaxBytes,
    conciergeDeliveryHours: r.conciergeDeliveryHours,
    unopenedDays: r.unopenedDays,
  };
}
