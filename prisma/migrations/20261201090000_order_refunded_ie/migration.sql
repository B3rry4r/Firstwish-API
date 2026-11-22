-- API-BASE-10 patch (IE1 to IE3). Additive only.
-- IE3: a refunded Concierge order reads as refunded, not paid.
ALTER TYPE "ConciergeOrderStatus" ADD VALUE IF NOT EXISTS 'refunded';
-- IE3: days after an unpaid order last changed that the files given with it are removed (PROVISIONAL, the owner may change it).
ALTER TABLE "lifecycle_config" ADD COLUMN IF NOT EXISTS "conciergeFilesDays" INTEGER NOT NULL DEFAULT 30;
