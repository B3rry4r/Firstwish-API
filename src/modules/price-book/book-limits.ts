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
  /** days after its open time that a sealed wish nobody opens is put to rest (it is erased after the resting hold, HOLD_DAYS); an erase itself happens at once and has no period (HX2) */
  unopenedDays: number;
  /** days after an order that was never paid last changed that the files given with it are removed (IE3, PROVISIONAL: the owner may change it) */
  conciergeFilesDays: number;
}

export const DEFAULT_LIMITS: Readonly<BookLimits> = {
  photoMaxBytes: 15 * 1024 * 1024,
  soundMaxBytes: 10 * 1024 * 1024,
  modelMaxBytes: 15 * 1024 * 1024,
  conciergeDeliveryHours: 3,
  unopenedDays: 365,
  conciergeFilesDays: 30,
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
    conciergeFilesDays: r.conciergeFilesDays,
  };
}

const MB = 1024 * 1024;

/** One limit as staff Prices lists and changes it (HX1): its line key, the lifecycle column, what it is called, its unit and the range a change may take. */
export interface LimitLine {
  key: string;
  field: keyof BookLimits;
  name: string;
  unit: "bytes" | "hours" | "days";
  min: number;
  max: number;
}

export const LIMIT_LINES: readonly LimitLine[] = [
  { key: "limits.photoMaxBytes", field: "photoMaxBytes", name: "Largest picture, poster, cover or profile picture", unit: "bytes", min: MB, max: 200 * MB },
  { key: "limits.soundMaxBytes", field: "soundMaxBytes", name: "Largest Studio sound", unit: "bytes", min: MB, max: 200 * MB },
  { key: "limits.modelMaxBytes", field: "modelMaxBytes", name: "Largest Studio 3D model", unit: "bytes", min: MB, max: 200 * MB },
  { key: "limits.conciergeDeliveryHours", field: "conciergeDeliveryHours", name: "Concierge delivery, in hours", unit: "hours", min: 1, max: 720 },
  { key: "limits.unopenedDays", field: "unopenedDays", name: "Days a sealed wish nobody opens waits before it rests", unit: "days", min: 1, max: 3650 },
  { key: "limits.conciergeFilesDays", field: "conciergeFilesDays", name: "Days the files of an order never paid are kept (PROVISIONAL, owner)", unit: "days", min: 1, max: 3650 },
];

export const limitLineOf = (key: string): LimitLine | undefined => LIMIT_LINES.find((l) => l.key === key);
