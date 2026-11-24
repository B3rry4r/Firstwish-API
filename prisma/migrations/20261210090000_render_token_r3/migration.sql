-- R3: the one-use token a video render reads its wish with. Only the HMAC of the token is kept (never the token), with its expiry and the
-- moment it was used. Additive and nullable: every existing row keeps null (no live token).
ALTER TABLE "render_job" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;
ALTER TABLE "render_job" ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMPTZ(3);
ALTER TABLE "render_job" ADD COLUMN IF NOT EXISTS "tokenUsedAt" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX IF NOT EXISTS "render_job_tokenHash_key" ON "render_job"("tokenHash");

-- DOWN (by hand; it loses only live tokens, which a render mints again when its run starts):
--   DROP INDEX "render_job_tokenHash_key";
--   ALTER TABLE "render_job" DROP COLUMN "tokenUsedAt", DROP COLUMN "tokenExpiresAt", DROP COLUMN "tokenHash";
