-- API-BASE-7 (HW2, HW3, HW6): Studio files and the creator's picture, Signed off and the Creator plan's end, the book's own limits. Additive only.
-- A file may name a style that is still a Studio draft (the draft and the style it becomes share one id), so the file's style id is no longer a key to the style table.
ALTER TABLE "stored_file" DROP CONSTRAINT IF EXISTS "stored_file_styleId_fkey";
ALTER TYPE "StoredFilePurpose" ADD VALUE IF NOT EXISTS 'profile-picture';

ALTER TABLE "creator_state" ADD COLUMN "signedUntil" TIMESTAMPTZ(3);
ALTER TABLE "creator_state" ADD COLUMN "signedEnding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "creator_state" ADD COLUMN "planEnding" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lifecycle_config" ADD COLUMN "photoMaxBytes" INTEGER NOT NULL DEFAULT 15728640;
ALTER TABLE "lifecycle_config" ADD COLUMN "soundMaxBytes" INTEGER NOT NULL DEFAULT 10485760;
ALTER TABLE "lifecycle_config" ADD COLUMN "modelMaxBytes" INTEGER NOT NULL DEFAULT 15728640;
ALTER TABLE "lifecycle_config" ADD COLUMN "conciergeDeliveryHours" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "lifecycle_config" ADD COLUMN "unopenedDays" INTEGER NOT NULL DEFAULT 365;
