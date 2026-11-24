-- IM1 (round 23): when a stored picture was re-made without metadata (no GPS, no camera serial). Additive and nullable: every file stored before this round keeps null
-- (a job and the first read clean it; until then no one else is given it).
ALTER TABLE "stored_file" ADD COLUMN IF NOT EXISTS "cleanAt" TIMESTAMPTZ(3);

-- DOWN (by hand; it loses only the marks, so every picture would be cleaned again the first time it is read):
--   ALTER TABLE "stored_file" DROP COLUMN "cleanAt";
