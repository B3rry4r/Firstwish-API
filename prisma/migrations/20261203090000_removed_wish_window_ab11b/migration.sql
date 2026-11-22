-- API-BASE-11B (IF4, DEC-285). Additive only.
-- The instant until which a wish its owner removed can be brought back.
ALTER TABLE "wish" ADD COLUMN IF NOT EXISTS "restorableUntil" TIMESTAMPTZ(3);

-- A wish removed by its owner before this change has its window start now: the price book's days from the migration.
UPDATE "wish" w
   SET "restorableUntil" = now() + COALESCE((SELECT COALESCE(c."RESTORE_DAYS", c."restoreWindowDays") FROM "lifecycle_config" c ORDER BY c.id DESC LIMIT 1), 30) * interval '1 day'
 WHERE w.status = 'removed' AND w."erasedAt" IS NULL AND w."restorableUntil" IS NULL
   AND (SELECT t.cause FROM "wish_transition" t WHERE t."wishId" = w.id AND t."to" = 'taken_down' ORDER BY t.id DESC LIMIT 1) = 'owner.remove';

-- ... and the erase job waits for that day.
INSERT INTO "job" (id, type, "subjectId", "runAt", status, attempts, "createdAt")
SELECT gen_random_uuid(), 'restore-window-end', w.id::text, w."restorableUntil", 'scheduled', 0, now()
  FROM "wish" w WHERE w."restorableUntil" IS NOT NULL
ON CONFLICT (type, "subjectId") DO UPDATE SET "runAt" = EXCLUDED."runAt", status = 'scheduled', attempts = 0;

-- IF6: a listed row carries the style's name, not its slug twice (rows listed before this change took the slug as the name).
UPDATE "published_wish" pw SET "styleName" = s.name
  FROM "style" s WHERE s.slug = pw.style AND pw."styleName" = pw.style AND s.name IS NOT NULL;
