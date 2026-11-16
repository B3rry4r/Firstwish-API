-- API-BASE-7 (HW2, HW3, HW6): Studio files and the creator's picture, Signed off and the Creator plan's end, the book's own limits. Additive only.
-- A file may name a style that is still a Studio draft (the draft and the style it becomes share one id), so the file's style id is a key to the Studio style table
-- (the row a draft is and the row it stays once approved), not to the catalogue's style table. When that row goes the file keeps no style (SET NULL).
ALTER TABLE "stored_file" DROP CONSTRAINT IF EXISTS "stored_file_styleId_fkey";
UPDATE "stored_file" SET "styleId" = NULL WHERE "styleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "studio_style" s WHERE s."id" = "stored_file"."styleId");
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "studio_style"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TYPE "StoredFilePurpose" ADD VALUE IF NOT EXISTS 'profile-picture';

ALTER TABLE "creator_state" ADD COLUMN "signedUntil" TIMESTAMPTZ(3);
ALTER TABLE "creator_state" ADD COLUMN "signedEnding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "creator_state" ADD COLUMN "planEnding" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lifecycle_config" ADD COLUMN "photoMaxBytes" INTEGER NOT NULL DEFAULT 15728640;
ALTER TABLE "lifecycle_config" ADD COLUMN "soundMaxBytes" INTEGER NOT NULL DEFAULT 10485760;
ALTER TABLE "lifecycle_config" ADD COLUMN "modelMaxBytes" INTEGER NOT NULL DEFAULT 15728640;
ALTER TABLE "lifecycle_config" ADD COLUMN "conciergeDeliveryHours" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "lifecycle_config" ADD COLUMN "unopenedDays" INTEGER NOT NULL DEFAULT 365;

-- A creator already Signed has no paid day yet: Signed runs from their last Signed payment's paid day for the paid period (the book's Signed days, 30 when it names none);
-- with no such payment, from the day this migration runs. So turning Signed off works for them (HW3).
UPDATE "creator_state" c SET "signedUntil" =
  COALESCE(
    (SELECT COALESCE(p."fulfilledAt", p."verifiedAt", p."createdAt") FROM "payment" p
      WHERE p."accountId" = c."accountId" AND p."purpose" = 'signed' AND p."status" IN ('succeeded', 'partly-refunded')
      ORDER BY COALESCE(p."fulfilledAt", p."verifiedAt", p."createdAt") DESC, p."id" DESC LIMIT 1),
    now()
  ) + make_interval(days => COALESCE(NULLIF((SELECT e."creator" -> 'signed' ->> 'days' FROM "entitlements" e ORDER BY e."id" DESC LIMIT 1), '')::int, 30))
 WHERE c."signed" = true AND c."signedUntil" IS NULL;
