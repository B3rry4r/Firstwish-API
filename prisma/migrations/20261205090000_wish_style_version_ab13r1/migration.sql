-- API-BASE-13 round 1 (II3). Additive: one nullable column. A wish keeps the approved Studio submission it was made under.
ALTER TABLE "wish" ADD COLUMN IF NOT EXISTS "styleSubmissionId" UUID;
CREATE INDEX IF NOT EXISTS "wish_styleSubmissionId_idx" ON "wish"("styleSubmissionId");
DO $$ BEGIN
  ALTER TABLE "wish" ADD CONSTRAINT "wish_styleSubmissionId_fkey" FOREIGN KEY ("styleSubmissionId") REFERENCES "style_submission"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Wishes already made in a Studio style: the submission approved when the wish was made (the newest approved one made no later than the wish's
-- creation); where that cannot be known (the wish is older than every approved submission, or the approval's time was not kept), the earliest approved one.
-- A submission's own time is its creation, so "approved at that time" is read as "sent in before the wish was made", the best the rows say.
-- Run twice it changes nothing: only rows with no pointer are filled.
DO $$
DECLARE
  by_time integer;
  by_earliest integer;
BEGIN
  WITH pick AS (
    SELECT w.id AS wish_id,
           (SELECT s.id FROM style_submission s JOIN style st ON st.id = s."styleId"
             WHERE st.slug = w."styleSlug" AND s.status = 'live' AND s."createdAt" <= w."createdAt"
             ORDER BY s."createdAt" DESC, s.id DESC LIMIT 1) AS sub_id
      FROM wish w WHERE w."styleSubmissionId" IS NULL
  ), done AS (
    UPDATE wish w SET "styleSubmissionId" = p.sub_id FROM pick p WHERE w.id = p.wish_id AND p.sub_id IS NOT NULL RETURNING w.id
  )
  SELECT count(*) INTO by_time FROM done;
  WITH done AS (
    UPDATE wish w SET "styleSubmissionId" = (
        SELECT s.id FROM style_submission s JOIN style st ON st.id = s."styleId"
         WHERE st.slug = w."styleSlug" AND s.status = 'live' ORDER BY s."createdAt" ASC, s.id ASC LIMIT 1)
     WHERE w."styleSubmissionId" IS NULL
       AND EXISTS (SELECT 1 FROM style_submission s JOIN style st ON st.id = s."styleId" WHERE st.slug = w."styleSlug" AND s.status = 'live')
    RETURNING w.id
  )
  SELECT count(*) INTO by_earliest FROM done;
  RAISE NOTICE 'wishes tied to the style version they were made under: % by time, % to the earliest approved version', by_time, by_earliest;
END $$;
