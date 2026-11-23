-- API-BASE-21 (IL1a): a video clip's length is read from the stored file when it is confirmed and kept here, in milliseconds, so the clip rules
-- (count and length per ticket) can be judged at the upload, the seal and the ticket start. Additive and nullable: every other file keeps null.
ALTER TABLE "stored_file" ADD COLUMN IF NOT EXISTS "lengthMs" INTEGER;

-- DOWN (by hand; it loses only the lengths, which are read again from the files if the column is added back):
--   ALTER TABLE "stored_file" DROP COLUMN "lengthMs";
