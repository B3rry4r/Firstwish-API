-- API-BASE-15 (IJ2). Additive: one nullable column. A wish keeps the level its style had when the wish took it, so a later raise by staff
-- changes nothing for a wish that already holds the style (no more is charged, nothing is refunded).
ALTER TABLE "wish" ADD COLUMN IF NOT EXISTS "styleTakenLevel" TEXT;

-- Wishes already made: the style's level now. Run twice it changes nothing: only rows with no level are filled.
UPDATE "wish" w SET "styleTakenLevel" = s."level" FROM "style" s
 WHERE s."slug" = w."styleSlug" AND w."styleTakenLevel" IS NULL AND s."level" IN ('starter', 'standard', 'premium');
