-- API-BASE-9 patch (IC2): a heart belongs to a FILE, never to a place in a list. reveal_access.hearts held the positions marked in the link's file
-- list; it now holds the ids of the marked files. The positions already stored are moved to the file ids at those places (a position past the
-- end of the list, or one whose entry is not a file id, is dropped).
ALTER TABLE "reveal_access" ADD COLUMN "heartFiles" UUID[] NOT NULL DEFAULT '{}';
UPDATE "reveal_access" a
   SET "heartFiles" = COALESCE((
     SELECT array_agg(DISTINCT (a."fileIds" ->> h)::uuid)
       FROM unnest(a."hearts") AS h
      WHERE (a."fileIds" ->> h) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '{}')
 WHERE cardinality(a."hearts") > 0;
ALTER TABLE "reveal_access" DROP COLUMN "hearts";
ALTER TABLE "reveal_access" RENAME COLUMN "heartFiles" TO "hearts";
