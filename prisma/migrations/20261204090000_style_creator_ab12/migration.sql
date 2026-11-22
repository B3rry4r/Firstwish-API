-- API-BASE-12 (IH1, IF4a). Data only, additive: no column or table changes.
-- A style whose creator document names a handle and holds no creatorId is tied to a creator's account ONLY on proof that this account made it:
-- a style_submission of that style by that creator (one creator only, an account that is not erased). A handle proves nothing, because handles
-- change hands. Every other style stays untied: no royalty is routed for it. Each one is named in a notice (style id, slug, the handle it carries)
-- and is listed for staff by the admin styles read (E-193, GET /v1/admin/styles: its `creator` carries the handle and no creatorId) to tie by hand.
DO $$
DECLARE
  moved integer;
  left_over record;
BEGIN
  WITH proof AS (
    SELECT ss."styleId" AS style_id, (array_agg(DISTINCT ss."creatorId"))[1] AS creator_id
      FROM "style_submission" ss
      JOIN "creator" c ON c.id = ss."creatorId"
      JOIN "account" a ON a.id = c."accountId" AND a."erasedAt" IS NULL
     GROUP BY ss."styleId"
    HAVING count(DISTINCT ss."creatorId") = 1
  ), done AS (
    UPDATE "style" s SET creator = s.creator || jsonb_build_object('creatorId', p.creator_id::text)
      FROM proof p
     WHERE s.id = p.style_id
       AND jsonb_typeof(s.creator) = 'object'
       AND coalesce(btrim(s.creator ->> 'handle', ' @'), '') <> ''
       AND coalesce(s.creator ->> 'creatorId', s.creator ->> 'id', '') = ''
    RETURNING s.id
  )
  SELECT count(*) INTO moved FROM done;
  RAISE NOTICE 'style creators tied on proof: %', moved;
  FOR left_over IN
    SELECT s.id, s.slug, s.creator ->> 'handle' AS handle FROM "style" s
     WHERE jsonb_typeof(s.creator) = 'object' AND coalesce(btrim(s.creator ->> 'handle', ' @'), '') <> ''
       AND coalesce(s.creator ->> 'creatorId', s.creator ->> 'id', '') = ''
     ORDER BY s.slug
  LOOP
    RAISE NOTICE 'style % (%) is untied: it carries handle % and no proof of who made it', left_over.id, left_over.slug, left_over.handle;
  END LOOP;
END $$;
