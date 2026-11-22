-- API-BASE-12 (IF8). Data only, additive: no column or table changes.
-- A style whose creator document names a handle and holds no creatorId gets the creatorId of the creator that handle belongs to. The match is the
-- account that holds the handle now, when that account (with a creator row) already existed when the style was added and no review of the style
-- belongs to another creator. A handle that matches nobody (no such account, an account made after the style, a review of another creator) is left
-- as it was and named in a notice, so the list of what stayed can be read from the migration's output.
DO $$
DECLARE
  moved integer;
  left_over record;
BEGIN
  WITH found AS (
    SELECT s.id AS style_id, c.id AS creator_id
      FROM "style" s
      JOIN "account" a ON lower(a.handle) = lower(btrim(s.creator ->> 'handle', ' @'))
      JOIN "creator" c ON c."accountId" = a.id
     WHERE jsonb_typeof(s.creator) = 'object'
       AND coalesce(btrim(s.creator ->> 'handle', ' @'), '') <> ''
       AND coalesce(s.creator ->> 'creatorId', s.creator ->> 'id', '') = ''
       AND (s."addedAt" IS NULL OR a."createdAt" <= s."addedAt")
       AND NOT EXISTS (SELECT 1 FROM "style_submission" ss WHERE ss."styleId" = s.id AND ss."creatorId" <> c.id)
  ), done AS (
    UPDATE "style" s SET creator = s.creator || jsonb_build_object('creatorId', f.creator_id::text)
      FROM found f WHERE s.id = f.style_id
    RETURNING s.id
  )
  SELECT count(*) INTO moved FROM done;
  RAISE NOTICE 'style creators backfilled: %', moved;
  FOR left_over IN
    SELECT s.slug, s.creator ->> 'handle' AS handle FROM "style" s
     WHERE jsonb_typeof(s.creator) = 'object' AND coalesce(btrim(s.creator ->> 'handle', ' @'), '') <> ''
       AND coalesce(s.creator ->> 'creatorId', s.creator ->> 'id', '') = ''
     ORDER BY s.slug
  LOOP
    RAISE NOTICE 'style % keeps handle % (no creator held it when the style was made)', left_over.slug, left_over.handle;
  END LOOP;
END $$;
